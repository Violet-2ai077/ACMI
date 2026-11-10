import type { RuntimeSessionRef, ScopeAuthority, TaskGraphSnapshot, UnderstandingCut, UnderstandingEventKind, UnderstandingFact,
  UnderstandingRetained, UnderstandingTaskInput, UnderstandingTurn, WorkspaceScope } from '@acmi/contracts'
import { analyzeLayered, buildLayeredContext, canonical, LayeredState, layeredContextLimits, runtimeFactId, selectLayeredShadowWork,
  validUnderstandingCut, type LayeredAnalysis, type LayeredClaimGraph, type LayeredMemory, type LayeredStateOptions,
  type LayeredStateResult } from '@acmi/core'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { LocalGraphStore } from './graph-store.ts'
import { DSH_VERSION } from './harness.ts'
import { continuityDigest as sha256 } from './local-digest.ts'

type Current = Omit<UnderstandingTurn, 'digest'>
type Epochs = Pick<UnderstandingCut, 'authorizationEpoch' | 'sourceRevision' | 'candidateRevision' | 'policyVersion'>
type Observation = { readonly kind: 'completed_user'; readonly start: SessionEvent<'turn/start'>; readonly message: SessionEvent<'user/message'>;
  readonly completion: SessionEvent<'turn/end'> }
  | { readonly kind: 'host_event'; readonly eventKind: Exclude<UnderstandingEventKind, 'message'>; readonly id: string }

export interface DshLayeredShadowInput {
  readonly session: RuntimeSessionRef
  readonly cursor: number
  readonly fromCursor: number
  readonly observation: Observation
  readonly factCursors?: readonly number[]
}

interface CatalogQuery {
  readonly cut: UnderstandingCut
  readonly current: Current
  readonly recentTaskIds: readonly string[]
  readonly signal: AbortSignal
}
interface CatalogView { readonly revision: number; readonly candidates: readonly UnderstandingTaskInput[] }

export interface DshLayeredShadowOptions {
  readonly enabled?: boolean
  readonly synthetic?: boolean
  readonly runtimeVersion: string
  readonly store: Pick<LocalGraphStore, 'workspaceId' | 'permits' | 'cursor' | 'factAt' | 'peek'>
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly scope: WorkspaceScope
  readonly authorize: (session: RuntimeSessionRef) => boolean
  readonly permitsTask: (scope: WorkspaceScope, taskId: string) => boolean
  readonly readEpochs: (session: RuntimeSessionRef) => Epochs | null
  readonly catalog: (query: CatalogQuery) => CatalogView | null | Promise<CatalogView | null>
  readonly trigger?: 'gated' | 'ungated'
  readonly deadlineMs?: number
  readonly state?: LayeredStateOptions
}

interface DshLayeredObservation {
  readonly actor: Current['actor']
  readonly work: 'analyze' | 'sample_metadata'
  readonly sourceCursor: number
  readonly bindingRevision: number
  readonly bindingTaskId: string | null
  readonly providerRequests: 0
  readonly result: LayeredAnalysis | null
  readonly unresolved: string | null
  readonly metrics: { readonly latencyMs: number; readonly inputBytes: number; readonly estimatedTokens: number;
    readonly candidates: number; readonly facts: number; readonly retained: number; readonly draftCount: number }
}
export type DshLayeredShadowResult = LayeredStateResult<DshLayeredObservation> | { readonly status: 'disabled' | 'unavailable' }

const pos = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
const key = (s: unknown): s is string => typeof s === 'string' && /^[\p{L}\p{N}_.:@-]{1,128}$/u.test(s)
const sameSession = (a: RuntimeSessionRef, b: RuntimeSessionRef) => a.instanceId === b.instanceId && a.adapterId === b.adapterId
  && a.sessionId === b.sessionId && a.incarnation === b.incarnation
const maxFactCursors = 12
const hostKinds = new Set(['causal', 'binding', 'authorization', 'metadata', 'closed'])

function waitForSettlement<T>(task: Promise<T>, signal: AbortSignal): Promise<T | { readonly status: 'cancelled' }> {
  if (signal.aborted) return Promise.resolve({ status: 'cancelled' })
  return new Promise((resolve, reject) => {
    const cancel = () => resolve({ status: 'cancelled' })
    signal.addEventListener('abort', cancel, { once: true })
    void task.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}

function projectCurrent(input: DshLayeredShadowInput, facts: readonly UnderstandingFact[]): Current | null {
  const observation = input.observation
  if (observation.kind === 'host_event') {
    if (!hostKinds.has(observation.eventKind) || !key(observation.id)) return null
    return { id: observation.id, actor: 'host', text: '', kind: observation.eventKind === 'metadata' && facts.length ? 'causal' : observation.eventKind }
  }
  const { message, completion } = observation
  if (message.type !== 'user/message' || message.surfaceOp !== 'append' || message.data.source.kind !== 'user'
    || completion.type !== 'turn/end' || completion.data.reason.kind !== 'completed' || !Array.isArray(message.data.content)) return null
  const maxText = layeredContextLimits.bytes
  let text = ''
  if (message.data.content.length > 64) return { id: runtimeFactId(input.session, message.seq, sha256), actor: 'user', kind: 'message', text }
  for (const block of message.data.content) if (block.type === 'text') {
    if (block.text.length + text.length + 1 > maxText) {
      text = '' // Never analyze a truncated, potentially meaning-changing directive.
      break
    }
    text += (text ? '\n' : '') + block.text
  }
  return { id: runtimeFactId(input.session, message.seq, sha256), actor: 'user', kind: 'message', text }
}

const mappedWorkStates = { planned: 'pending', ready: 'ready', blocked: 'blocked', running: 'running', completed: 'completed' } as const

function projectGraph(cut: UnderstandingCut, snapshot: TaskGraphSnapshot | undefined): LayeredClaimGraph {
  const nodes: LayeredClaimGraph['nodes'][number][] = []
  const edges: LayeredClaimGraph['edges'][number][] = []
  const decisions: LayeredClaimGraph['decisions'][number][] = []
  if (snapshot) {
    for (const row of snapshot.nodes.slice(0, 512)) {
      if (!Object.hasOwn(mappedWorkStates, row.state)) continue
      nodes.push({ id: row.id, taskId: snapshot.taskId, kind: row.role,
        state: mappedWorkStates[row.state as keyof typeof mappedWorkStates] })
    }
    for (const row of snapshot.edges.slice(0, 2048)) if (row.relation === 'depends_on' || row.relation === 'decomposes_into'
      || row.relation === 'joins_into') edges.push({ from: row.from, to: row.to, relation: row.relation })
    for (const row of snapshot.evidence.slice(0, 512)) {
      const { content } = row
      if (content.kind !== 'decision' || content.state === 'disputed' || content.state === 'unresolved') continue
      decisions.push({ id: row.id, taskId: snapshot.taskId, text: content.text, topic: content.topic, state: content.state })
    }
  }
  return { workspaceId: cut.workspaceId, graphRevision: cut.graphRevision, nodes, edges, decisions, results: [],
    topologyComplete: Boolean(snapshot && nodes.length === snapshot.nodes.length && snapshot.edges.length <= 2048
      && snapshot.pending === 0 && snapshot.unresolved.length === 0) }
}

/** Explicit read-only call after a trusted synthetic Host has committed its observed delta. Not a dsh hook. */
export function createDshLayeredShadow(options: DshLayeredShadowOptions) {
  const state = new LayeredState<DshLayeredObservation>(options.state)
  const deadline = options.deadlineMs ?? 250
  if (!pos(deadline) || deadline < 1 || deadline > 5000) throw new RangeError('Invalid layered shadow deadline')
  const lifetime = new AbortController()
  const { store, authority, scope } = options
  const allowed = (session: RuntimeSessionRef) => {
    try {
      return session.adapterId === 'dsh' && session.instanceId === store.workspaceId && key(session.sessionId) && key(session.incarnation)
        && store.permits(scope) && authority.permits(scope, store.workspaceId) && options.authorize(session) === true
    } catch { return false }
  }

  function capture(input: DshLayeredShadowInput) {
    if (!allowed(input.session)) return null
    const row = store.cursor(scope, input.session)
    if (!row?.sourceRevision || row.next !== input.cursor + 1) return null
    const bindingTaskId = row.taskId ?? null
    if (bindingTaskId !== null && !options.permitsTask(scope, bindingTaskId)) return null
    // Only a prepared in-memory graph cut; this path never replays a stream or reads the Journal.
    const graph = bindingTaskId === null ? null : store.peek(scope, bindingTaskId)
    if (bindingTaskId !== null && !graph) return null
    const epochs = options.readEpochs(input.session)
    if (!epochs) return null
    const { authorizationEpoch, candidateRevision, policyVersion, sourceRevision } = epochs
    const cut: UnderstandingCut = { workspaceId: input.session.instanceId, sessionId: input.session.sessionId,
      incarnation: input.session.incarnation, cursor: input.cursor, graphRevision: graph?.snapshot.through ?? 0,
      bindingRevision: row.bindingRevision, authorizationEpoch, candidateRevision, policyVersion, sourceRevision }
    if (!validUnderstandingCut(cut)) return null
    const stamp = sha256(canonical([cut, bindingTaskId, row.sourceRevision, graph?.revision ?? null]))
    return { cut, bindingTaskId, stamp, nativeSource: row.sourceRevision, graph: graph?.snapshot }
  }

  async function observe(observed: DshLayeredShadowInput, external?: AbortSignal): Promise<DshLayeredShadowResult> {
    if (options.enabled !== true || options.synthetic !== true || options.runtimeVersion !== DSH_VERSION
      || getDshRuntimeVersion() !== DSH_VERSION) return { status: 'disabled' }
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(deadline), ...(external ? [external] : [])])
    if (signal.aborted) return { status: 'cancelled' }
    try {
      if (!observed?.session || !observed.observation || !pos(observed.cursor) || !Number.isSafeInteger(observed.fromCursor)
        || observed.fromCursor < -1 || observed.fromCursor >= observed.cursor || (observed.factCursors?.length ?? 0) > maxFactCursors) {
        return { status: 'unavailable' }
      }
      const input = { ...observed, session: { ...observed.session } }
      const start = performance.now()
      const captured = capture(input)
      if (!captured) return { status: 'unavailable' }
      const { cut, bindingTaskId, stamp, nativeSource } = captured
      const committed = (seq: number) => {
        if (!pos(seq) || seq <= input.fromCursor || seq > cut.cursor) return null
        const row = store.factAt(scope, input.session, seq)
        if (!row || row.fact.workspaceId !== cut.workspaceId || !sameSession(row.fact.source.session, input.session)
          || row.fact.source.localSeq !== seq || row.fact.source.sourceRevision !== nativeSource) return null
        const related = row.attribution.kind === 'assigned' ? row.attribution.taskId : null
        return related !== null && !options.permitsTask(scope, related) ? null : { fact: row.fact, related }
      }
      if (input.observation.kind === 'completed_user') {
        const { start, message, completion } = input.observation
        const begin = committed(start.seq)
        const msg = committed(message.seq)
        const end = committed(completion.seq)
        if (!begin || !msg || !end || start.type !== 'turn/start' || start.seq >= message.seq || message.seq >= completion.seq
          || begin.fact.detail.kind !== 'turn-open' || begin.fact.detail.turn !== String(completion.data.turn)
          || start.data.turn !== completion.data.turn || msg.fact.detail.kind !== 'user'
          || msg.related !== null && msg.related !== bindingTaskId
          || end.fact.detail.kind !== 'turn-complete' || end.fact.detail.turn !== String(completion.data.turn)) return { status: 'unavailable' }
      }
      const facts: UnderstandingFact[] = []
      for (const seq of new Set(input.factCursors ?? [])) {
        const row = committed(seq)
        if (!row) continue
        const { fact, related } = row
        const detail = fact.detail
        const kind = detail.kind === 'tool-call' || detail.kind === 'tool-result' ? detail.kind
          : detail.kind === 'binding' ? 'binding-changed' : undefined
        if (!kind) continue
        facts.push({ workspaceId: cut.workspaceId, sessionId: cut.sessionId, incarnation: cut.incarnation, cursor: seq,
          sourceRevision: cut.sourceRevision, id: fact.eventId, kind, ...(related ? { relatedTaskId: related } : {}),
          ...(detail.kind === 'tool-result' && detail.callSeq !== undefined && detail.callSeq < seq
            ? { cause: runtimeFactId(input.session, detail.callSeq, sha256) } : {}) })
      }
      const current = projectCurrent(input, facts)
      if (!current || !allowed(input.session)) return { status: 'unavailable' }
      const digest = sha256(canonical([current, facts]))
      const work = selectLayeredShadowWork({ ...current, cursor: cut.cursor }, options.trigger ?? 'gated')
      const cancellation = { get cancelled() { return signal.aborted } }
      const unchanged = () => !signal.aborted && capture(input)?.stamp === stamp
      const promise = state.run({ cut, digest, fromCursor: input.fromCursor, bindingTaskId }, async ({ memory }) => {
        if (!unchanged()) return { status: 'stale' }
        if (work === 'skip_metadata') return { status: 'skip' }
        const view = await options.catalog({ cut: Object.freeze({ ...cut }), current: Object.freeze({ ...current }), signal,
          recentTaskIds: Object.freeze(memory.recentIdentities.map(row => row.taskId)) })
        if (!unchanged()) return { status: 'stale' }
        if (!view) return { status: 'retry' }
        if (view.revision !== cut.candidateRevision) return { status: 'stale' }
        const retained: UnderstandingRetained[] = [
          ...memory.recentIdentities.map(row => ({ kind: 'identity' as const, ref: row.taskId, ...row, sourceRevision: cut.sourceRevision })),
        ]
        const built = buildLayeredContext({ cut, current, binding: { taskId: bindingTaskId }, candidates: view.candidates, facts, retained },
          { authority, scope, sha256, permitsTask: options.permitsTask })
        if (!unchanged() || built.status === 'scope_denied') return { status: 'stale' }
        const fixed = { actor: current.actor, work, sourceCursor: cut.cursor, bindingRevision: cut.bindingRevision,
          bindingTaskId, providerRequests: 0 as const }
        if (built.status !== 'ready') return { status: 'complete', value: { ...fixed, result: null, unresolved: built.reason,
          metrics: { latencyMs: performance.now() - start, inputBytes: 0, estimatedTokens: 0, candidates: 0, facts: 0, retained: 0, draftCount: 0 } } }
        const { packet } = built
        const result = analyzeLayered(packet, projectGraph(cut, captured.graph))
        const { interpretation, graph } = result
        const drafts = interpretation.lifecycle.filter(row => row.disposition === 'draft')
        const claims = graph.status === 'draft' ? graph.claims : []
        const updates: Partial<LayeredMemory> = {
          recentIdentities: interpretation.identities.flatMap((identity, index) => {
            if (identity.status !== 'active' || interpretation.intents[index]?.relation !== 'existing') return []
            const candidate = packet.active.find(row => row.handle === identity.handle)
            return candidate ? [{ taskId: candidate.taskId, revision: candidate.revision, cursor: cut.cursor }] : []
          }),
          unresolvedRefs: interpretation.identities.flatMap(row => 'handle' in row ? [] : [current.id]),
          pendingProposalIds: [...drafts, ...claims].map(row => sha256(canonical([packet.digest, row]))),
          recentTurnFeatures: interpretation.utterance.flatMap(row => row.acts),
        }
        if (!unchanged() || [...packet.active, ...packet.historical].some(row => !options.permitsTask(scope, row.taskId))
          || packet.facts.some(row => row.relatedTaskId !== undefined && !options.permitsTask(scope, row.relatedTaskId))) return { status: 'stale' }
        return { status: 'complete', updates, value: { ...fixed, result, unresolved: null, metrics: {
          latencyMs: performance.now() - start, inputBytes: packet.budget.bytes, estimatedTokens: packet.budget.estimatedTokens,
          candidates: packet.active.length + packet.historical.length, facts: packet.facts.length, retained: packet.retained.length,
          draftCount: drafts.length + claims.length } } }
      }, cancellation)
      return await waitForSettlement(promise, signal)
    } catch { return signal.aborted ? { status: 'cancelled' } : { status: 'unavailable' } }
  }

  return { observe, metrics: () => state.metrics(), close: () => lifetime.abort() }
}
