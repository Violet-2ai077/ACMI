import type { Cancellation, UnderstandingCut, UnderstandingTurn } from '@acmi/contracts'

export type LayeredInvalidation = 'incarnation_changed' | 'source_gap' | 'graph_rewind' | 'graph_changed' | 'binding_changed'
  | 'authorization_changed' | 'source_changed' | 'candidate_changed' | 'policy_changed' | 'ttl_expired' | 'cursor_collision'

export interface LayeredMemory {
  readonly recentTaskIds: readonly string[]
  readonly recentIdentities: readonly { readonly taskId: string; readonly revision: number; readonly cursor: number }[]
  readonly unresolvedRefs: readonly string[]
  readonly pendingProposalIds: readonly string[]
  readonly recentTurnFeatures: readonly string[]
}

export interface LayeredStateInput {
  readonly cut: UnderstandingCut
  readonly digest: string
  readonly fromCursor: number
  readonly bindingTaskId: string | null
}

export interface LayeredWorkInput {
  readonly memory: LayeredMemory
  readonly attempt: number
  readonly lastAnalyzedCursor: number | null
  readonly bindingTaskId: string | null
  readonly cancellation: Cancellation
}

export type LayeredWork<T> = { readonly status: 'complete'; readonly value: T; readonly updates?: Partial<LayeredMemory> }
  | { readonly status: 'skip' | 'retry' | 'stale' }

export type LayeredStateResult<T> =
  | { readonly status: 'evaluated'; readonly value: T; readonly invalidations: readonly LayeredInvalidation[] }
  | { readonly status: 'skipped' | 'duplicate' | 'collision'; readonly invalidations: readonly LayeredInvalidation[] }
  | { readonly status: 'invalid' | 'stale' | 'cancelled' | 'failed' | 'busy_session' | 'busy_global' }

export interface LayeredStateOptions {
  readonly maxSessions?: number
  readonly concurrency?: number
  readonly ttlMs?: number
  readonly maxRetries?: number
  readonly now?: () => number
}

interface Checkpoint extends LayeredStateInput {
  readonly updatedAt: number
  readonly memory: LayeredMemory
  readonly lastAnalyzedCursor: number | null
  readonly collision: boolean
}

const empty = Object.freeze([]) as readonly string[]
const emptyMemory: LayeredMemory = Object.freeze({ recentTaskIds: empty, recentIdentities: Object.freeze([]), unresolvedRefs: empty,
  pendingProposalIds: empty, recentTurnFeatures: empty })
const noCancellation: Cancellation = Object.freeze({ cancelled: false })
const token = (s: unknown): s is string => typeof s === 'string' && /^[\p{L}\p{N}_.:@-]{1,128}$/u.test(s)
const integer = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min

function valid({ cut, digest, fromCursor, bindingTaskId }: LayeredStateInput): boolean {
  return !!cut && [cut.workspaceId, cut.sessionId, cut.incarnation, cut.policyVersion].every(token)
    && [cut.authorizationEpoch, cut.bindingRevision, cut.graphRevision, cut.sourceRevision, cut.candidateRevision,
      cut.cursor].every(n => integer(n)) && integer(fromCursor, -1) && fromCursor < cut.cursor
    && /^[0-9a-f]{64}$/u.test(digest) && (bindingTaskId === null || token(bindingTaskId))
}

function bounded(values: readonly string[] | undefined, prior: readonly string[], max: number): readonly string[] {
  return Object.freeze([...new Set([...(values?.slice(0, max * 2) ?? []).filter(token), ...prior])].slice(0, max))
}

function mergeMemory(memory: LayeredMemory, updates: Partial<LayeredMemory> | undefined, cursor: number): LayeredMemory {
  if (!updates) return memory
  const identities: LayeredMemory['recentIdentities'][number][] = []
  for (const row of [...(updates.recentIdentities?.slice(0, 8) ?? []), ...memory.recentIdentities]) {
    if (identities.length === 4) break
    if (token(row.taskId) && integer(row.revision) && integer(row.cursor) && row.cursor <= cursor
      && !identities.some(({ taskId }) => taskId === row.taskId)) {
      identities.push(Object.freeze({ taskId: row.taskId, revision: row.revision, cursor: row.cursor }))
    }
  }
  return Object.freeze({ recentTaskIds: bounded(updates.recentTaskIds, memory.recentTaskIds, 4),
    recentIdentities: Object.freeze(identities),
    unresolvedRefs: bounded(updates.unresolvedRefs, memory.unresolvedRefs, 4),
    pendingProposalIds: bounded(updates.pendingProposalIds, memory.pendingProposalIds, 8),
    recentTurnFeatures: bounded(updates.recentTurnFeatures, memory.recentTurnFeatures, 4) })
}

function reasons(previous: Checkpoint, input: LayeredStateInput, now: number, ttl: number): LayeredInvalidation[] {
  const { cut } = input
  const prior = previous.cut
  const result: LayeredInvalidation[] = []
  if (cut.incarnation !== prior.incarnation) result.push('incarnation_changed')
  else if (cut.cursor > prior.cursor && input.fromCursor !== prior.cursor) result.push('source_gap')
  if (cut.graphRevision < prior.graphRevision) result.push('graph_rewind')
  else if (cut.graphRevision > prior.graphRevision) result.push('graph_changed')
  if (cut.bindingRevision !== prior.bindingRevision || input.bindingTaskId !== previous.bindingTaskId) result.push('binding_changed')
  if (cut.authorizationEpoch !== prior.authorizationEpoch) result.push('authorization_changed')
  if (cut.sourceRevision !== prior.sourceRevision) result.push('source_changed')
  if (cut.candidateRevision !== prior.candidateRevision) result.push('candidate_changed')
  if (cut.policyVersion !== prior.policyVersion) result.push('policy_changed')
  if (now - previous.updatedAt >= ttl || now < previous.updatedAt) result.push('ttl_expired')
  return result
}

/** The caller must authenticate actor/kind and current cut. User text is not a gate input. */
export function selectLayeredShadowWork(event: Pick<UnderstandingTurn, 'actor' | 'kind'> & { readonly cursor: number },
  mode: 'gated' | 'ungated'): 'analyze' | 'sample_metadata' | 'skip_metadata' {
  if (mode !== 'gated' || event.actor !== 'host' || event.kind !== 'metadata' || !integer(event.cursor)) return 'analyze'
  return event.cursor % 8 === 0 ? 'sample_metadata' : 'skip_metadata'
}

/** Volatile interpretation state. All inputs and work must come from a trusted scoped Host. */
export class LayeredState<T> {
  readonly #states = new Map<string, Checkpoint>()
  readonly #active = new Set<string>()
  readonly #maxSessions: number
  readonly #concurrency: number
  readonly #ttl: number
  readonly #retries: number
  readonly #now: () => number
  #highWater = 0

  constructor(options: LayeredStateOptions = {}) {
    this.#maxSessions = options.maxSessions ?? 64
    this.#concurrency = options.concurrency ?? Math.min(4, this.#maxSessions)
    this.#ttl = options.ttlMs ?? 30_000
    this.#retries = options.maxRetries ?? 1
    this.#now = options.now ?? Date.now
    if (!integer(this.#maxSessions, 1) || this.#maxSessions > 256 || !integer(this.#concurrency, 1)
      || this.#concurrency > Math.min(this.#maxSessions, 16) || !integer(this.#ttl, 1) || this.#ttl > 300_000
      || !integer(this.#retries) || this.#retries > 1) throw new RangeError('Invalid layered state limits')
  }

  metrics(): { readonly cachedSessions: number; readonly inFlight: number; readonly highWater: number } {
    return { cachedSessions: this.#states.size, inFlight: this.#active.size, highWater: this.#highWater }
  }

  async run(input: LayeredStateInput, work: (input: LayeredWorkInput) => LayeredWork<T> | Promise<LayeredWork<T>>,
    cancellation: Cancellation = noCancellation): Promise<LayeredStateResult<T>> {
    if (cancellation.cancelled) return { status: 'cancelled' }
    if (!input || !valid(input)) return { status: 'invalid' }
    input = { ...input, cut: { ...input.cut } }
    const { cut, digest, bindingTaskId } = input
    const key = JSON.stringify([cut.workspaceId, cut.sessionId])
    if (this.#active.has(key)) return { status: 'busy_session' }
    if (this.#active.size >= this.#concurrency) return { status: 'busy_global' }
    const previous = this.#states.get(key)
    const sameIncarnation = cut.incarnation === previous?.cut.incarnation
    if (previous && (cut.authorizationEpoch < previous.cut.authorizationEpoch || sameIncarnation && cut.cursor < previous.cut.cursor)) {
      return { status: 'stale' }
    }
    const invalidations = previous ? reasons(previous, input, this.#now(), this.#ttl) : []
    const reset = invalidations.some(reason => reason !== 'graph_changed')
    const memory = !previous || reset ? emptyMemory : invalidations.length
      ? Object.freeze({ ...previous.memory, pendingProposalIds: empty }) : previous.memory
    if (previous && sameIncarnation && cut.cursor === previous.cut.cursor) {
      if (previous.collision || previous.digest !== digest) {
        this.#states.set(key, { ...previous, memory: emptyMemory, collision: true })
        return { status: 'collision', invalidations: ['cursor_collision'] }
      }
      if (invalidations.length) this.#states.set(key, { ...previous, memory })
      return { status: 'duplicate', invalidations }
    }
    if (previous && invalidations.length) this.#states.set(key, { ...previous, memory })
    const lastAnalyzedCursor = sameIncarnation ? previous?.lastAnalyzedCursor ?? null : null
    this.#active.add(key)
    this.#highWater = Math.max(this.#active.size, this.#highWater)
    try {
      for (let attempt = 0; attempt <= this.#retries; attempt++) {
        if (cancellation.cancelled) return { status: 'cancelled' }
        const result = await work({ memory, attempt, bindingTaskId, lastAnalyzedCursor, cancellation })
        if (cancellation.cancelled) return { status: 'cancelled' }
        if (result.status === 'retry') continue
        if (result.status === 'stale') return { status: 'stale' }
        if (result.status !== 'complete' && result.status !== 'skip') return { status: 'failed' }
        const nextMemory = result.status === 'complete' ? mergeMemory(memory, result.updates, cut.cursor) : memory
        const updatedAt = result.status === 'skip' && previous && !reset ? previous.updatedAt : this.#now()
        this.#states.delete(key)
        if (this.#states.size === this.#maxSessions) {
          for (const oldest of this.#states.keys()) if (!this.#active.has(oldest)) {
            this.#states.delete(oldest)
            break
          }
        }
        this.#states.set(key, { ...input, updatedAt, collision: false, memory: nextMemory,
          lastAnalyzedCursor: result.status === 'complete' ? cut.cursor : lastAnalyzedCursor })
        return result.status === 'complete' ? { status: 'evaluated', value: result.value, invalidations }
          : { status: 'skipped', invalidations }
      }
      return { status: 'failed' }
    } catch {
      return { status: cancellation.cancelled ? 'cancelled' : 'failed' }
    } finally { this.#active.delete(key) }
  }
}
