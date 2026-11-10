import type { UnderstandingCandidateReason, UnderstandingCut, UnderstandingTaskInput } from '@acmi/contracts'
import { clone, freeze } from './canonical.ts'
import { layeredContextLimits, validUnderstandingCut } from './layered-context.ts'
import type { LayeredContextAccess } from './layered-context.ts'
import { candidateLexemes } from './task-candidate-retrieval.ts'

const maxRows = 512
const maxPostings = 24
const stable = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const normalizedMention = (value: string): string => value.normalize('NFKC').toLowerCase().trim()
export function literalMention(haystack: string, term: string): boolean {
  const needle = normalizedMention(term)
  if (!needle) return false
  const needsBoundary = /[a-z0-9]/u.test(needle)
  for (let start = haystack.indexOf(needle); start >= 0; start = haystack.indexOf(needle, start + 1)) {
    if (!needsBoundary || (!/[a-z0-9]/u.test(haystack[start - 1] ?? '') && !/[a-z0-9]/u.test(haystack[start + needle.length] ?? ''))) return true
  }
  return false
}
export interface LayeredCandidateQuery {
  readonly cut: UnderstandingCut
  readonly query: string
  readonly bindingTaskId: string | null
  readonly recentTaskIds?: readonly string[]
  readonly explicitTaskIds?: readonly string[]
}
export interface LayeredCandidateResult {
  readonly candidates: readonly UnderstandingTaskInput[]
  readonly examined: number
  readonly scopeDenied: boolean
}

interface Row {
  readonly summary: UnderstandingTaskInput
  readonly terms: ReadonlySet<string>
}

/** A versioned, in-memory summary index; not a history reader, authority or persistent store. */
export class LayeredCandidateIndex {
  readonly #workspace: string
  readonly #rows = new Map<string, Row>()
  readonly #postings = new Map<string, string[]>()
  readonly #recent: string[] = []
  constructor(workspaceId: string, summaries: readonly UnderstandingTaskInput[]) {
    this.#workspace = workspaceId
    if (summaries.length > maxRows) throw new RangeError('Layered summary catalog capacity exceeded')
    const rows = summaries.filter(row => row.workspaceId === workspaceId
      && ['open', 'closed'].includes(row.status) && Number.isSafeInteger(row.lastActivity))
      .sort((a, b) => b.lastActivity - a.lastActivity || stable(a.taskId, b.taskId))
    for (const summary of rows) {
      if (this.#rows.has(summary.taskId)) throw new TypeError('Duplicate candidate summary')
      const row = freeze(clone(summary))
      const terms = new Set(candidateLexemes([row.objective, ...(row.aliases ?? []).slice(0, 4)].join(' '), 24))
      this.#rows.set(row.taskId, { summary: row, terms })
      if (row.status === 'open' && this.#recent.length < maxPostings) this.#recent.push(row.taskId)
      for (const term of terms) {
        const postings = this.#postings.get(term) ?? []
        if (postings.length < maxPostings) postings.push(row.taskId)
        this.#postings.set(term, postings)
      }
    }
  }

  retrieve(request: LayeredCandidateQuery, access: Pick<LayeredContextAccess, 'authority' | 'scope' | 'permitsTask'>): LayeredCandidateResult {
    const scopeAllowed = () => {
      try { return access.authority.permits(access.scope, this.#workspace) } catch { return false }
    }
    if (!validUnderstandingCut(request.cut) || request.cut.workspaceId !== this.#workspace || !scopeAllowed()) {
      return { candidates: [], examined: 0, scopeDenied: true }
    }
    const text = normalizedMention(request.query.slice(0, 2048))
    const terms = candidateLexemes(text)
    const recent = (request.recentTaskIds ?? []).slice(0, 8)
    const explicit = new Set([...(request.explicitTaskIds ?? []).slice(0, 8),
      ...(text.match(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gu) ?? []).slice(0, 8),
      ...[...text.matchAll(/\btask:([a-z0-9_.-]{1,128})\b/gu)].slice(0, 8).map(match => match[1]!)])
    const visit = new Set([...explicit, ...(request.bindingTaskId ? [request.bindingTaskId] : []), ...recent, ...this.#recent])
    for (const term of terms) for (const id of this.#postings.get(term) ?? []) visit.add(id)
    const ranked: { row: UnderstandingTaskInput; score: number; reason: UnderstandingCandidateReason }[] = []
    for (const id of visit) {
      const indexed = this.#rows.get(id)
      if (!indexed) continue
      try { if (access.permitsTask && !access.permitsTask(access.scope, id)) continue } catch { continue }
      const row = indexed.summary
      if (row.catalogRevision !== request.cut.candidateRevision) continue
      const literal = (row.aliases ?? []).some(alias => literalMention(text, alias)) || literalMention(text, row.objective)
      const overlap = terms.filter(term => indexed.terms.has(term)).length
      const score = explicit.has(id) ? 200 : literal ? 100 + overlap
        : id === request.bindingTaskId && row.status === 'open' ? 75 : overlap ? 20 + overlap
          : recent.includes(id) && row.status === 'open' ? 5 : 0
      if (row.status === 'closed' && !explicit.has(id) && !literal && overlap < 2) continue
      ranked.push({ row, score, reason: row.status === 'closed' ? 'historical' : explicit.has(id) || literal ? 'explicit'
        : id === request.bindingTaskId ? 'binding' : overlap ? 'lexical' : 'recent' })
    }
    ranked.sort((a, b) => b.score - a.score || b.row.lastActivity - a.row.lastActivity || stable(a.row.taskId, b.row.taskId))
    if (!scopeAllowed()) return { candidates: [], examined: 0, scopeDenied: true }
    const pick = (status: UnderstandingTaskInput['status'], max: number) => ranked.filter(x => x.row.status === status)
      .slice(0, max).map(x => ({ ...x.row, reason: x.reason }))
    return freeze({ candidates: [...pick('open', layeredContextLimits.active), ...pick('closed', layeredContextLimits.historical)],
      examined: ranked.length, scopeDenied: false })
  }
}
