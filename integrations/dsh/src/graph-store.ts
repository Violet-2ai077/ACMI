import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type {
  EventRef, GraphAppendReceipt, GraphEventDraft, GraphEventRecord, GraphProposal, GraphStreamCut, GraphStreamReader, GraphStreamWriter,
  RuntimeAttribution, RuntimeCursor, RuntimeFact, RuntimeSessionRef, ScopeAuthority, StoredGraphEvent, StoredRuntimeFact,
  TaskGraphEvent, UnderstandingInput, UnderstandingProposal, UnderstandingReviewReceipt, WorkspaceScope,
} from '@acmi/contracts'
import {
  boundedText, canonical, createScopeAuthority, exactFields, graphEventLimit, isEventRef, isTaskId, runtimeIdentity,
  analyzeUnderstanding, isUnderstandingTrigger, proposeGraphChanges, TaskGraph, type TaskGraphCheckpoint, understandingDefaultBudget,
  understandingFactLimit, understandingOutputLimit, understandingTopologyRisk, validateRuntimeFact,
} from '@acmi/core'
import { connectGraphRoot, GraphStoreError, pathsOverlap, translateGraphError } from './graph-store-db.ts'
import { continuityDigest as sha } from './local-digest.ts'
import { isSnapshotReservation, type SnapshotReservation } from './snapshot-guard.ts'
import { digestId, enableUnderstanding, validUnderstandingRequest, type SavedUnderstanding, type SavedUnderstandingReview,
  type UnderstandingCursorMove, type UnderstandingInboxItem, type UnderstandingPage, type UnderstandingRequest,
  type UnderstandingReviewCommand } from './understanding-host.ts'

const zero = '0'.repeat(64)
const capTasks = 64
const capFacts = 65_536
const capSessions = 256
const maxPage = 128
const maxBytes = 262_144
type Permits = Pick<ScopeAuthority, 'permits'>
export interface GraphStoreOptions {
  readonly root: string
  readonly workspaceId: string
  readonly read: Permits
  readonly write: Permits
  readonly maxPages?: number
  readonly understanding?: true
}
export interface RuntimeWorkAssignment {
  readonly taskId: string
  readonly nodeId: string
  readonly parentExecutionId?: string
}
interface State { readonly graph: TaskGraph; revision: string; through: number; cut?: GraphStreamCut }
export type ReviewReceipt = { readonly status: 'accepted' | 'rejected'; readonly proposalId: string; readonly revision: string }
interface SavedCheckpoint {
  readonly version: 'stream-checkpoint-v1'
  readonly anchor: string
  readonly graph: TaskGraphCheckpoint
  readonly observedAt: string
}
const time = () => new Date().toISOString()
const expectNumber = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

function readChecked<T>(row: { body?: unknown; hash?: unknown }, limit = maxBytes): T {
  if (typeof row.body !== 'string' || row.body.length > limit || typeof row.hash !== 'string' || sha(row.body) !== row.hash) {
    throw new GraphStoreError('corrupt')
  }
  try { return JSON.parse(row.body) as T } catch { throw new GraphStoreError('corrupt') }
}
const fail = (code: ConstructorParameters<typeof GraphStoreError>[0]): never => { throw new GraphStoreError(code) }
const encode = (value: unknown, limit = maxBytes): string => {
  try {
    const data = canonical(value)
    return data.length <= limit ? data : fail('limit')
  } catch (error) { throw error instanceof GraphStoreError ? error : new GraphStoreError('invalid') }
}

/** Host-only transaction adapter. Never expose the writer object or writer grant to model tools. */
export class LocalGraphStore implements GraphStreamReader, GraphStreamWriter {
  readonly #options: GraphStoreOptions
  readonly #db: DatabaseSync
  readonly #authority = createScopeAuthority()
  readonly #scope: WorkspaceScope
  readonly #states = new Map<string, State>()
  readonly #brokenTasks = new Set<string>()
  #closed = false
  #replayed = 0
  #factCount: number
  #sessionCount: number

  constructor(options: GraphStoreOptions) {
    this.#options = { ...options }
    this.#scope = this.#authority.grant(options.workspaceId)
    try {
      this.#db = connectGraphRoot(options.root, options.workspaceId, options.maxPages)
      try {
        this.#factCount = Number(this.#db.prepare('SELECT count(*) AS n FROM runtime_fact').get()?.n)
        this.#sessionCount = Number(this.#db.prepare('SELECT count(*) AS n FROM runtime_cursor').get()?.n)
        if (this.#factCount > capFacts || this.#sessionCount > capSessions) fail('limit')
        if (options.understanding === true) enableUnderstanding(this.#db)
      } catch (error) {
        this.#db.close()
        throw error
      }
    } catch (error) { throw translateGraphError(error) }
  }

  get workspaceId(): string { return this.#options.workspaceId }
  permits(scope: WorkspaceScope): boolean { return !this.#closed && this.#options.read.permits(scope, this.workspaceId) }
  permitsWrite(scope: WorkspaceScope): boolean { return !this.#closed && this.#options.write.permits(scope, this.workspaceId) }
  isSeparateFrom(path: string): boolean { return !pathsOverlap(this.#options.root, path) }
  #writable(scope: WorkspaceScope): void {
    if (this.#closed) fail('closed')
    if (!this.permitsWrite(scope)) fail('unavailable')
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#states.clear()
    this.#db.close()
  }
  metrics() { return { replayed: this.#replayed } }
  snapshotReservations(writer: WorkspaceScope): SnapshotReservation[] {
    this.#writable(writer)
    const rows = this.#all('SELECT * FROM snapshot_reservation ORDER BY session LIMIT 257')
    if (rows.length > capSessions) fail('limit')
    return rows.map(row => {
      const record = readChecked<SnapshotReservation>(row, 4096)
      if (!isSnapshotReservation(record, this.workspaceId) || record.identity.sessionId !== row.session
        || Number(record.retired) !== row.retired) fail('corrupt')
      return record
    })
  }
  reserveSnapshot(writer: WorkspaceScope, record: SnapshotReservation): void {
    this.#writable(writer)
    if (!isSnapshotReservation(record, this.workspaceId) || record.retired) fail('invalid')
    this.#tx(() => {
      if (this.#one('SELECT session FROM snapshot_reservation WHERE session=?', record.identity.sessionId)) fail('conflict')
      if (Number(this.#one('SELECT count(*) AS n FROM snapshot_reservation')?.n) >= capSessions) fail('limit')
      const body = encode(record, 4096)
      this.#sql('INSERT INTO snapshot_reservation VALUES (?, ?, ?, 0)', record.identity.sessionId, body, sha(body))
    })
  }
  retireSnapshot(writer: WorkspaceScope, sessionId: string): void {
    this.#writable(writer)
    this.#tx(() => {
      const row = this.#one('SELECT * FROM snapshot_reservation WHERE session=?', sessionId) ?? fail('unavailable')
      const record = readChecked<SnapshotReservation>(row, 4096)
      if (!isSnapshotReservation(record, this.workspaceId) || record.identity.sessionId !== sessionId
        || Number(record.retired) !== row.retired) fail('corrupt')
      const body = encode({ ...record, retired: true }, 4096)
      this.#sql('UPDATE snapshot_reservation SET body=?,hash=?,retired=1 WHERE session=?', body, sha(body), sessionId)
    })
  }
  #one(sql: string, ...args: SQLInputValue[]) { return this.#db.prepare(sql).get(...args) }
  #all(sql: string, ...args: SQLInputValue[]) { return this.#db.prepare(sql).all(...args) }
  #sql(sql: string, ...args: SQLInputValue[]) { this.#db.prepare(sql).run(...args) }
  #tx<T>(fn: () => T): T {
    try {
      this.#db.exec('BEGIN IMMEDIATE')
      const result = fn()
      this.#db.exec('COMMIT')
      return result
    } catch (error) {
      this.#states.clear()
      try { if (this.#db.isTransaction) this.#db.exec('ROLLBACK') } catch { this.close() }
      throw translateGraphError(error)
    }
  }
  #newGraph(taskId: string) { return new TaskGraph({ taskId, workspaceId: this.workspaceId, authority: this.#authority, digest: sha }) }
  #readEvent(taskId: string, row: { body?: unknown; hash?: unknown; seq?: unknown }): StoredGraphEvent {
    const env = readChecked<StoredGraphEvent>(row)
    if (env?.version !== 'graph-stream-v1' || env.workspaceId !== this.workspaceId || env.taskId !== taskId
      || env.event?.seq !== row.seq || !boundedText(env.idem, 128) || !/^[a-f0-9]{64}$/u.test(env.previous)) fail('corrupt')
    return env
  }
  #state(taskId: string, useCheckpoint = true): State {
    if (this.#brokenTasks.has(taskId)) return fail('corrupt')
    const cached = this.#states.get(taskId)
    if (cached && useCheckpoint) return cached
    const head = this.#one('SELECT seq, hash FROM graph_event WHERE task=? ORDER BY seq DESC LIMIT 1', taskId)
    const end = head?.seq ?? 0
    if (!expectNumber(end) || Number(end) > graphEventLimit) fail('corrupt')
    const virgin = this.#newGraph(taskId)
    let graph = virgin
    let through = 0
    let revision = zero
    const row = useCheckpoint ? this.#one('SELECT body,hash FROM graph_checkpoint WHERE task=?', taskId) : undefined
    if (row) {
      try {
        const checkpoint = readChecked<SavedCheckpoint>(row, 64 * maxBytes)
        const n = checkpoint.graph.projection.through
        const anchor = this.#one('SELECT seq, body, hash FROM graph_event WHERE task=? AND seq=?', taskId, n)
        if (checkpoint.version === 'stream-checkpoint-v1' && n > 0 && n <= Number(end) && anchor?.hash === checkpoint.anchor) {
          this.#readEvent(taskId, anchor)
          const restored = virgin.restore(this.#scope, checkpoint.graph)
          if (restored) { graph = restored; through = n; revision = checkpoint.anchor }
        }
      } catch { /* Checkpoints are only an optimization; authoritative rows still have to validate. */ }
    }
    while (through < Number(end)) {
      const rows = this.#all('SELECT seq,body,hash FROM graph_event WHERE task=? AND seq>? ORDER BY seq LIMIT ?', taskId, through, maxPage)
      if (rows.length === 0) fail('corrupt')
      for (const next of rows) {
        const env = this.#readEvent(taskId, next)
        if (next.seq !== through + 1 || env.previous !== revision || graph.append(this.#scope, env.event) !== 'applied') fail('corrupt')
        through++
        revision = String(next.hash)
        this.#replayed++
      }
    }
    if (revision !== (head?.hash ?? zero)) fail('corrupt')
    const state: State = { graph, through, revision }
    if (through > 0) this.#states.set(taskId, state)
    return state
  }
  #cut(state: State): GraphStreamCut | null {
    const snapshot = state.graph.read(this.#scope)
    if (!snapshot?.task) return null
    return state.cut ??= Object.freeze({ workspaceId: this.workspaceId, revision: state.revision, snapshot })
  }
  read(scope: WorkspaceScope, taskId: string): GraphStreamCut | null {
    if (!this.permits(scope) || !isTaskId(taskId)) return null
    try { return this.#cut(this.#state(taskId)) } catch (error) { throw translateGraphError(error) }
  }
  /** Explicit maintenance audit of every logical source row, including checkpoint-covered prefixes. */
  audit(scope: WorkspaceScope, taskId: string): GraphStreamCut | null {
    if (!this.permits(scope) || !isTaskId(taskId)) return null
    try { return this.#cut(this.#state(taskId, false)) } catch (error) {
      this.#states.delete(taskId)
      const issue = translateGraphError(error)
      if (issue.code === 'corrupt') this.#brokenTasks.add(taskId)
      throw issue
    }
  }
  /** Dynamic context may only use a prepared in-memory cut. No disk or source Journal I/O. */
  peek(scope: WorkspaceScope, taskId: string): GraphStreamCut | null {
    const state = this.permits(scope) ? this.#states.get(taskId) : undefined
    return state ? this.#cut(state) : null
  }
  #append(taskId: string, draft: GraphEventDraft, provenance: StoredGraphEvent['provenance'], expected?: string, proposalId?: string): GraphAppendReceipt {
    if (!isTaskId(taskId) || !draft || !boundedText(draft.key, 128) || !isEventRef(draft.source) || !draft.change
      || draft.source.session.instanceId !== this.workspaceId || !exactFields(draft.source, ['session', 'sourceRevision', 'localSeq'])
      || !exactFields(draft.source.session, ['adapterId', 'instanceId', 'sessionId', 'incarnation'])
      || Object.keys(draft.change).some(k => ['id', 'seq', 'source', 'after'].includes(k))) return fail('invalid')
    const existing = this.#one('SELECT seq,body,hash FROM graph_event WHERE task=? AND idem=?', taskId, draft.key)
    const id = sha(canonical([this.workspaceId, taskId, draft.key]))
    if (existing) {
      const env = this.#readEvent(taskId, existing)
      const { id: priorId, seq, source, ...change } = env.event
      if (priorId !== id || env.provenance !== provenance || env.proposalId !== proposalId
        || canonical([change, source]) !== canonical([draft.change, draft.source])) return fail('conflict')
      return { status: 'duplicate', sequence: seq, revision: String(existing.hash), eventId: id }
    }
    if (draft.source.session.adapterId === 'dsh') {
      const row = this.#one('SELECT body,hash FROM runtime_fact WHERE session=? AND seq=? AND task=?',
        runtimeIdentity(draft.source.session), draft.source.localSeq, taskId)
      if (!row || canonical(readChecked<StoredRuntimeFact>(row, 8192).fact.source) !== canonical(draft.source)) return fail('invalid')
    }
    const state = this.#state(taskId)
    if (expected !== undefined && expected !== state.revision) return fail('revision')
    if (state.through >= graphEventLimit || (state.through === 0 && this.#states.size >= capTasks)) return fail('limit')
    if (state.through === 0 && Number(this.#one('SELECT count(*) AS n FROM graph_event WHERE seq=1')?.n) >= capTasks) return fail('limit')
    const seq = state.through + 1
    const event = { ...draft.change, id, seq, source: draft.source } as TaskGraphEvent
    const env: StoredGraphEvent = { version: 'graph-stream-v1', workspaceId: this.workspaceId, taskId, event, idem: draft.key,
      previous: state.revision, observedAt: time(), provenance, ...(proposalId ? { proposalId } : {}) }
    const body = encode(env)
    const hash = sha(body)
    if (state.graph.append(this.#scope, event) !== 'applied') return fail('invalid')
    this.#sql('INSERT INTO graph_event VALUES (?,?,?,?,?,?)', taskId, seq, id, draft.key, hash, body)
    state.revision = hash
    state.through = seq
    delete state.cut
    this.#states.set(taskId, state)
    return { status: 'committed', sequence: seq, revision: hash, eventId: id }
  }
  append(scope: WorkspaceScope, taskId: string, draft: GraphEventDraft, expected?: string, signal?: AbortSignal): GraphAppendReceipt {
    this.#writable(scope)
    signal?.throwIfAborted()
    if (draft?.change?.kind === 'runtime-observed') return fail('invalid')
    return this.#tx(() => this.#append(taskId, draft, 'host_confirmed', expected))
  }
  events(scope: WorkspaceScope, taskId: string, after = 0, limit = maxPage): readonly GraphEventRecord[] {
    if (!this.permits(scope) || !isTaskId(taskId)) return []
    if (!expectNumber(after) || !expectNumber(limit) || limit === 0 || limit > maxPage) return fail('limit')
    return this.#all('SELECT seq,body,hash FROM graph_event WHERE task=? AND seq>? ORDER BY seq LIMIT ?', taskId, after, limit)
      .map(row => ({ ...this.#readEvent(taskId, row), hash: String(row.hash) }))
  }
  checkpoint(scope: WorkspaceScope, taskId: string, expected: string): void {
    this.#writable(scope)
    this.#tx(() => {
      if (!isTaskId(taskId)) return fail('unavailable')
      const state = this.#state(taskId)
      if (state.through === 0 || state.revision !== expected) return fail('revision')
      const graph = state.graph.checkpoint(this.#scope) ?? fail('corrupt')
      const payload: SavedCheckpoint = { version: 'stream-checkpoint-v1', anchor: expected, graph, observedAt: time() }
      const body = encode(payload, 64 * maxBytes)
      this.#sql('INSERT INTO graph_checkpoint VALUES (?,?,?) ON CONFLICT(task) DO UPDATE SET body=excluded.body,hash=excluded.hash',
        taskId, body, sha(body))
    })
  }
  #cursor(key: string, start: number): RuntimeCursor {
    const row = this.#one('SELECT body,hash FROM runtime_cursor WHERE session=?', key)
    return row ? readChecked<RuntimeCursor>(row, 2048) : { next: start, bindingRevision: 0 }
  }
  cursor(scope: WorkspaceScope, session: RuntimeSessionRef, start = 0): RuntimeCursor | null {
    if (!this.permits(scope) || session.instanceId !== this.workspaceId || !expectNumber(start)) return null
    return this.#cursor(runtimeIdentity(session), start)
  }
  factAt(scope: WorkspaceScope, session: RuntimeSessionRef, seq: number): StoredRuntimeFact | null {
    if (!this.permits(scope) || session.instanceId !== this.workspaceId || !expectNumber(seq)) return null
    const row = this.#one('SELECT body,hash FROM runtime_fact WHERE session=? AND seq=?', runtimeIdentity(session), seq)
    return row ? readChecked<StoredRuntimeFact>(row, 8192) : null
  }
  childEvidence(scope: WorkspaceScope, parent: RuntimeSessionRef, child: RuntimeSessionRef) {
    if (!this.permits(scope) || [parent, child].some(ref => ref.adapterId !== 'dsh' || ref.instanceId !== this.workspaceId
      || !boundedText(ref.sessionId) || !boundedText(ref.incarnation))) return null
    const key = runtimeIdentity(child)
    const coordinate = (category: string) => this.#one('SELECT seq FROM runtime_lifecycle_latest WHERE session=? AND category=?', key, category)?.seq
    const catalogSeq = this.#one('SELECT seq FROM runtime_child_link WHERE session=? AND child=? AND incarnation=?',
      runtimeIdentity(parent), child.sessionId, child.incarnation)?.seq
    const link = typeof catalogSeq === 'number' ? this.factAt(scope, parent, catalogSeq)?.fact : undefined
    const descriptorSeq = coordinate('descriptor')
    const descriptor = typeof descriptorSeq === 'number' ? this.factAt(scope, child, descriptorSeq)?.fact : undefined
    const catalog = link?.detail
    const local = catalog?.kind === 'subagent-catalog' && (catalog.mode === 'continuable' || catalog.mode === 'one-shot')
      && descriptor?.detail.kind === 'subagent-descriptor' && descriptor.detail.mode === catalog.mode
      && descriptor.detail.parentSessionId === parent.sessionId
    const turnSeq = local ? coordinate('turn') : undefined
    const turn = typeof turnSeq === 'number' ? this.factAt(scope, child, turnSeq)?.fact : undefined
    return { membership: local ? 'confirmed_local' : catalog?.kind === 'subagent-catalog' && catalog.mode === 'external'
      ? 'catalog_external_only' : 'unconfirmed',
    catalog: link?.source ?? null, descriptor: local ? descriptor?.source : null,
    turn: turn ? { kind: turn.detail.kind, source: turn.source } : null,
    scheduler: 'execution_state_unknown_after_restart' as const, acceptance: 'not_inferred' as const }
  }
  #knownTask(taskId: string): boolean {
    return this.#states.has(taskId) || this.#one('SELECT 1 FROM graph_event WHERE task=? AND seq=1', taskId) !== undefined
  }
  facts(scope: WorkspaceScope, taskId: string, limit = 64): readonly StoredRuntimeFact[] {
    if (!this.permits(scope) || !isTaskId(taskId)) return []
    if (!expectNumber(limit) || limit === 0 || limit > maxPage) return fail('limit')
    return this.#all('SELECT body,hash FROM runtime_fact WHERE task=? ORDER BY rowid DESC LIMIT ?', taskId, limit)
      .reverse().map(row => readChecked<StoredRuntimeFact>(row, 8192))
  }
  unassigned(scope: WorkspaceScope, session: RuntimeSessionRef, limit = 64): readonly StoredRuntimeFact[] {
    if (!this.permits(scope) || session.instanceId !== this.workspaceId) return []
    if (!expectNumber(limit) || limit === 0 || limit > maxPage) return fail('limit')
    return this.#all('SELECT body,hash FROM runtime_fact WHERE session=? AND task IS NULL ORDER BY seq DESC LIMIT ?', runtimeIdentity(session), limit)
      .reverse().map(row => readChecked<StoredRuntimeFact>(row, 8192))
  }
  ingest(scope: WorkspaceScope, fact: RuntimeFact, start: number, assignment?: RuntimeWorkAssignment) {
    this.#writable(scope)
    if (!validateRuntimeFact(fact, this.workspaceId, sha) || fact.source.session.instanceId !== this.workspaceId
      || !expectNumber(start) || fact.source.localSeq < start) return fail('invalid')
    const key = runtimeIdentity(fact.source.session)
    const seq = fact.source.localSeq
    const status = this.#tx(() => {
      const cursor = this.#cursor(key, start)
      if (seq < cursor.next) {
        const row = this.#one('SELECT body,hash FROM runtime_fact WHERE session=? AND seq=?', key, seq) ?? fail('corrupt')
        const stored = readChecked<StoredRuntimeFact>(row, 8192)
        if (canonical(stored.fact) !== canonical(fact)) return fail('conflict')
        return { status: 'duplicate' as const, attribution: stored.attribution }
      }
      if (seq > cursor.next) return fail('gap')
      if (cursor.sourceRevision && cursor.sourceRevision !== fact.source.sourceRevision) return fail('revision')
      if (this.#factCount >= capFacts || (!cursor.sourceRevision && this.#sessionCount >= capSessions)) return fail('limit')
      const detail = fact.detail
      let next: RuntimeCursor = { ...cursor, next: seq + 1, sourceRevision: fact.source.sourceRevision }
      let attribution: RuntimeAttribution = { kind: 'unassigned', reason: 'non-task' }
      let causal: string | null = null
      let validTurn = detail.kind === 'turn-open'
      if (detail.kind === 'binding') {
        if (detail.revision !== cursor.bindingRevision + 1) return fail('revision')
        next = { ...next, taskId: detail.taskId, bindingRevision: detail.revision }
      } else if (detail.kind === 'turn-complete' || detail.kind === 'turn-failed' || detail.kind === 'turn-interrupted') {
        const opened = this.#one('SELECT f.body,f.hash FROM runtime_turn t JOIN runtime_fact f ON t.session=f.session AND t.source_seq=f.seq WHERE t.session=? AND t.turn=?',
          key, detail.turn)
        if (!opened) attribution = { kind: 'unassigned', reason: 'missing-cause' }
        else {
          validTurn = true
          const prior = readChecked<StoredRuntimeFact>(opened, 8192)
          attribution = prior.attribution.kind === 'assigned' ? { ...prior.attribution, via: 'original-turn' } : prior.attribution
        }
      } else if (detail.kind === 'tool-result') {
        attribution = { kind: 'unassigned', reason: 'missing-cause' }
        const callRow = detail.callSeq === undefined ? undefined
          : this.#one('SELECT body,hash FROM runtime_fact WHERE session=? AND seq=?', key, detail.callSeq)
        if (callRow) {
          const call = readChecked<StoredRuntimeFact>(callRow, 8192)
          const d = call.fact.detail
          if (d.kind === 'tool-call' && d.turn === detail.turn && d.step === detail.step && d.callId === detail.callId
            && call.fact.source.sourceRevision === fact.source.sourceRevision
            && !this.#one('SELECT 1 FROM runtime_fact WHERE call_key=?', call.fact.eventId)) {
            causal = call.fact.eventId
            attribution = call.attribution.kind === 'assigned' ? { ...call.attribution, via: 'original-call' } : call.attribution
          }
        }
      } else if (detail.kind === 'user' && (!assignment || (cursor.taskId && assignment.taskId !== cursor.taskId))) {
        attribution = { kind: 'unassigned', reason: 'ambiguous-user' }
      } else if (['turn-open', 'turn-complete', 'turn-failed', 'turn-interrupted', 'step-open', 'step-close',
        'assistant', 'tool-call', 'user', 'session-seed-boundary', 'session-end'].includes(detail.kind)) {
        const taskId = cursor.taskId ?? assignment?.taskId
        attribution = !taskId ? { kind: 'unassigned', reason: 'unbound' } : !isTaskId(taskId) || !this.#knownTask(taskId)
          ? { kind: 'unassigned', reason: 'unregistered-task' }
          : { kind: 'assigned', taskId, via: cursor.taskId ? 'explicit-binding' : 'host-source' }
      }
      const observedAt = time()
      const data = encode({ fact, attribution, observedAt } satisfies StoredRuntimeFact, 8192)
      this.#sql('INSERT INTO runtime_fact VALUES (?,?,?,?,?,?,?)', key, seq, fact.eventId,
        attribution.kind === 'assigned' ? attribution.taskId : null, causal, data, sha(data))
      if (detail.kind === 'turn-open') {
        if (this.#one('SELECT 1 FROM runtime_turn WHERE session=? AND turn=?', key, detail.turn)) return fail('conflict')
        this.#sql('INSERT INTO runtime_turn VALUES (?,?,?)', key, detail.turn, seq)
      }
      if (detail.kind === 'subagent-catalog') {
        this.#sql('INSERT OR IGNORE INTO runtime_child_link VALUES (?,?,?,?)',
          key, detail.childId, detail.childIncarnation, seq)
      }
      const category = detail.kind === 'subagent-descriptor' ? 'descriptor'
        : validTurn ? 'turn' : null
      if (category) this.#sql('INSERT INTO runtime_lifecycle_latest VALUES (?,?,?) ON CONFLICT(session,category) DO UPDATE SET seq=excluded.seq',
        key, category, seq)
      if (attribution.kind === 'assigned') {
        const taskId = attribution.taskId
        this.#append(taskId, { key: 'runtime:' + fact.eventId, source: fact.source,
          change: { kind: 'runtime-observed', factId: fact.eventId } }, 'deterministically_derived')
        this.#execution(fact, taskId, assignment?.taskId === taskId ? assignment : undefined)
      }
      const body = encode(next, 2048)
      this.#sql('INSERT INTO runtime_cursor VALUES (?,?,?) ON CONFLICT(session) DO UPDATE SET body=excluded.body,hash=excluded.hash',
        key, body, sha(body))
      return { status: 'committed' as const, attribution, first: !cursor.sourceRevision }
    })
    if (status.status === 'committed') {
      this.#factCount++
      if (status.first) this.#sessionCount++
    }
    return { status: status.status, attribution: status.attribution }
  }
  #execution(fact: RuntimeFact, taskId: string, assignment?: RuntimeWorkAssignment): void {
    const d = fact.detail
    if (!['turn-open', 'turn-complete', 'turn-failed', 'turn-interrupted'].includes(d.kind) || !('turn' in d)) return
    const task = this.#state(taskId).graph.read(this.#scope)
    if (!task || task.task?.closed) return
    const executionId = 'native:' + sha(canonical([runtimeIdentity(fact.source.session), d.turn]))
    const node = assignment ? task.nodes.find(n => n.id === assignment.nodeId) : undefined
    const execution = task.executions.find(e => e.id === executionId)
    const source: EventRef = fact.source
    const key = 'execution:' + fact.eventId
    if (d.kind === 'turn-open' && assignment && node?.state === 'running' && !execution) {
      const parent = assignment.parentExecutionId ? task.executions.find(e => e.id === assignment.parentExecutionId) : undefined
      if (assignment.parentExecutionId && (!parent || !['running', 'waiting', 'idle'].includes(parent.state))) return
      this.#append(taskId, { key, source, change: { kind: 'execution-started', nodeId: node.id,
        executionId, agentId: 'agent:' + sha(runtimeIdentity(source.session)),
        ...(parent ? { parentId: parent.id } : {}) } }, 'deterministically_derived')
    } else if (d.kind !== 'turn-open' && execution && (execution.state === 'running'
      || (d.kind !== 'turn-complete' && execution.state === 'waiting'))) {
      this.#append(taskId, { key, source, change: { kind: 'execution-transitioned', executionId,
        state: d.kind === 'turn-complete' ? 'completed' : d.kind === 'turn-failed' ? 'failed' : 'cancelled' } }, 'deterministically_derived')
    }
  }
  permitsUnderstanding(scope: WorkspaceScope): boolean {
    return this.#options.understanding === true && this.permits(scope)
  }
  #understandingInput(request: UnderstandingRequest, now: number): UnderstandingInput {
    if (!validUnderstandingRequest(request)) return fail('invalid')
    const cut = this.#cut(this.#state(request.taskId)) ?? fail('unavailable')
    const candidates = request.candidates.flatMap(({ taskId, alias }) => {
      const candidate = this.#cut(this.#state(taskId)) ?? fail('unavailable')
      const objective = candidate.snapshot.task?.objective ?? ''
      if (candidate.snapshot.task?.closed) return []
      return [{ taskId, alias, objective: objective.replace(/[\x00-\x1f\x7f]/gu, ' ').slice(0, 512),
        workspaceId: this.workspaceId, revision: candidate.revision }]
    })
    const facts = request.evidenceIds.map(id => {
      const row = this.#one('SELECT body,hash FROM runtime_fact WHERE id=?', id) ?? fail('invalid')
      const stored = readChecked<StoredRuntimeFact>(row, 8192)
      const { fact, attribution } = stored
      if (fact.eventId !== id || !validateRuntimeFact(fact, this.workspaceId, sha)
        || fact.source.session.instanceId !== this.workspaceId
        || !(attribution.kind === 'assigned' && attribution.taskId === request.taskId
          || attribution.kind === 'unassigned' && id === request.anchorId && fact.detail.kind === 'user')
        || id === request.anchorId && request.user && fact.detail.kind !== 'user') return fail('invalid')
      return stored
    })
    return { cut, candidates, facts, anchorId: request.anchorId, now, ttlMs: request.ttlMs ?? 300_000,
      budget: request.budget ?? understandingDefaultBudget,
      ...(request.pending ? { pending: request.pending } : {}), ...(request.user ? { user: request.user } : {}),
      ...(request.currentTaskId ? { currentTaskId: request.currentTaskId } : {}) }
  }
  prepareUnderstanding(scope: WorkspaceScope, request: UnderstandingRequest): UnderstandingInput {
    if (!this.permitsUnderstanding(scope)) return fail('unavailable')
    return this.#understandingInput(request, Date.now())
  }
  #analysisPage(taskId: string, limit: number): UnderstandingPage {
    if (!isTaskId(taskId) || !expectNumber(limit) || limit === 0 || limit > understandingFactLimit) return fail('invalid')
    const after = Number(this.#one('SELECT through FROM understanding_cursor WHERE task=?', taskId)?.through ?? 0)
    const rows = this.#all('SELECT rowid,body,hash FROM runtime_fact WHERE task=? AND rowid>? ORDER BY rowid LIMIT ?', taskId, after, limit)
    return { after, through: Number(rows.at(-1)?.rowid ?? after), facts: rows.map(row => readChecked<StoredRuntimeFact>(row, 8192)) }
  }
  understandingPage(scope: WorkspaceScope, taskId: string, limit = understandingFactLimit): UnderstandingPage {
    if (!this.permitsUnderstanding(scope)) return fail('unavailable')
    return this.#analysisPage(taskId, limit)
  }
  #moveUnderstandingCursor(taskId: string, move: UnderstandingCursorMove, evidenceIds?: readonly string[]): void {
    const page = this.#analysisPage(taskId, move.limit)
    if (page.after !== move.after || page.through !== move.through || page.after === page.through) return fail('revision')
    if (evidenceIds ? canonical(page.facts.map(r => r.fact.eventId)) !== canonical(evidenceIds)
      : page.facts.some(r => isUnderstandingTrigger(r.fact.detail.kind))) return fail('invalid')
    this.#sql('INSERT INTO understanding_cursor VALUES (?,?) ON CONFLICT(task) DO UPDATE SET through=excluded.through', taskId, move.through)
  }
  skipUnderstandingNoise(scope: WorkspaceScope, writer: WorkspaceScope, taskId: string, move: UnderstandingCursorMove): void {
    this.#writable(writer)
    if (!this.permitsUnderstanding(scope)) return fail('unavailable')
    this.#tx(() => this.#moveUnderstandingCursor(taskId, move))
  }
  #proposalSource(proposal: UnderstandingProposal, evidenceId: string): EventRef {
    return proposal.evidence.find(ref => ref.eventId === evidenceId)?.source ?? fail('invalid')
  }
  #understandingRisks(state: State, proposal: UnderstandingProposal): readonly string[] {
    if (!proposal.changes.length) return []
    const checkpoint = state.graph.checkpoint(this.#scope) ?? fail('invalid')
    const preview = state.graph.restore(this.#scope, checkpoint) ?? fail('invalid')
    for (const [i, { change, evidenceId, id }] of proposal.changes.entries()) {
      const result = preview.append(this.#scope, { ...change, seq: state.through + i + 1, id,
        source: this.#proposalSource(proposal, evidenceId) })
      if (result !== 'applied') return [result === 'unresolved' ? preview.read(this.#scope)?.unresolved.at(-1)?.reason ?? result : result]
    }
    const topology = understandingTopologyRisk(checkpoint.projection, proposal.changes.map(c => c.change))
    return topology ? [topology] : []
  }
  stageUnderstanding(scope: WorkspaceScope, writer: WorkspaceScope, request: UnderstandingRequest, modelJson?: string,
    expected?: Pick<UnderstandingProposal, 'id' | 'graphRevision' | 'candidateRevision'>, move?: UnderstandingCursorMove): UnderstandingInboxItem {
    this.#writable(writer)
    if (!this.permitsUnderstanding(scope)) return fail('unavailable')
    if (modelJson !== undefined && (typeof modelJson !== 'string' || modelJson.length > understandingOutputLimit)) return fail('invalid')
    return this.#tx(() => {
      const input = this.#understandingInput(request, Date.now())
      const proposal = analyzeUnderstanding(input, sha, modelJson, request.mode)
      if (expected && (proposal.id !== expected.id || proposal.graphRevision !== expected.graphRevision
        || proposal.candidateRevision !== expected.candidateRevision)) return fail('revision')
      if (move) this.#moveUnderstandingCursor(request.taskId, move, request.evidenceIds)
      const applied = this.#one(`SELECT p.body,p.hash,r.body AS receipt,r.hash AS review_hash
        FROM understanding_applied a JOIN understanding_proposal p ON p.id=a.id JOIN understanding_review r ON r.id=a.id
        WHERE a.supersession=?`, proposal.supersessionKey)
      if (applied) return { ...readChecked<SavedUnderstanding>(applied).item,
        review: readChecked<SavedUnderstandingReview>({ body: applied.receipt, hash: applied.review_hash }).receipt }
      const existing = this.#one('SELECT body,hash FROM understanding_proposal WHERE id=?', proposal.id)
      if (existing) {
        const { item } = readChecked<SavedUnderstanding>(existing)
        const prior = this.#one('SELECT body,hash FROM understanding_review WHERE id=?', proposal.id)
        return prior ? { ...item, review: readChecked<SavedUnderstandingReview>(prior).receipt } : item
      }
      if (Number(this.#one('SELECT count(*) AS n FROM understanding_proposal')?.n) >= 4096) return fail('limit')
      const risks = this.#understandingRisks(this.#state(request.taskId), proposal)
      const item = { proposal, risks }
      const body = encode({ request, ...(modelJson !== undefined ? { modelJson } : {}), item } satisfies SavedUnderstanding)
      this.#sql('INSERT INTO understanding_proposal VALUES (?,?,?,?,?)',
        proposal.id, proposal.taskId, proposal.supersessionKey, body, sha(body))
      return item
    })
  }
  listUnderstanding(scope: WorkspaceScope, taskId: string, limit = 16): readonly UnderstandingInboxItem[] {
    if (!this.permitsUnderstanding(scope) || !isTaskId(taskId)) return []
    if (!expectNumber(limit) || limit < 1 || limit > 32) return fail('invalid')
    const revision = this.#state(taskId).revision
    return this.#all(`SELECT p.body,p.hash,r.body AS receipt,r.hash AS review_hash,
        EXISTS(SELECT 1 FROM understanding_proposal n WHERE n.supersession=p.supersession AND n.rowid>p.rowid) AS newer
      FROM understanding_proposal p LEFT JOIN understanding_review r ON r.id=p.id
      WHERE p.task=? ORDER BY p.rowid DESC LIMIT ?`, taskId, limit).map(row => {
      const { item } = readChecked<SavedUnderstanding>(row)
      if (row.receipt !== null) return { ...item,
        review: readChecked<SavedUnderstandingReview>({ body: row.receipt, hash: row.review_hash }).receipt }
      const state = row.newer ? 'superseded' : Date.now() >= item.proposal.expiresAt ? 'expired'
        : revision !== item.proposal.graphRevision ? 'stale-revision' : undefined
      return state ? { ...item, risks: [...item.risks, state] } : item
    })
  }
  reviewUnderstanding(writer: WorkspaceScope, proposalId: string, command: UnderstandingReviewCommand): UnderstandingReviewReceipt {
    this.#writable(writer)
    if (this.#options.understanding !== true || !digestId(proposalId)
      || !exactFields(command, ['decision', 'reviewerId', 'reason']) || !['accept', 'reject'].includes(command.decision)
      || !boundedText(command.reviewerId, 96) || !boundedText(command.reason, 512)
      || !command.reviewerId.trim() || !command.reason.trim()) return fail('invalid')
    return this.#tx(() => {
      const existing = this.#one('SELECT body,hash FROM understanding_review WHERE id=?', proposalId)
      if (existing) {
        const { command: original, receipt } = readChecked<SavedUnderstandingReview>(existing)
        if (canonical(original) !== canonical(command)) return fail('conflict')
        return receipt
      }
      const row = this.#one('SELECT rowid,body,hash FROM understanding_proposal WHERE id=?', proposalId) ?? fail('unavailable')
      const { request, modelJson, item } = readChecked<SavedUnderstanding>(row)
      const p = item.proposal
      const state = this.#state(p.taskId)
      const now = Date.now()
      let status: UnderstandingReviewReceipt['status'] = command.decision === 'accept' ? 'accepted' : 'rejected'
      let invalidation: string | undefined
      if (this.#one('SELECT 1 FROM understanding_proposal WHERE supersession=? AND rowid>? LIMIT 1',
        p.supersessionKey, Number(row.rowid))) { status = 'superseded'; invalidation = 'newer-source-proposal' }
      else if (now >= p.expiresAt) { status = 'expired'; invalidation = 'ttl-expired' }
      else if (status === 'accepted') {
        if (state.revision !== p.graphRevision) invalidation = 'stale-revision'
        else {
          try {
            const input = this.#understandingInput(request, p.createdAt)
            const regenerated = analyzeUnderstanding(input, sha, modelJson, request.mode)
            if (canonical(regenerated) !== canonical(p)) invalidation = 'stale-candidates-or-evidence'
            else invalidation = this.#understandingRisks(state, regenerated)[0]
              ?? (!p.changes.length && (p.intent.kind === 'uncertain'
                || p.unresolved.some(reason => reason !== 'routing-requires-separate-host-action')) ? 'unresolved-no-change' : undefined)
          } catch (error) {
            if (!(error instanceof GraphStoreError) || !['invalid', 'unavailable'].includes(error.code)) throw error
            invalidation = 'evidence-unavailable'
          }
        }
        if (invalidation) status = 'conflicted'
      }
      if (status === 'accepted') {
        for (const { id, change, evidenceId } of p.changes) this.#append(p.taskId,
          { key: 'understanding:' + id, change, source: this.#proposalSource(p, evidenceId) }, 'host_confirmed', undefined, p.id)
      }
      const ids = p.changes.map(c => c.id)
      const receipt: UnderstandingReviewReceipt = { proposalId, status, reviewer: { type: 'trusted_host', id: command.reviewerId },
        acceptedChangeIds: status === 'accepted' ? ids : [], rejectedChangeIds: status === 'accepted' ? [] : ids,
        expectedRevision: p.graphRevision, resultingRevision: state.revision, reason: invalidation ?? command.reason,
        timestamp: now, evidence: p.evidence }
      const body = encode({ command, receipt } satisfies SavedUnderstandingReview)
      this.#sql('INSERT INTO understanding_review VALUES (?,?,?)', p.id, body, sha(body))
      if (status === 'accepted') this.#sql('INSERT INTO understanding_applied VALUES (?,?)', p.supersessionKey, p.id)
      return receipt
    })
  }
  review(scope: WorkspaceScope, proposal: GraphProposal, decision: 'accept' | 'reject'): ReviewReceipt {
    this.#writable(scope)
    return this.#tx(() => {
      if (!proposal || proposal.workspaceId !== this.workspaceId || !isTaskId(proposal.taskId)
        || !/^[a-f0-9]{64}$/u.test(proposal.id) || !['accept', 'reject'].includes(decision)) return fail('unavailable')
      const existing = this.#one('SELECT body,hash FROM proposal_review WHERE id=?', proposal.id)
      if (existing) {
        const saved = readChecked<{ proposal: GraphProposal; receipt: ReviewReceipt }>(existing)
        if (canonical(saved.proposal) !== canonical(proposal)) return fail('conflict')
        return saved.receipt
      }
      const state = this.#state(proposal.taskId)
      const cut = this.#cut(state) ?? fail('unavailable')
      if (cut.revision !== proposal.baseRevision || cut.snapshot.sourceRevision !== proposal.sourceRevision) return fail('revision')
      const factRow = this.#one('SELECT body,hash FROM runtime_fact WHERE id=? AND task=?', proposal.suggestion?.evidenceId, proposal.taskId)
      const evidence = factRow ? [readChecked<StoredRuntimeFact>(factRow, 8192)] : []
      const regenerated = proposeGraphChanges(cut, evidence, sha, proposal.suggestion)
      if (regenerated.status !== 'proposed' || canonical(regenerated.proposal) !== canonical(proposal)) return fail('invalid')
      if (decision === 'accept') {
        for (const [i, change] of regenerated.proposal.changes.entries()) this.#append(proposal.taskId,
          { key: `proposal:${proposal.id}:${i}`, change, source: regenerated.proposal.evidence[0]!.source },
          'host_confirmed', undefined, proposal.id)
      }
      const receipt: ReviewReceipt = { status: decision === 'accept' ? 'accepted' : 'rejected', proposalId: proposal.id, revision: state.revision }
      const body = encode({ proposal, receipt, reviewedAt: time(), provenance: 'host_confirmed' })
      this.#sql('INSERT INTO proposal_review VALUES (?,?,?)', proposal.id, body, sha(body))
      return receipt
    })
  }
}
export const openGraphStore = (options: GraphStoreOptions): LocalGraphStore => new LocalGraphStore(options)
