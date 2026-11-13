import { join } from 'node:path'
import type { RuntimeFact, RuntimeSessionRef, WorkspaceScope } from '@acmi/contracts'
import { canonical } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { LocalGraphStore, RuntimeWorkAssignment } from './graph-store.ts'
import { GraphStoreError } from './graph-store-db.ts'
import { DSH_VERSION } from './harness.ts'
import { encodeSegment, generationLogFilename, projectDir, type JsonlCompression } from './journal-format.ts'
import { dshRuntimeIdentity, normalizeDshRuntimeFact, runtimeFactAdapterVersion } from './runtime-facts.ts'
import { openDshJournal } from './scoped-read.ts'

/** Explicit offline recovery of one exact Session, never Workspace-wide discovery. */
export async function reconcileKnownDshSession(
  ctx: Context, opts: DshIngestionOptions, session: RuntimeSessionRef, signal = AbortSignal.timeout(8000),
) {
  const { store, scope, writer } = opts
  const identity = { ...session }
  const authorized = () => opts.enabled === true && opts.synthetic === true && opts.runtimeVersion === DSH_VERSION
    && getDshRuntimeVersion() === DSH_VERSION && store.permits(scope) && store.permitsWrite(writer)
    && identity.adapterId === 'dsh' && identity.instanceId === store.workspaceId && !ctx.sessions.get(SessionId(identity.sessionId))
  const registered = () => {
    signal.throwIfAborted()
    if (!authorized()) throw new GraphStoreError('unavailable')
    return store.continuationIngestionSource(scope, writer, identity, opts)
  }
  if (!store.isSeparateFrom(opts.workspaceRoot) || !store.isSeparateFrom(opts.journalRoot)) throw new GraphStoreError('unavailable')
  registered()
  const journal = await openDshJournal(opts.journalRoot, opts.workspaceRoot, opts.compression)
  if (journal.partitionId !== store.workspaceId) throw new GraphStoreError('unavailable')
  registered()
  const snapshot = await journal.inspect(identity.sessionId, signal)
  registered()
  if (!snapshot || canonical(dshRuntimeIdentity(snapshot.header, store.workspaceId)) !== canonical(identity)) throw new GraphStoreError('unavailable')
  const cut = await journal.read(snapshot, signal)
  const registration = registered()
  const start = cut.inheritedEventCount
  const cursor = store.cursor(scope, identity, start)
  if (!cursor || cursor.next > cut.events.length || registration && cut.events.length < registration.checkpointNext) {
    throw new GraphStoreError('conflict')
  }
  let revision = cursor.bindingRevision
  if (cursor.next > start) verifyAnchor(store, scope, identity, snapshot.header, cut.events[cursor.next - 1], cursor.next - 1, revision)
  for (let next = cursor.next; next < cut.events.length; next++) {
    registered()
    const row = cut.events[next]
    if (!row || row.seq !== next) throw new GraphStoreError('gap')
    const fact = normalizeDshRuntimeFact(snapshot.header, row, store.workspaceId, revision)
    store.ingest(writer, fact, start)
    if (fact.detail.kind === 'binding') revision = fact.detail.revision
    // An offline repair is operator-driven, but must still yield to cancellation.
    if ((next - cursor.next) % 32 === 31) await new Promise<void>(resolve => setImmediate(resolve))
  }
  registered()
  return { next: cut.events.length, committed: cut.events.length - cursor.next, decoded: cut.events.length }
}

function verifyAnchor(
  store: LocalGraphStore, scope: WorkspaceScope, identity: RuntimeSessionRef, header: Session['header'],
  row: SessionEvent | undefined, seq: number, revision: number,
) {
  const last = store.factAt(scope, identity, seq)
  const fact = row && last && normalizeDshRuntimeFact(header, row, store.workspaceId,
    last.fact.detail.kind === 'binding' ? revision - 1 : revision, last.fact.adapterVersion === runtimeFactAdapterVersion)
  if (!last || !fact || canonical(last.fact) !== canonical(fact)) throw new GraphStoreError('conflict')
}

export interface DshIngestionOptions {
  readonly enabled?: boolean
  readonly synthetic?: true
  readonly runtimeVersion: string
  readonly workspaceRoot: string
  readonly journalRoot: string
  readonly compression: JsonlCompression
  readonly store: LocalGraphStore
  readonly scope: WorkspaceScope
  readonly writer: WorkspaceScope
}
interface Pending {
  readonly rows: SessionEvent[]
  readonly assignment?: RuntimeWorkAssignment
  gap: boolean
  closed?: boolean
  sealAt?: number
  dropped: number
  firstDropped?: number
  lastDropped?: number
}
const maxQueued = 2048
interface DrainControls {
  readonly queueLimit: number
  readonly sessionQueueLimit: number
  readonly batchRows: number
  readonly batchMs: number
  readonly notify: (session: Session) => void
  readonly allowed?: (session: Session) => boolean
  readonly retainOnDispose?: boolean
}

/** Observe the public append feed. The trusted host explicitly selects Sessions and drives durability barriers. */
export async function registerDshRuntimeIngestion(ctx: Context, opts: DshIngestionOptions, controls?: DrainControls) {
  if (opts.enabled !== true || opts.synthetic !== true || opts.runtimeVersion !== DSH_VERSION
    || getDshRuntimeVersion() !== DSH_VERSION) return null
  const { store, scope, writer, workspaceRoot, journalRoot, compression } = opts
  const journal = await openDshJournal(journalRoot, workspaceRoot, compression)
  if (journal.partitionId !== store.workspaceId || !store.permits(scope) || !store.permitsWrite(writer)
    || !store.isSeparateFrom(workspaceRoot) || !store.isSeparateFrom(journalRoot)) return null
  const backend = ctx.sessionPersistence.identity
  const tracked = new Map<Session, Pending>()
  let queued = 0
  let capture = 0
  let dropped = 0
  let queueHighWater = 0
  let committed = 0
  let decoded = 0
  let reconciliations = 0
  let disposed = false
  let sealed = false
  let busy = false
  const replays = new Map<Session, { from: number; through: number; facts: RuntimeFact[] }>()
  let replayRows = 0
  const valid = (s: Session) => !disposed && store.permits(scope) && store.permitsWrite(writer) && ctx.get('sessionPersistence')?.identity === backend
    && s.header.cwd === workspaceRoot && ctx.sessions.get(s.id) === s
  const registered = (s: Session) => store.continuationIngestionSource(scope, writer, dshRuntimeIdentity(s.header, store.workspaceId), opts)
  const stopEvents = ctx.on('session/event', (s, event) => {
    const row = tracked.get(s)
    if (sealed || !row || !valid(s) || !Number.isSafeInteger(event.seq) || event.seq < s.inheritedEventCount) return
    capture++
    if (row.gap || queued >= (controls?.queueLimit ?? maxQueued) || row.rows.length >= (controls?.sessionQueueLimit ?? maxQueued)) {
      row.gap = true
      row.dropped++
      dropped++
      row.firstDropped ??= event.seq
      row.lastDropped = event.seq
    } else {
      row.rows.push(event)
      queued++
      queueHighWater = Math.max(queueHighWater, queued)
    }
    controls?.notify(s)
  }, { global: true })
  function detach(s: Session) {
    const row = tracked.get(s)
    if (row) queued -= row.rows.length
    tracked.delete(s)
    forgetReplay(s)
  }
  const stopDisposed = ctx.on('session/disposed', session => {
    const row = tracked.get(session)
    if (!controls?.retainOnDispose || !row) { detach(session); return }
    row.closed = true
    row.gap = true
    queued -= row.rows.splice(0).length
    controls.notify(session)
  }, { global: true })
  const allowed = (s: Session, p: Pending) => {
    if (disposed || !store.permits(scope) || !store.permitsWrite(writer) || tracked.get(s) !== p
      || (controls?.allowed && !controls.allowed(s))
      || !(p.closed ? !ctx.sessions.get(s.id) && s.header.cwd === workspaceRoot && ctx.get('sessionPersistence')?.identity === backend : valid(s))) return false
    registered(s)
    return true
  }
  function dispose() {
    if (disposed) return
    disposed = true
    stopEvents()
    stopDisposed()
    tracked.clear()
    replays.clear()
    replayRows = 0
    queued = 0
  }
  ctx.effect(() => dispose, 'ACMI persistent runtime observation')

  async function durability(s: Session, own: () => void, signal: AbortSignal): Promise<void> {
    own()
    if (!await ctx.sessions.flush(s)) throw new GraphStoreError('unavailable')
    own()
    if (!valid(s)) throw new GraphStoreError('unavailable')
    const stat = await ctx.sessionPersistence.stat(s.id, { signal })
    own()
    const expected = join(projectDir(journalRoot, workspaceRoot), encodeSegment(s.id), generationLogFilename(4, compression))
    if (!valid(s) || stat?.header.createdAt !== s.header.createdAt || stat.header.cwd !== workspaceRoot
      || stat.location?.kind !== 'jsonl' || stat.location.path !== expected) throw new GraphStoreError('unavailable')
  }
  function forgetReplay(s: Session) {
    replayRows -= replays.get(s)?.facts.length ?? 0
    replays.delete(s)
  }
  function commit(s: Session, pending: Pending, fact: RuntimeFact, bindingRevision: number): number {
    const receipt = store.ingest(writer, fact, s.inheritedEventCount, pending.assignment)
    if (receipt.status === 'committed') committed++
    return fact.detail.kind === 'binding' ? fact.detail.revision : bindingRevision
  }
  async function run(s: Session, recover: boolean, signal = AbortSignal.timeout(10_000)) {
    const pending = tracked.get(s)
    if (!pending || !allowed(s, pending)) throw new GraphStoreError('unavailable')
    if (busy) throw new GraphStoreError('busy')
    busy = true
    try {
      const own = () => {
        signal.throwIfAborted()
        if (!allowed(s, pending)) throw new GraphStoreError('unavailable')
      }
      const latest = pending.sealAt ?? s.seq
      const identity = dshRuntimeIdentity(s.header, store.workspaceId)
      const cursor = store.cursor(scope, identity, s.inheritedEventCount)
      const registration = registered(s)
      signal.throwIfAborted()
      if (!cursor || cursor.next > latest) throw new GraphStoreError('gap')
      if (registration && latest < registration.checkpointNext) throw new GraphStoreError('conflict')
      if (cursor.next === latest) return cursor.next
      if (!pending.closed) await durability(s, own, signal)
      own()
      let next = cursor.next
      let binding = cursor.bindingRevision
      let stopAt = Math.min(latest, next + (controls?.batchRows ?? Number.MAX_SAFE_INTEGER))
      if (!recover && pending.gap) throw new GraphStoreError('gap')
      if (recover) {
        let replay = replays.get(s)
        if (!replay || next >= replay.through) {
          forgetReplay(s)
          if (replayRows + latest - next > 16_384) throw new GraphStoreError('busy')
          const snapshot = await journal.inspect(s.id, signal)
          own()
          if (!snapshot || snapshot.header.createdAt !== s.header.createdAt) throw new GraphStoreError('unavailable')
          const cut = await journal.read(snapshot, signal)
          own()
          reconciliations++
          decoded += cut.events.length
          if (cut.inheritedEventCount !== s.inheritedEventCount || cut.events.length < latest
            || cut.meta.createdAt !== s.header.createdAt) throw new GraphStoreError('gap')
          if (next > s.inheritedEventCount) verifyAnchor(store, scope, identity, s.header, cut.events[next - 1], next - 1, binding)
          const facts: RuntimeFact[] = []
          let revision = binding
          for (let seq = next; seq < latest; seq++) {
            signal.throwIfAborted()
            const row = cut.events[seq]
            if (!row || row.seq !== seq) throw new GraphStoreError('gap')
            const fact = normalizeDshRuntimeFact(s.header, row, store.workspaceId, revision)
            facts.push(fact)
            if (fact.detail.kind === 'binding') revision = fact.detail.revision
          }
          replay = { from: next, through: latest, facts }
          replays.set(s, replay)
          replayRows += facts.length
        }
        stopAt = Math.min(stopAt, replay.through)
        const deadline = performance.now() + (controls?.batchMs ?? Infinity)
        for (; next < stopAt; next++) {
          own()
          const fact = replay.facts[next - replay.from]
          if (!fact || fact.source.localSeq !== next) throw new GraphStoreError('gap')
          binding = commit(s, pending, fact, binding)
          if (performance.now() >= deadline) { next++; break }
        }
        if (next >= replay.through) forgetReplay(s)
        if (next === s.seq) pending.gap = false
      } else {
        const deadline = performance.now() + (controls?.batchMs ?? Infinity)
        for (const event of pending.rows) {
          own()
          if (event.seq >= stopAt) break
          if (event.seq < next) continue
          if (event.seq !== next) throw new GraphStoreError('gap')
          binding = commit(s, pending, normalizeDshRuntimeFact(s.header, event, store.workspaceId, binding), binding)
          next++
          if (performance.now() >= deadline) { stopAt = next; break }
        }
        if (next !== stopAt) throw new GraphStoreError('gap')
      }
      const consumed = pending.rows.findIndex(row => row.seq >= next)
      queued -= pending.rows.splice(0, consumed === -1 ? pending.rows.length : consumed).length
      return next
    } finally { busy = false }
  }
  return {
    attach(session: Session, assignment?: RuntimeWorkAssignment) {
      if (!valid(session) || tracked.has(session) || tracked.size >= 32) throw new GraphStoreError('unavailable')
      const registration = registered(session)
      if (registration && (assignment || session.seq < registration.checkpointNext)) throw new GraphStoreError('unavailable')
      if (assignment) {
        const cut = store.read(scope, assignment.taskId)
        if (!cut?.snapshot.nodes.some(node => node.id === assignment.nodeId)) throw new GraphStoreError('unavailable')
        if (assignment.parentExecutionId) {
          const parent = session.header.origin === 'subagent' && session.header.parentSession
            ? ctx.sessions.get(session.header.parentSession) : undefined
          const exec = cut.snapshot.executions.find(row => row.id === assignment.parentExecutionId)
          if (!parent || !valid(parent) || !exec || exec.started.source.session.sessionId !== parent.id
            || exec.started.source.session.incarnation !== String(parent.header.createdAt)) throw new GraphStoreError('unavailable')
        }
      }
      tracked.set(session, { rows: [], gap: false, dropped: 0, ...(assignment ? { assignment: { ...assignment } } : {}) })
    },
    probe(session: Session) {
      const row = tracked.get(session)
      if (!row || !allowed(session, row)) throw new GraphStoreError('unavailable')
      const cursor = store.cursor(scope, dshRuntimeIdentity(session.header, store.workspaceId), session.inheritedEventCount)
      if (!cursor || cursor.next > session.seq) throw new GraphStoreError('conflict')
      const head = row.sealAt ?? session.seq
      const gap = cursor.next < head && (row.gap || !row.rows.some(event => event.seq === cursor.next))
      return { next: cursor.next, head, gap, dropped: row.dropped, closed: row.closed === true,
        firstDropped: row.firstDropped, lastDropped: row.lastDropped }
    },
    seal() {
      sealed = true
      for (const [session, row] of tracked) row.sealAt ??= session.seq
    },
    releaseReplay: forgetReplay,
    detach,
    drain(session: Session, signal?: AbortSignal) { return run(session, false, signal) },
    reconcile(session: Session, signal?: AbortSignal) { return run(session, true, signal) },
    metrics() { return { captured: capture, committed, coldDecodedRows: decoded, queued, queueHighWater, dropped, reconciliations, replayRows } },
    dispose,
  }
}
