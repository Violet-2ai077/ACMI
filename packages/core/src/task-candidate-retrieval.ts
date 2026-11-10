import type { CandidateCatalogEntry, CandidateLookup, CandidateRetrieval, Digest, RankedTaskCandidate,
  ScopeAuthority, WorkspaceScope } from '@acmi/contracts'
import { canonical, clone, freeze } from './canonical.ts'
import { isEventRef, isTaskId } from './guards.ts'
import { exactFields, runtimeIdentity } from './runtime-facts.ts'
import { qualificationHex, wellFormedQualificationText } from './qualification-evidence.ts'

const policy = 'bounded-task-candidates-v1' as const
const maxPostings = 32
const maxTokens = 12
const maxHints = 8
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export function candidateLexemes(text: string, limit = maxTokens): readonly string[] {
  const parts = text.slice(0, 2048).normalize('NFKC').toLowerCase().match(/\p{Script=Han}+|[\p{L}\p{N}]+/gu) ?? []
  const tokens = new Set<string>()
  for (const part of parts) {
    if (/^\p{Script=Han}/u.test(part)) {
      const chars = [...part]
      if (chars.length === 1) tokens.add(part)
      for (let i = 1; i < chars.length && tokens.size < limit; i++) tokens.add(chars[i - 1]! + chars[i]!)
    } else if (part.length > 1 && part.length <= 48 && !['the', 'a', 'an', 'to', 'and', 'for', 'of', 'is', 'it', 'we'].includes(part)) tokens.add(part)
    if (tokens.size >= limit) break
  }
  return [...tokens].slice(0, limit)
}
interface Indexed {
  readonly entry: CandidateCatalogEntry
  readonly title: Set<string>
  readonly objective: Set<string>
  readonly sessionKey?: string
}
interface CandidateIndexOptions {
  readonly workspaceId: string
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly digest: Digest
  readonly permitsTask?: (scope: WorkspaceScope, taskId: string) => boolean
  readonly maxEntries?: number
}
const sources = {
  explicit_reference: 'exact authorized Task reference',
  current_binding: 'trusted explicit current Binding',
  session_recent: 'exact Session incarnation recency',
  lexical: 'bounded title/objective index',
  workspace_recent: 'authorized Workspace recency',
} as const

/** Trusted Host refreshes a bounded catalog. Query visits fixed-size postings, not all Tasks. */
export class TaskCandidateIndex {
  readonly #options: CandidateIndexOptions
  readonly #cap: number
  readonly #rows = new Map<string, Indexed>()
  readonly #terms = new Map<string, string[]>()
  readonly #sessions = new Map<string, string[]>()
  readonly #recent: string[] = []
  constructor(options: CandidateIndexOptions) {
    this.#cap = options.maxEntries ?? 512
    if (!wellFormedQualificationText(options.workspaceId, 512) || !Number.isSafeInteger(this.#cap) || this.#cap < 1 || this.#cap > 2048) {
      throw new TypeError('Invalid candidate index options')
    }
    this.#options = { ...options }
  }
  #allowed(scope: WorkspaceScope, id: string): boolean {
    try { return this.#options.authority.permits(scope, this.#options.workspaceId)
      && (this.#options.permitsTask?.(scope, id) ?? true) } catch { return false }
  }
  #session(value: CandidateLookup['session']): string | undefined {
    return value && value.instanceId === this.#options.workspaceId
      && exactFields(value, ['adapterId', 'instanceId', 'sessionId', 'incarnation'])
      && isEventRef({ session: value, sourceRevision: 'catalog', localSeq: 0 }) ? runtimeIdentity(value) : undefined
  }
  #index(map: Map<string, string[]>, key: string, id: string, add: boolean) {
    const ids = map.get(key) ?? []
    this.#update(ids, id, add)
    if (ids.length) map.set(key, ids)
    else map.delete(key)
  }
  #update(ids: string[], id: string, add: boolean) {
    const old = ids.indexOf(id)
    if (old >= 0) ids.splice(old, 1)
    if (add) {
      const age = this.#rows.get(id)!.entry.lastActive
      const pos = ids.findIndex(other => {
        const value = this.#rows.get(other)!.entry.lastActive
        return age > value || age === value && cmp(id, other) < 0
      })
      ids.splice(pos < 0 ? ids.length : pos, 0, id)
    }
  }
  #apply(row: Indexed, add: boolean) {
    const id = row.entry.taskId
    for (const term of new Set([...row.title, ...row.objective])) this.#index(this.#terms, term, id, add)
    if (row.sessionKey) this.#index(this.#sessions, row.sessionKey, id, add)
    this.#update(this.#recent, id, add)
  }
  upsert(scope: WorkspaceScope, entry: CandidateCatalogEntry): void {
    if (!exactFields(entry, ['workspaceId', 'taskId', 'title', 'objective', 'status', 'lastActive', 'revision', 'session'])
      || entry.workspaceId !== this.#options.workspaceId || !isTaskId(entry.taskId) || !this.#allowed(scope, entry.taskId)
      || !wellFormedQualificationText(entry.title, 160) || !entry.title.trim() || !wellFormedQualificationText(entry.objective, 512)
      || !['open', 'closed'].includes(entry.status) || !Number.isSafeInteger(entry.lastActive) || entry.lastActive < 0
      || !qualificationHex(entry.revision) || entry.session && !this.#session(entry.session)) throw new TypeError('Candidate unavailable or invalid')
    const prior = this.#rows.get(entry.taskId)
    if (!prior && this.#rows.size >= this.#cap) throw new RangeError('Candidate index capacity reached')
    if (prior?.entry.status === 'open') this.#apply(prior, false)
    const sessionKey = this.#session(entry.session)
    const row = { entry: freeze(clone(entry)), title: new Set(candidateLexemes(entry.title, 24)),
      objective: new Set(candidateLexemes(entry.objective, 24)), ...(sessionKey ? { sessionKey } : {}) }
    this.#rows.set(entry.taskId, row)
    if (entry.status === 'open') this.#apply(row, true)
  }
  remove(scope: WorkspaceScope, id: string): boolean {
    if (!this.#allowed(scope, id)) return false
    const prior = this.#rows.get(id)
    if (prior?.entry.status === 'open') this.#apply(prior, false)
    return this.#rows.delete(id)
  }
  retrieve(scope: WorkspaceScope, request: CandidateLookup): CandidateRetrieval {
    const finish = (candidates: readonly RankedTaskCandidate[], postingsVisited: number, examined: number): CandidateRetrieval =>
      freeze({ version: policy, revision: this.#options.digest(canonical([policy, this.#options.workspaceId,
        candidates.map(({ taskId, revision, source, rank, score }) => [taskId, revision, source, rank, score])])),
      candidates, postingsVisited, examined })
    if (!this.#options.authority.permits(scope, this.#options.workspaceId)) return finish([], 0, 0)
    const limit = request.limit ?? 8
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8 || (request.query !== undefined
      && !wellFormedQualificationText(request.query, 2048)) || (request.explicitTaskIds?.length ?? 0) > maxHints) throw new TypeError('Invalid candidate lookup')
    const query = request.query ?? ''
    const literal = query.match(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu) ?? []
    const refs = new Set([...(request.explicitTaskIds ?? []), ...literal].slice(0, maxHints).filter(isTaskId))
    const session = this.#session(request.session)
    const tokens = candidateLexemes(query)
    const recent = this.#recent.slice(0, maxPostings)
    const sessionRecent = new Set(session ? this.#sessions.get(session)?.slice(0, maxPostings) ?? [] : [])
    const ids = new Set([...refs, ...sessionRecent, ...recent])
    if (isTaskId(request.currentTaskId)) ids.add(request.currentTaskId)
    let postingsVisited = 0
    for (const token of tokens) {
      for (const id of this.#terms.get(token)?.slice(0, maxPostings) ?? []) { ids.add(id); postingsVisited++ }
    }
    const ranked: Omit<RankedTaskCandidate, 'rank'>[] = []
    for (const id of ids) {
      const row = this.#rows.get(id)
      if (!row || row.entry.status !== 'open' || !this.#allowed(scope, id)) continue
      const title = tokens.filter(t => row.title.has(t)).length
      const objective = tokens.filter(t => row.objective.has(t)).length
      const source = refs.has(id) ? 'explicit_reference' : id === request.currentTaskId ? 'current_binding'
        : sessionRecent.has(id) ? 'session_recent' : title + objective > 0 ? 'lexical' : 'workspace_recent'
      const base = { explicit_reference: 3000, current_binding: 2500, session_recent: 2000, lexical: 1000, workspace_recent: 0 }[source]
      ranked.push({ ...row.entry, source, access: 'allowed', reason: sources[source], score: base + 4 * title + 2 * objective,
        matchingFields: [...(title ? ['title' as const] : []), ...(objective ? ['objective' as const] : [])] })
    }
    ranked.sort((a, b) => b.score - a.score || b.lastActive - a.lastActive || cmp(a.taskId, b.taskId))
    return finish(ranked.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 })), postingsVisited, ids.size)
  }
}
