import type { ScopeAuthority, WorkspaceScope, UnderstandingBudget, LayeredUnderstandingCandidate, UnderstandingContextInput,
  UnderstandingContextPackage, UnderstandingCut, UnderstandingFact, UnderstandingOmission, UnderstandingRetained,
  UnderstandingSpan, UnderstandingTaskInput, UnderstandingTurn } from '@acmi/contracts'
import { canonical, freeze } from './canonical.ts'

export const layeredContextLimits = freeze({ active: 8, historical: 2, facts: 12, retained: 8, bytes: 12288, tokens: 3000 })
const caps = layeredContextLimits
const maxTrustedRows = 512
const actors = new Set(['user', 'assistant', 'tool', 'subagent', 'host'])
const eventKinds = new Set(['message', 'causal', 'binding', 'authorization', 'metadata', 'closed'])
const factKinds = new Set(['tool-call', 'tool-result', 'subagent-completed', 'result-produced', 'binding-changed',
  'graph-conflict', 'authorization-changed', 'join-checked', 'execution-completed', 'result-inspected', 'result-consumed'])
const reasons = new Set(['explicit', 'binding', 'recent', 'lexical', 'historical', 'oracle'])
const rev = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const key = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{N}_.:@-]{1,128}$/u.test(value)
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const sensitive = /(?:-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,})\b|https?:\/\/[^\s/@]+:[^\s/@]+@)/u
const invalidText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Surrogate}]/u
const acceptable = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit && !invalidText.test(value) && !sensitive.test(value)
const smallList = (value: unknown, count: number, max: number): value is readonly string[] =>
  Array.isArray(value) && value.length <= count && value.every(x => acceptable(x, max) && x.trim())

export interface LayeredContextAccess {
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly scope: WorkspaceScope
  readonly sha256: (text: string) => string
  readonly permitsTask?: (scope: WorkspaceScope, taskId: string) => boolean
}
export type LayeredContextResult = { readonly status: 'ready'; readonly packet: UnderstandingContextPackage }
  | { readonly status: 'insufficient_context' | 'scope_denied'; readonly reason: string }

export function validUnderstandingCut(cut: UnderstandingCut): boolean {
  return Boolean(cut && [cut.workspaceId, cut.sessionId, cut.incarnation, cut.policyVersion].every(key)
    && [cut.authorizationEpoch, cut.bindingRevision, cut.graphRevision, cut.sourceRevision, cut.candidateRevision, cut.cursor].every(rev))
}

export function readUnderstandingSpan(turn: Pick<UnderstandingTurn, 'text'>, span: UnderstandingSpan): string | null {
  if (!span || !rev(span.start) || !rev(span.end) || span.start >= span.end || span.end > turn.text.length) return null
  const splitsPair = (at: number) => turn.text.charCodeAt(at - 1) >= 0xd800 && turn.text.charCodeAt(at - 1) <= 0xdbff
    && turn.text.charCodeAt(at) >= 0xdc00 && turn.text.charCodeAt(at) <= 0xdfff
  if (splitsPair(span.start) || splitsPair(span.end)) return null
  return turn.text.slice(span.start, span.end)
}

export function measureUnderstandingText(text: string): { bytes: number; estimatedTokens: number } {
  let ascii = 0
  let nonAscii = 0
  let bytes = 0
  for (const char of text) {
    const cp = char.codePointAt(0)!
    if (cp < 0x80) { ascii++; bytes++ }
    else { nonAscii++; bytes += cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4 }
  }
  return { bytes, estimatedTokens: Math.ceil(ascii / 4) + nonAscii }
}

function projectCut(cut: UnderstandingCut): UnderstandingCut {
  const { workspaceId, sessionId, incarnation, authorizationEpoch, bindingRevision, graphRevision, sourceRevision,
    candidateRevision, policyVersion, cursor } = cut
  return { workspaceId, sessionId, incarnation, authorizationEpoch, bindingRevision, graphRevision, sourceRevision,
    candidateRevision, policyVersion, cursor }
}

function candidate(row: UnderstandingTaskInput, handle: string): LayeredUnderstandingCandidate | null {
  if (!key(row.taskId) || !rev(row.revision) || !rev(row.lastActivity) || !acceptable(row.objective, 480) || !row.objective.trim()
    || !reasons.has(row.reason) || row.scope !== undefined && !acceptable(row.scope, 240)
    || row.activeWorkNode !== undefined && !key(row.activeWorkNode)
    || row.project !== undefined && !acceptable(row.project, 128)
    || row.aliases !== undefined && !smallList(row.aliases, 4, 96)
    || row.acceptedDecisions !== undefined && !smallList(row.acceptedDecisions, 3, 160)
    || row.blockers !== undefined && !smallList(row.blockers, 3, 160)) return null
  return { handle, taskId: row.taskId, catalogRevision: row.catalogRevision, status: row.status, revision: row.revision,
    objective: row.objective, reason: row.reason, lastActivity: row.lastActivity, bindable: row.status === 'open',
    ...(row.scope === undefined ? {} : { scope: row.scope }),
    ...(row.activeWorkNode === undefined || row.status === 'closed' ? {} : { activeWorkNode: row.activeWorkNode }),
    ...(row.project === undefined ? {} : { project: row.project }),
    ...(row.aliases === undefined ? {} : { aliases: [...row.aliases] }),
    ...(row.acceptedDecisions === undefined ? {} : { acceptedDecisions: [...row.acceptedDecisions] }),
    ...(row.blockers === undefined ? {} : { blockers: [...row.blockers] }) }
}

const budgetBase = { maxBytes: caps.bytes, maxEstimatedTokens: caps.tokens, estimator: 'ascii4-unicode1-v1' } as const
const placeholderDigest = '0'.repeat(64)
type ModelData = Omit<UnderstandingContextPackage, 'digest' | 'budget'>
const budgetFor = (body: ModelData): UnderstandingBudget => {
  let sizes = { bytes: 0, estimatedTokens: 0 }
  for (;;) {
    const next = measureUnderstandingText(JSON.stringify({ ...body, budget: { ...budgetBase, ...sizes }, digest: placeholderDigest }))
    if (next.bytes === sizes.bytes && next.estimatedTokens === sizes.estimatedTokens) return { ...budgetBase, ...next }
    sizes = next
  }
}

export function buildLayeredContext(input: UnderstandingContextInput, access: LayeredContextAccess): LayeredContextResult {
  const fail = (reason: string): LayeredContextResult => ({ status: 'insufficient_context', reason })
  if (!validUnderstandingCut(input.cut)) return fail('invalid_cut')
  const cut = projectCut(input.cut)
  const allowed = () => { try { return access.authority.permits(access.scope, cut.workspaceId) } catch { return false } }
  const taskAllowed = (id: string) => {
    try { return key(id) && (access.permitsTask?.(access.scope, id) ?? true) } catch { return false }
  }
  if (!allowed() || input.binding.taskId !== null && !taskAllowed(input.binding.taskId)) return { status: 'scope_denied', reason: 'scope' }
  const { id, kind, actor } = input.current
  if (!key(id) || !eventKinds.has(kind) || !actors.has(actor) || (kind === 'metadata' && actor !== 'host')) return fail('invalid_event')
  const text = kind === 'message' && actor === 'user' ? input.current.text : ''
  if (!acceptable(text, caps.bytes) || (kind === 'message' && actor === 'user' && !text.trim())) return fail('critical_turn_not_available')
  const currentDigest = access.sha256(text)
  if (!hex(currentDigest)) return fail('invalid_digest')
  const current = { id, actor, kind, text, digest: currentDigest }
  const active: LayeredUnderstandingCandidate[] = []
  const historical: LayeredUnderstandingCandidate[] = []
  const facts: UnderstandingFact[] = []
  const retained: UnderstandingRetained[] = []
  const omissions: UnderstandingOmission[] = []
  const omit = (section: UnderstandingOmission['section'], reason: UnderstandingOmission['reason']) => {
    const old = omissions.findIndex(x => x.section === section && x.reason === reason)
    if (old < 0) omissions.push({ section, reason, count: 1 })
    else omissions[old] = { section, reason, count: omissions[old]!.count + 1 }
  }
  const body: ModelData = { schemaVersion: 'understanding-context/v0.1', cut, current, binding: { taskId: input.binding.taskId },
    active, historical, facts, retained, omissions }
  const authorizedRows = (input.candidates ?? []).slice(0, maxTrustedRows).filter(row =>
    row?.workspaceId === cut.workspaceId && taskAllowed(row.taskId) && ['open', 'closed'].includes(row.status))
  const occurrences = new Map<string, number>()
  for (const row of authorizedRows) occurrences.set(row.taskId, (occurrences.get(row.taskId) ?? 0) + 1)
  for (const row of authorizedRows) {
    const section = row.status === 'open' ? 'active' : 'historical'
    if (row.catalogRevision !== cut.candidateRevision) { omit(section, 'stale_revision'); continue }
    const rows = section === 'active' ? active : historical
    const parsed = candidate(row, `${section === 'active' ? 'a' : 'h'}${rows.length + 1}`)
    if (!parsed || occurrences.get(row.taskId) !== 1) { omit(section, 'invalid_summary'); continue }
    if (rows.length >= caps[section]) { omit(section, 'candidate_limit'); continue }
    rows.push(parsed)
  }
  const factIds = new Set<string>()
  for (const row of (input.facts ?? []).slice(0, maxTrustedRows)) {
    if (row.workspaceId !== cut.workspaceId || row.sessionId !== cut.sessionId || row.incarnation !== cut.incarnation
      || row.relatedTaskId !== undefined && !taskAllowed(row.relatedTaskId)) continue
    if (row.sourceRevision !== cut.sourceRevision || !rev(row.cursor) || row.cursor > cut.cursor) { omit('facts', 'stale_revision'); continue }
    if (!key(row.id) || !factKinds.has(row.kind) || factIds.has(row.id) || row.cause !== undefined && !key(row.cause)
      || row.relatedWorkNodeId !== undefined && !key(row.relatedWorkNodeId) || row.relatedResultId !== undefined && !key(row.relatedResultId)
      || row.contentDigest !== undefined && !hex(row.contentDigest)) { omit('facts', 'invalid_summary'); continue }
    if (facts.length >= caps.facts) { omit('facts', 'item_limit'); continue }
    factIds.add(row.id)
    facts.push({ workspaceId: cut.workspaceId, sessionId: cut.sessionId, incarnation: cut.incarnation, cursor: row.cursor,
      sourceRevision: row.sourceRevision, id: row.id, kind: row.kind, ...(row.cause === undefined ? {} : { cause: row.cause }),
      ...(row.relatedTaskId === undefined ? {} : { relatedTaskId: row.relatedTaskId }),
      ...(row.relatedWorkNodeId === undefined ? {} : { relatedWorkNodeId: row.relatedWorkNodeId }),
      ...(row.relatedResultId === undefined ? {} : { relatedResultId: row.relatedResultId }),
      ...(row.contentDigest === undefined ? {} : { contentDigest: row.contentDigest }) })
  }
  for (const row of (input.retained ?? []).slice(0, maxTrustedRows)) {
    if (row.taskId !== undefined && !taskAllowed(row.taskId)) continue
    if (row.sourceRevision !== cut.sourceRevision || !rev(row.cursor) || row.cursor >= cut.cursor) { omit('retained', 'stale_revision'); continue }
    if (!key(row.ref) || !['identity', 'unresolved', 'proposal'].includes(row.kind)
      || row.kind === 'identity' && !active.some(x => x.taskId === row.taskId && x.revision === row.revision)) continue
    if (retained.length >= caps.retained) { omit('retained', 'item_limit'); continue }
    retained.push({ kind: row.kind, ref: row.ref, cursor: row.cursor, sourceRevision: row.sourceRevision,
      ...(row.taskId === undefined ? {} : { taskId: row.taskId }), ...(rev(row.revision) ? { revision: row.revision } : {}) })
  }
  let budget = budgetFor(body)
  while (budget.bytes > caps.bytes || budget.estimatedTokens > caps.tokens) {
    if (retained.pop()) omit('retained', 'budget')
    else if (historical.pop()) omit('historical', 'budget')
    else if (active.pop()) omit('active', 'budget')
    else if (facts.pop()) omit('facts', 'budget')
    else return fail('critical_turn_budget')
    budget = budgetFor(body)
  }
  // A dropped candidate cannot be disclosed indirectly by an identity hypothesis.
  for (let i = retained.length - 1; i >= 0; i--) {
    const row = retained[i]!
    if (row.kind === 'identity' && !active.some(x => x.taskId === row.taskId && x.revision === row.revision)) retained.splice(i, 1)
  }
  budget = budgetFor(body)
  const digest = access.sha256(canonical({ ...body, budget }))
  if (!hex(digest)) return fail('invalid_digest')
  if (!allowed() || input.binding.taskId !== null && !taskAllowed(input.binding.taskId)
    || [...active, ...historical].some(row => !taskAllowed(row.taskId))
    || facts.some(row => row.relatedTaskId !== undefined && !taskAllowed(row.relatedTaskId))
    || retained.some(row => row.taskId !== undefined && !taskAllowed(row.taskId))) return { status: 'scope_denied', reason: 'scope' }
  return { status: 'ready', packet: freeze({ ...body, budget, digest }) }
}
