import type { UnderstandingActor, UnderstandingContextPackage, UnderstandingCut, UnderstandingFact,
  UnderstandingFactKind, UnderstandingSpan } from '@acmi/contracts'
import { freeze } from './canonical.ts'
import { readUnderstandingSpan, validUnderstandingCut } from './layered-context.ts'

type WorkState = 'pending' | 'ready' | 'blocked' | 'running' | 'completed'
type Node = { readonly id: string; readonly taskId: string; readonly kind: 'work' | 'join'; readonly state: WorkState }
type Edge = { readonly from: string; readonly to: string; readonly relation: 'depends_on' | 'decomposes_into' | 'joins_into' }
type Decision = { readonly id: string; readonly taskId: string; readonly topic: string; readonly text: string;
  readonly state: 'proposed' | 'accepted' | 'rejected' | 'superseded'; readonly supersedes?: string }
type ProtectedContent = { readonly id: string; readonly sourceRevision: number; readonly digest: string;
  readonly actor: 'tool' | 'subagent'; readonly text: string }
type Result = { readonly id: string; readonly nodeId: string; readonly cause: string; readonly content?: ProtectedContent }

/** A trusted read snapshot; it is not provided by the analyzer. No raw tool output belongs here. */
export interface LayeredClaimGraph {
  readonly workspaceId: string
  readonly graphRevision: number
  readonly topologyComplete: boolean
  readonly decisionLineageComplete?: boolean
  readonly nodes: readonly Node[]
  readonly edges: readonly Edge[]
  readonly decisions: readonly Decision[]
  readonly results: readonly Result[]
}

type Data = Readonly<Record<string, unknown>>
type FieldKind = 'id' | 'text' | 'ids'
const fields = {
  'decision-proposed': { decisionId: 'id', topic: 'id', text: 'text' },
  'decision-accepted': { decisionId: 'id', topic: 'id', text: 'text' },
  'decision-rejected': { decisionId: 'id', topic: 'id', text: 'text' },
  'decision-superseded': { decisionId: 'id', priorDecisionId: 'id', topic: 'id', text: 'text' },
  'objective-refined': { objective: 'text' },
  'worknode-proposed': { nodeId: 'id', parentNodeId: 'id', title: 'text' },
  'worknode-refined': { nodeId: 'id', objective: 'text' },
  'constraint-proposed': { target: 'id', text: 'text' },
  'next-action-proposed': { nodeId: 'id', text: 'text' },
  'work-transition': { nodeId: 'id', state: 'id' },
  'branch-proposed': { nodeId: 'id', branchId: 'id', title: 'text' },
  'dependency-proposed': { from: 'id', to: 'id' },
  'join-proposed': { nodeId: 'id', predicate: 'id', prerequisites: 'ids' },
  'execution-completed': { nodeId: 'id', cause: 'id' },
  'result-observed': { resultId: 'id' },
  'result-produced': { resultId: 'id' },
  'result-summary-proposed': { resultId: 'id', summary: 'text' },
  'result-inspected': { resultId: 'id' },
  'result-consumed': { resultId: 'id' },
  'result-accepted': { resultId: 'id' },
  'join-satisfied': { nodeId: 'id' },
  'mainline-advanced': { nodeId: 'id' },
} as const satisfies Readonly<Record<string, Readonly<Record<string, FieldKind>>>>

export type LayeredClaimKind = keyof typeof fields
export type LayeredClaimRelationship = 'supports' | 'contextualizes' | 'contradicts' | 'insufficient'
type EvidenceBase = { readonly id: string; readonly sourceRevision: number }
type TurnEvidence = EvidenceBase & { readonly source: 'turn'; readonly span: UnderstandingSpan; readonly excerpt: string;
  readonly turnDigest: string }
type FactEvidence = EvidenceBase & { readonly source: 'fact' }
type ContentEvidence = EvidenceBase & { readonly source: 'result-content'; readonly span: UnderstandingSpan;
  readonly excerpt: string; readonly digest: string }
type Evidence = TurnEvidence | FactEvidence | ContentEvidence
type Claim = { readonly id: string; readonly kind: LayeredClaimKind; readonly taskHandle: string;
  readonly args: Readonly<Record<string, string>>; readonly prerequisites: readonly string[];
  readonly evidence: readonly Evidence[] }

export type LayeredClaimEvidenceReceipt = EvidenceBase & {
  readonly sourceType: 'turn' | 'runtime-fact' | 'protected-result-content'
  readonly actor: UnderstandingActor
  readonly role: 'direct' | 'context' | 'counterevidence' | 'insufficient'
  readonly span?: UnderstandingSpan
  readonly protectedExcerptRef?: { readonly id: string; readonly digest: string }
}
export interface LayeredClaimReceipt {
  readonly claimId: string
  readonly kind: LayeredClaimKind
  readonly relationship: LayeredClaimRelationship
  readonly uncertainty: 'review_only' | 'unresolved'
  readonly reason: string
  readonly evidence: readonly LayeredClaimEvidenceReceipt[]
}
export interface LayeredClaimValidation {
  readonly status: 'draft' | 'clarify' | 'abstain' | 'unresolved'
  readonly reason: string
  readonly claims: readonly LayeredClaimReceipt[]
  readonly drafts: readonly {
    readonly claimId: string
    readonly kind: LayeredClaimKind
    readonly taskHandle: string
    readonly arguments: Readonly<Record<string, string>>
    readonly prerequisites: readonly string[]
  }[]
}

const cutKeys = ['workspaceId', 'sessionId', 'incarnation', 'authorizationEpoch', 'bindingRevision', 'graphRevision',
  'sourceRevision', 'candidateRevision', 'policyVersion', 'cursor'] as const satisfies readonly (keyof UnderstandingCut)[]
const key = (x: unknown): x is string => typeof x === 'string' && /^[\p{L}\p{N}_.:@-]{1,128}$/u.test(x)
const digest = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x)
const revision = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const phrase = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 512
  && x.trim() === x && !/[;\uff1b\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(x)

function record(value: unknown): Data | null {
  if (!value || typeof value !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) return null
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || !descriptors[k]!.enumerable
    || !Object.hasOwn(descriptors[k]!, 'value'))) return null
  return value as Data
}

const keysAre = (value: Data, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k))

function readEvidence(input: unknown): Evidence | null {
  const row = record(input)
  if (!row || !key(row.id) || !revision(row.sourceRevision)) return null
  const base = { id: row.id, sourceRevision: row.sourceRevision }
  const keys = ['source', 'id', 'sourceRevision']
  if (row.source === 'fact') return keysAre(row, keys) ? { ...base, source: 'fact' } : null
  const span = record(row.span)
  if (!span || !keysAre(span, ['start', 'end']) || !revision(span.start) || !revision(span.end) || span.start >= span.end
    || typeof row.excerpt !== 'string' || row.excerpt.length > 12288) return null
  const excerpt = { ...base, span: { start: span.start, end: span.end }, excerpt: row.excerpt }
  keys.push('span', 'excerpt')
  if (row.source === 'turn' && keysAre(row, [...keys, 'turnDigest']) && digest(row.turnDigest))
    return { ...excerpt, source: 'turn', turnDigest: row.turnDigest }
  if (row.source === 'result-content' && keysAre(row, [...keys, 'digest']) && digest(row.digest))
    return { ...excerpt, source: 'result-content', digest: row.digest }
  return null
}

function readClaim(input: unknown): Claim | null {
  const row = record(input)
  if (!row || !key(row.id) || !key(row.taskHandle) || typeof row.kind !== 'string' || !Object.hasOwn(fields, row.kind)
    || !Array.isArray(row.evidence) || row.evidence.length < 1 || row.evidence.length > 4) return null
  const kind = row.kind as LayeredClaimKind
  const schema = Object.entries(fields[kind])
  if (!keysAre(row, ['id', 'taskHandle', 'kind', 'evidence', ...schema.map(([name]) => name)])) return null
  const args: Record<string, string> = {}
  let prerequisites: readonly string[] = []
  for (const [name, type] of schema) {
    const value = row[name]
    if (type === 'ids') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 8 || !Array.from(value).every(key)) return null
      prerequisites = Array.from(value) as string[]
    } else if (type === 'id' ? key(value) : phrase(value)) args[name] = value as string
    else return null
  }
  const evidence: Evidence[] = []
  for (const link of row.evidence) {
    const parsed = readEvidence(link)
    if (!parsed || evidence.some(e => e.source === parsed.source && e.id === parsed.id)) return null
    evidence.push(parsed)
  }
  return { id: row.id, kind, taskHandle: row.taskHandle, args, prerequisites, evidence }
}

function indexed<T extends { readonly id: string }>(items: readonly T[], limit: number): ReadonlyMap<string, T> | null {
  if (!Array.isArray(items) || items.length > limit) return null
  const byId = new Map<string, T>()
  for (const item of items) {
    if (!item || !key(item.id) || byId.has(item.id)) return null
    byId.set(item.id, item)
  }
  return byId
}

function graphIndex(graph: LayeredClaimGraph) {
  const nodes = indexed(graph.nodes, 512), decisions = indexed(graph.decisions, 512), results = indexed(graph.results, 512)
  if (!nodes || !decisions || !results || !Array.isArray(graph.edges) || graph.edges.length > 2048) return null
  if ([...nodes.values()].some(n => !key(n.taskId) || !['work', 'join'].includes(n.kind) || !Object.hasOwn(transitions, n.state))
    || [...decisions.values()].some(d => !key(d.taskId) || !key(d.topic) || typeof d.text !== 'string' || d.text.length > 4096
      || !['proposed', 'accepted', 'rejected', 'superseded'].includes(d.state) || d.supersedes !== undefined && !key(d.supersedes))
    || [...results.values()].some(r => !key(r.nodeId) || !key(r.cause))
    || graph.edges.some(e => !e || !key(e.from) || !key(e.to) || !['depends_on', 'decomposes_into', 'joins_into'].includes(e.relation))) return null
  return { nodes, decisions, results, edges: graph.edges, topologyComplete: graph.topologyComplete === true,
    decisionLineageComplete: graph.decisionLineageComplete === true }
}
type GraphIndex = NonNullable<ReturnType<typeof graphIndex>>

const value = (c: Claim, field: string) => c.args[field]!

function expectedClause(c: Claim): string | null {
  const get = (field: string) => value(c, field)
  const subject = `${get('decisionId')} for ${get('topic')}: ${get('text')}`
  switch (c.kind) {
    case 'decision-proposed': return `Suggest decision ${subject}`
    case 'decision-accepted': return `Approve decision ${subject}`
    case 'decision-rejected': return `Reject decision ${subject}`
    case 'decision-superseded': return `Supersede decision ${get('priorDecisionId')} with ${subject}`
    case 'objective-refined': return `Refine objective: ${get('objective')}`
    case 'worknode-proposed': return `Propose work ${get('nodeId')} under ${get('parentNodeId')}: ${get('title')}`
    case 'worknode-refined': return `Refine work ${get('nodeId')}: ${get('objective')}`
    case 'constraint-proposed': return `Record constraint for ${get('target')}: ${get('text')}`
    case 'next-action-proposed': return `Propose next action for ${get('nodeId')}: ${get('text')}`
    case 'work-transition': return `Set work ${get('nodeId')} to ${get('state')}`
    case 'branch-proposed': return `Propose branch ${get('branchId')} under ${get('nodeId')}: ${get('title')}`
    case 'dependency-proposed': return `Work ${get('from')} depends on ${get('to')}`
    case 'join-proposed': return `Configure join ${get('nodeId')} ${get('predicate')} ${c.prerequisites.join(', ')}`
    default: return null
  }
}

function decisionProblem(c: Claim, task: string, g: GraphIndex): string | null {
  const id = value(c, 'decisionId'), old = g.decisions.get(id)
  const topic = value(c, 'topic'), text = value(c, 'text')
  const atTopic = [...g.decisions.values()].filter(d => d.taskId === task && d.topic === topic)
  if (c.kind === 'decision-proposed') return old || atTopic.some(d => d.text === text && ['proposed', 'accepted'].includes(d.state))
    ? 'decision-already-present' : null
  if (c.kind !== 'decision-superseded') {
    if (!old || old.taskId !== task || old.topic !== topic || old.text !== text) return 'decision-not-in-scope'
    if (c.kind === 'decision-accepted' && atTopic.some(d => d.id !== id && d.state === 'accepted')) return 'decision-lineage-required'
    return old.state === 'proposed' || (c.kind === 'decision-rejected' && old.state === 'accepted') ? null : 'invalid-decision-state'
  }
  if (!g.decisionLineageComplete) return 'decision-lineage-incomplete'
  const priorId = value(c, 'priorDecisionId'), prior = g.decisions.get(priorId)
  if (old || !prior || id === priorId || prior.taskId !== task || prior.topic !== topic || prior.state !== 'accepted'
    || prior.text === text || atTopic.some(d => d.id !== priorId && d.state === 'accepted')
    || [...g.decisions.values()].some(d => d.supersedes === priorId)) return 'decision-lineage-invalid'
  const seen = new Set([id])
  for (let current: Decision | undefined = prior; current; current = g.decisions.get(current.supersedes ?? '')) {
    if (seen.has(current.id) || current.taskId !== task || current.topic !== topic
      || (current.supersedes && g.decisions.get(current.supersedes)?.state !== 'superseded')) return 'decision-lineage-invalid'
    seen.add(current.id)
  }
  return null
}

const transitions: Readonly<Record<WorkState, readonly WorkState[]>> = {
  pending: ['ready', 'blocked'], ready: ['running', 'blocked'], running: ['completed', 'blocked'],
  blocked: ['ready'], completed: [],
}

function graphProblem(c: Claim, task: string, g: GraphIndex): string | null {
  const get = (field: string) => value(c, field)
  const node = (id: string, kind?: Node['kind']) => {
    const n = g.nodes.get(id)
    return n?.taskId === task && (!kind || n.kind === kind) ? n : null
  }
  const openWork = (id: string) => {
    const n = node(id, 'work')
    return n && n.state !== 'completed'
  }
  const newWork = (parent: string, local: string) => openWork(parent) && /^draft:[A-Za-z0-9_.-]+$/u.test(local) && !g.nodes.has(local)
  switch (c.kind) {
    case 'decision-proposed': case 'decision-accepted': case 'decision-rejected': case 'decision-superseded':
      return decisionProblem(c, task, g)
    case 'work-transition': {
      const current = node(get('nodeId'), 'work')
      return current && transitions[current.state]?.includes(get('state') as WorkState) ? null : 'invalid-work-transition'
    }
    case 'branch-proposed': return newWork(get('nodeId'), get('branchId')) ? null : 'invalid-branch-parent-or-id'
    case 'worknode-proposed': return newWork(get('parentNodeId'), get('nodeId')) ? null : 'invalid-work-parent-or-id'
    case 'worknode-refined': case 'next-action-proposed':
      return openWork(get('nodeId')) ? null : 'work-node-not-open-or-in-scope'
    case 'constraint-proposed':
      return get('target') === 'task' || openWork(get('target')) ? null : 'constraint-target-not-open-or-in-scope'
    case 'dependency-proposed': {
      const from = get('from'), to = get('to')
      if (!g.topologyComplete) return 'dependency-topology-incomplete'
      if (!node(from, 'work') || !node(to, 'work') || from === to) return 'dependency-endpoints-invalid'
      return g.edges.some(e => e.relation === 'depends_on' && e.from === from && e.to === to) ? 'dependency-already-present' : null
    }
    case 'join-proposed': {
      const join = node(get('nodeId'), 'join')
      if (!g.topologyComplete) return 'dependency-topology-incomplete'
      if (!join || !['pending', 'blocked'].includes(join.state) || !['all-of', 'any-of'].includes(get('predicate'))
        || new Set(c.prerequisites).size !== c.prerequisites.length || c.prerequisites.some(id => !node(id, 'work')))
        return 'join-predicate-or-inputs-invalid'
      if (g.edges.some(e => e.relation === 'joins_into' && e.to === join.id)) return 'join-already-configured'
      return null
    }
    case 'execution-completed': case 'mainline-advanced':
      return node(get('nodeId'), 'work') ? null : 'work-node-not-in-scope'
    case 'join-satisfied': return node(get('nodeId'), 'join') ? null : 'join-not-in-scope'
    case 'objective-refined': return null
    default: {
      const result = g.results.get(get('resultId'))
      return result && node(result.nodeId, 'work') && key(result.cause) ? null : 'result-not-in-scope'
    }
  }
}

type Match = Omit<LayeredClaimEvidenceReceipt, 'role'> & { readonly fact?: UnderstandingFact }
const factActor = (kind: UnderstandingFactKind): UnderstandingActor =>
  kind === 'tool-call' || kind === 'tool-result' ? 'tool' : kind === 'subagent-completed' ? 'subagent' : 'host'

function factInCut(fact: UnderstandingFact, cut: UnderstandingCut, task: string): boolean {
  return fact.relatedTaskId === task && fact.workspaceId === cut.workspaceId && fact.sessionId === cut.sessionId
    && fact.incarnation === cut.incarnation && revision(fact.cursor) && fact.cursor <= cut.cursor
    && revision(fact.sourceRevision) && fact.sourceRevision <= cut.sourceRevision
}

function matchEvidence(link: Evidence, context: UnderstandingContextPackage, task: string, result?: Result): Match | null {
  const { id, sourceRevision } = link
  if (link.source === 'fact') {
    const rows = context.facts.filter(f => f.id === id)
    const f = rows[0]
    if (rows.length !== 1 || !f || f.sourceRevision !== sourceRevision || !factInCut(f, context.cut, task)) return null
    return { id, sourceRevision, sourceType: 'runtime-fact', actor: factActor(f.kind), fact: f }
  }
  if (link.source === 'turn') {
    const t = context.current
    if (t.id !== id || t.kind !== 'message' || sourceRevision !== context.cut.sourceRevision || t.digest !== link.turnDigest
      || readUnderstandingSpan(t, link.span) !== link.excerpt) return null
    return { id, sourceRevision, actor: t.actor, sourceType: 'turn', span: link.span,
      protectedExcerptRef: { id, digest: t.digest } }
  }
  const content = result?.content
  if (!content || content.id !== id || content.sourceRevision !== sourceRevision || content.digest !== link.digest
    || (content.actor !== 'tool' && content.actor !== 'subagent') || typeof content.text !== 'string'
    || content.text.length > 1024 || readUnderstandingSpan(content, link.span) !== link.excerpt) return null
  return { id, sourceRevision, actor: content.actor, sourceType: 'protected-result-content', span: link.span,
    protectedExcerptRef: { id, digest: content.digest } }
}

type EvidenceJudgment = { readonly relationship: LayeredClaimRelationship; readonly reason: string;
  readonly direct?: readonly Match[]; readonly counter?: Match }
const judged = (relationship: LayeredClaimRelationship, reason: string, direct?: readonly Match[]): EvidenceJudgment =>
  direct ? { relationship, reason, direct } : { relationship, reason }

function turnJudgment(c: Claim, context: UnderstandingContextPackage, task: string, matches: readonly Match[],
  expected: string, clauses: ReadonlySet<string>): EvidenceJudgment {
  const source = matches.find(m => m.sourceType === 'turn')
  if (!source || !source.span) return judged('insufficient', 'user-content-required')
  if (source.actor !== 'user' && !(source.actor === 'assistant' && c.kind === 'decision-proposed'))
    return judged('contextualizes', 'actor-not-authoritative')
  if (context.binding.taskId !== task) return judged('insufficient', 'task-binding-required-for-turn')
  const text = context.current.text
  // The cited positive substring cannot hide a later correction or an outer quote/condition.
  if (source.span.start !== 0 || source.span.end !== text.length) return judged('insufficient', 'complete-turn-required')
  if (/[?\uff1f]/u.test(text)) return judged('insufficient', 'question-not-confirmation')
  if (/["'`\u00ab\u00bb\u2018\u2019\u201c\u201d\u300c-\u300f\uff02]/u.test(text) || /^\s*>/mu.test(text))
    return judged('insufficient', 'quoted-content')
  if (/\b(?:if|unless|maybe|might|suppose|hypothetical|provided|but|however|except|assuming|subject to|when|after|once)\b|\u5982\u679c|\u5047\u5982|\u53ef\u80fd|\u4f46|\u5148\u6bd4\u8f83|\u9664\u975e|\u53ea\u8981|\u524d\u63d0/iu.test(text))
    return judged('insufficient', 'conditional-or-hypothetical')
  const statements = text.split(/[;\uff1b\n]/u).map(x => x.trim()).filter(Boolean)
  const counter = c.kind === 'decision-accepted' ? `Reject decision ${value(c, 'decisionId')} for ${value(c, 'topic')}: ${value(c, 'text')}` : null
  if (source.actor === 'user' && statements.some(x => x === counter || x === `Do not ${expected}`))
    return { relationship: 'contradicts', reason: 'explicit-counterevidence', counter: source }
  if (c.kind !== 'constraint-proposed' && /\b(?:no|not|never|cannot)\b|\u4e0d\u8981|\u4e0d\u540c\u610f|\u4e0d\u91c7\u7528|\u5426\u51b3/iu.test(text))
    return judged('insufficient', 'negated-or-unresolved')
  if (statements.includes(expected) && statements.every(x => clauses.has(x)))
    return judged('supports', 'exact-scoped-turn', [source])
  return judged('insufficient', 'claim-not-directly-supported')
}

const factKinds: Readonly<Partial<Record<LayeredClaimKind, readonly UnderstandingFactKind[]>>> = {
  'execution-completed': ['execution-completed', 'subagent-completed'], 'result-observed': ['tool-result'],
  'result-produced': ['result-produced'], 'result-summary-proposed': ['tool-result', 'result-produced'],
  'result-inspected': ['result-inspected'], 'result-consumed': ['result-consumed'],
}

function runtimeJudgment(c: Claim, matches: readonly Match[], result?: Result): EvidenceJudgment {
  const kinds = factKinds[c.kind]
  if (!kinds) return judged('contextualizes', 'explicit-trusted-host-review-required')
  const eligible = matches.filter(({ fact: f }) => f && kinds.includes(f.kind) && (result
    ? f.cause === result.cause && f.relatedResultId === result.id
      && (f.relatedWorkNodeId === undefined || f.relatedWorkNodeId === result.nodeId)
    : f.relatedWorkNodeId === value(c, 'nodeId') && f.cause === value(c, 'cause')))
  if (!eligible.length) return judged('insufficient', 'exact-typed-causal-fact-required')
  if (c.kind !== 'result-summary-proposed') return judged('supports', 'exact-typed-causal-fact', eligible)
  const content = result?.content
  const source = matches.find(m => m.sourceType === 'protected-result-content')
  const linked = eligible.filter(m => m.fact?.contentDigest === content?.digest && m.sourceRevision === content?.sourceRevision
    && (m.fact?.kind !== 'tool-result' || content?.actor === 'tool'))
  if (!content || !source || !linked.length || source.span?.start !== 0 || source.span.end !== content.text.length
    || value(c, 'summary') !== content.text || /ignore (?:previous|all)|system prompt|modify (?:the )?graph/iu.test(content.text))
    return judged('insufficient', 'bounded-protected-result-content-required')
  return judged('supports', 'extractive-summary-proposal-only', [source, ...linked])
}

function receipt(c: Claim, judgment: EvidenceJudgment, matches: readonly Match[] = []): LayeredClaimReceipt {
  return { claimId: c.id, kind: c.kind, relationship: judgment.relationship, reason: judgment.reason,
    uncertainty: judgment.relationship === 'supports' ? 'review_only' : 'unresolved',
    evidence: matches.map(({ fact: _fact, ...e }) => {
      const same = (m: Match) => m.id === e.id && m.sourceType === e.sourceType
      return { ...e, role: judgment.counter && same(judgment.counter) ? 'counterevidence'
        : judgment.direct?.some(same) ? 'direct' : judgment.relationship === 'insufficient' ? 'insufficient' : 'context' }
    }) }
}

function evaluate(c: Claim, context: UnderstandingContextPackage, g: GraphIndex,
  clauses: ReadonlySet<string>): LayeredClaimReceipt {
  const available = context.active.filter(a => a.handle === c.taskHandle && a.bindable && a.status === 'open')
  if (available.length !== 1 || !available[0]) return receipt(c, judged('insufficient', 'task-handle-not-active'))
  const task = available[0].taskId
  if (c.kind === 'objective-refined' && available[0].objective === value(c, 'objective'))
    return receipt(c, judged('insufficient', 'objective-already-present'))
  const problem = graphProblem(c, task, g)
  if (problem) return receipt(c, judged('insufficient', problem))
  const result = g.results.get(value(c, 'resultId'))
  const matches = c.evidence.map(link => matchEvidence(link, context, task, result))
  if (matches.some(m => m === null)) return receipt(c, judged('insufficient', 'evidence-reference-or-span-mismatch'))
  const verified = matches.filter((m): m is Match => m !== null)
  if (context.facts.some(f => f.kind === 'graph-conflict' && factInCut(f, context.cut, task) && f.sourceRevision === context.cut.sourceRevision))
    return receipt(c, judged('insufficient', 'trusted-graph-conflict'), verified)
  const expected = expectedClause(c)
  const judgment = expected ? turnJudgment(c, context, task, verified, expected, clauses) : runtimeJudgment(c, verified, result)
  return receipt(c, judgment, verified)
}

function conflictKey(c: Claim): string {
  const get = (name: string) => value(c, name)
  const lane = c.kind.startsWith('decision-') ? ['decision', get('topic')]
    : c.kind === 'dependency-proposed' ? [c.kind, get('from'), get('to')]
    : c.kind === 'branch-proposed' ? [c.kind, get('branchId')]
    : c.kind === 'constraint-proposed' ? [c.kind, get('target')]
    : [c.kind, get('nodeId') ?? get('resultId') ?? '', get('cause') ?? '']
  return JSON.stringify([c.taskHandle, ...lane])
}

function batchConflicts(claims: readonly Claim[]): boolean {
  const ids = new Set<string>(), lanes = new Set<string>(), decisions = new Set<string>(), fresh = new Set<string>()
  for (const c of claims) {
    const lane = conflictKey(c)
    if (ids.has(c.id) || lanes.has(lane)) return true
    ids.add(c.id); lanes.add(lane)
    if (c.kind === 'branch-proposed' || c.kind === 'worknode-proposed') {
      const id = value(c, c.kind === 'branch-proposed' ? 'branchId' : 'nodeId')
      if (fresh.has(id)) return true
      fresh.add(id)
    }
    for (const id of [value(c, 'decisionId'), value(c, 'priorDecisionId')]) {
      if (id === undefined) continue
      if (decisions.has(id)) return true
      decisions.add(id)
    }
  }
  return false
}

function topologyProblem(g: GraphIndex, changes: readonly Claim[]): string | null {
  if (!changes.length) return null
  const neighbors = new Map([...g.nodes.keys()].map(k => [k, new Set<string>()]))
  const push = (from: string, to: string): boolean => {
    if (!neighbors.has(to) || !neighbors.has(from)) return false
    neighbors.get(from)!.add(to)
    return true
  }
  // Orient each constraint from dependent to prerequisite, including Join branches.
  for (const e of g.edges) {
    if (e.relation !== 'depends_on' && e.relation !== 'decomposes_into' && e.relation !== 'joins_into') return 'dependency-topology-incomplete'
    if (!(e.relation === 'joins_into' ? push(e.to, e.from) : push(e.from, e.to))) return 'dependency-topology-incomplete'
  }
  for (const c of changes) {
    if (c.kind === 'join-proposed') for (const id of c.prerequisites) push(value(c, 'nodeId'), id)
    else push(value(c, 'from'), value(c, 'to'))
  }
  const remaining = new Map([...neighbors.keys()].map(k => [k, 0]))
  for (const adjacent of neighbors.values()) for (const v of adjacent) remaining.set(v, remaining.get(v)! + 1)
  const queue = [...remaining.entries()].filter(([, n]) => n === 0).map(([id]) => id)
  for (let i = 0; i < queue.length; i++) for (const v of neighbors.get(queue[i]!)!) {
    const n = remaining.get(v)! - 1
    remaining.set(v, n)
    if (n === 0) queue.push(v)
  }
  return queue.length === neighbors.size ? null : 'dependency-cycle'
}

/** Validates inert decoded analyzer JSON against trusted Host snapshots. Never returns an apply operation. */
export function validateLayeredClaims(context: UnderstandingContextPackage, graph: LayeredClaimGraph,
  draft: unknown): LayeredClaimValidation {
  const answer = (status: LayeredClaimValidation['status'], reason: string,
    claims: readonly LayeredClaimReceipt[] = [], drafts: LayeredClaimValidation['drafts'] = []): LayeredClaimValidation =>
    freeze({ status, reason, claims, drafts })
  const raw = record(draft)
  const cut = record(raw?.cut)
  if (!raw || !keysAre(raw, ['cut', 'claims']) || !cut || !keysAre(cut, cutKeys)
    || !Array.isArray(raw.claims) || raw.claims.length > 16) return answer('abstain', 'draft-schema-invalid')
  if (!validUnderstandingCut(context.cut) || !cutKeys.every(k => cut[k] === context.cut[k])
    || graph.workspaceId !== context.cut.workspaceId || graph.graphRevision !== context.cut.graphRevision)
    return answer('unresolved', 'scope-or-revision-fence-mismatch')
  if (raw.claims.length === 0) return answer('abstain', 'no-claims')
  const parsed = Array.from(raw.claims, readClaim)
  if (parsed.some(c => c === null)) return answer('abstain', 'claim-or-evidence-schema-invalid')
  const claims = parsed.filter((c): c is Claim => c !== null)
  if (batchConflicts(claims)) return answer('unresolved', 'duplicate-or-conflicting-claims')
  const view = graphIndex(graph)
  if (!view) return answer('unresolved', 'graph-read-view-unavailable')
  const clauses = new Set(claims.map(expectedClause).filter((c): c is string => c !== null))
  const receipts = claims.map(c => evaluate(c, context, view, clauses))
  const changes = claims.filter((c, i) => receipts[i]?.relationship === 'supports'
    && (c.kind === 'join-proposed' || c.kind === 'dependency-proposed'))
  const topology = topologyProblem(view, changes)
  if (topology) return answer('unresolved', topology, receipts.map(r => changes.some(c => c.id === r.claimId)
    ? { ...r, relationship: 'insufficient', uncertainty: 'unresolved', reason: topology,
      evidence: r.evidence.map(e => ({ ...e, role: 'context' })) } : r))
  if (receipts.every(r => r.relationship === 'supports')) return answer('draft', 'grounded-for-review-only', receipts,
    claims.map(c => ({ claimId: c.id, kind: c.kind, taskHandle: c.taskHandle, arguments: c.args, prerequisites: c.prerequisites })))
  return receipts.some(r => r.relationship === 'contradicts')
    ? answer('unresolved', 'contradictory-evidence', receipts) : answer('clarify', 'claims-not-fully-grounded', receipts)
}
