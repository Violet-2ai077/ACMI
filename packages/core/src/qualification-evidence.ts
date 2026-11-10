import type { Digest, EvidenceRole, GraphChange, GroundingInput, GroundingStatus, GroundingVerdict,
  QualificationEvidence, QualificationEvidenceLink, StoredRuntimeFact } from '@acmi/contracts'
import { canonical, freeze } from './canonical.ts'
import { isTaskId } from './guards.ts'
import { boundedText, validateRuntimeFact } from './runtime-facts.ts'

export const qualificationEvidencePolicy = 'qualification-evidence-v1' as const
export const qualificationExcerptLimit = 1024
export const qualificationHex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v)
export const wellFormedQualificationText = (v: unknown, limit: number): v is string => typeof v === 'string'
  && v.length > 0 && v.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(v)
const literal = (v: string) => v.normalize('NFKC').trim().replace(/[.!\u3002\uff01]$/u, '').trim()
const clean = (v: string) => literal(v).toLowerCase()
const strong = (v: string) => !/[?\uff1f\r\n]/u.test(v)
  && !/\b(?:maybe|unless|however|but|might|if)\b|\u4f46\u662f|\u5148\u6bd4\u8f83|\u5982\u679c|\u53ef\u80fd/iu.test(v)
export const explicitDecisionBasis = 'Explicit user confirmation.'

export interface QualificationAttachment {
  readonly generation: number
  readonly excerpt?: string
  readonly start?: number
  readonly totalLength?: number
  readonly revoked?: boolean
  readonly hostConfirmation?: QualificationEvidence['hostConfirmation']
}

/** The caller must obtain the fact and optional bytes from the trusted Host, not model output. */
export function makeQualificationEvidence(row: StoredRuntimeFact, taskId: string, sha: Digest,
  attachment: QualificationAttachment,
): QualificationEvidence | null {
  const { fact, attribution } = row
  if (!isTaskId(taskId) || !validateRuntimeFact(fact, fact.workspaceId, sha) || fact.workspaceId !== fact.source.session.instanceId
    || attribution.kind !== 'assigned' || attribution.taskId !== taskId || !Number.isSafeInteger(attachment.generation)
    || attachment.generation < 1) return null
  const d = fact.detail
  const actor = d.kind === 'user' ? 'user' : d.kind === 'assistant' ? 'assistant' : d.kind === 'tool-result' ? 'tool' : 'runtime'
  const text = attachment.excerpt
  const start = attachment.start ?? 0
  const totalLength = attachment.totalLength ?? text?.length ?? 0
  if (text !== undefined && (!wellFormedQualificationText(text, qualificationExcerptLimit) || !text.trim()
    || actor === 'runtime' || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(totalLength)
    || totalLength < start + text.length || totalLength > 1_048_576)) return null
  const confirmation = attachment.hostConfirmation
  if (confirmation && (!qualificationHex(confirmation.claimHash) || !boundedText(confirmation.reviewerId, 96)
    || !boundedText(confirmation.reason, 512) || !confirmation.reviewerId.trim() || !confirmation.reason.trim())) return null
  const body = { version: qualificationEvidencePolicy, factId: fact.eventId, taskId, workspaceId: fact.workspaceId,
    source: fact.source, detailKind: d.kind, actor,
    ...('turn' in d ? { turn: d.turn } : {}), ...('step' in d ? { step: d.step } : {}),
    ...(text === undefined ? {} : { excerpt: { text, hash: sha(text), start, end: start + text.length,
      totalLength, truncated: start !== 0 || text.length !== totalLength } }),
    ...(confirmation ? { hostConfirmation: { ...confirmation } } : {}),
    provenance: text === undefined ? 'runtime_metadata' : 'synthetic_host_attested_excerpt',
    generation: attachment.generation, revoked: attachment.revoked === true,
  } as const
  return freeze({ ...body, revision: sha(canonical(body)) })
}
export const qualificationEvidenceLink = (evidence: QualificationEvidence): QualificationEvidenceLink => ({
  factId: evidence.factId, sourceRevision: evidence.source.sourceRevision, evidenceRevision: evidence.revision,
  excerptHash: evidence.excerpt?.hash ?? null,
})

function decisionEvidence(change: Extract<GraphChange, { kind: 'evidence-recorded' }>, evidence: QualificationEvidence,
  claimHash: string,
): { status: GroundingStatus; reason: string; role?: EvidenceRole } {
  const d = change.content
  if (d.kind !== 'decision') return { status: 'insufficient', reason: 'decision-required' }
  if (d.state === 'accepted' && evidence.hostConfirmation?.claimHash === claimHash) {
    return { status: 'supported', role: 'host_confirmation', reason: 'host-confirmed-exact-claim' }
  }
  const text = evidence.excerpt?.text
  if (d.state === 'proposed') return text && ['user', 'assistant'].includes(evidence.actor) && clean(text).includes(clean(d.text))
    && (!d.rationale || clean(text).includes(clean(d.rationale))) && (d.alternatives ?? []).every(x => clean(text).includes(clean(x)))
    ? { status: 'supported', role: 'contextual_support', reason: 'sourced-suggestion-only' }
    : { status: 'insufficient', reason: 'decision-suggestion-content-missing' }
  if (evidence.actor !== 'user') return { status: 'authority', reason: 'not-user-confirmation' }
  if (!text || evidence.excerpt?.truncated) return { status: 'insufficient', reason: 'ambiguous-confirmation' }
  const [statement, ...detail] = text.split(/\r?\n/u)
  if (!statement || !strong(statement) || detail.some(line => !/^(?:rationale|alternative)\s*:/iu.test(line.trim()))) {
    return { status: 'insufficient', reason: 'ambiguous-confirmation' }
  }
  const details = detail.map(clean)
  const rationaleSupported = !d.rationale || d.rationale === explicitDecisionBasis || details.includes('rationale: ' + clean(d.rationale))
  const alternativesSupported = (d.alternatives ?? []).every(x => details.includes('alternative: ' + clean(x)))
  if (!rationaleSupported || !alternativesSupported) return { status: 'insufficient', reason: 'decision-rationale-or-alternatives-unsubstantiated' }
  const normalized = clean(statement)
  const topic = d.topic.toLowerCase()
  const choice = clean(d.text)
  if (!topic || !choice) return { status: 'insufficient', reason: 'empty-decision-claim' }
  const yes = /^(?:approve|confirm|use)\s+([a-z0-9_.-]+)\s*:\s*(.+)$/u.exec(normalized)
    ?? /^(?:\u53ef\u4ee5[,\uff0c]\s*)?(?:\u5b58\u50a8\s+)?([a-z0-9_.-]+)\s*:\s*(?:\u91c7\u7528|\u4f7f\u7528)\s*(.+)$/u.exec(normalized)
  const no = /^(?:do not approve|reject|withdraw)\s+([a-z0-9_.-]+)\s*:\s*(.+)$/u.exec(normalized)
    ?? /^(?:\u4e0d\u91c7\u7528|\u5426\u51b3)\s*([a-z0-9_.-]+)\s*:\s*(.+)$/u.exec(normalized)
  if (no?.[1] === topic && clean(no[2]!) === choice) return d.state === 'accepted'
    ? { status: 'contradicted', role: 'contradiction', reason: 'explicit-user-rejection' }
    : ['disputed', 'rejected', 'superseded'].includes(d.state)
      ? { status: 'supported', role: 'negative_evidence', reason: 'explicit-user-rejection' }
      : { status: 'insufficient', reason: 'unsupported-decision-state' }
  return d.state === 'accepted' && yes?.[1] === topic && clean(yes[2]!) === choice
    ? { status: 'supported', role: 'user_confirmation', reason: 'explicit-exact-decision-confirmation' }
    : { status: 'insufficient', reason: 'decision-claim-not-confirmed' }
}

function userGraphSupport(change: GraphChange, raw: string, batch: readonly GraphChange[], active?: string): boolean {
  const text = literal(raw)
  const same = (a: string, b: string) => Boolean(literal(a)) && literal(a) === literal(b)
  const list = (input: string | undefined, expected: readonly string[]) => {
    const parts = input?.split(/[;\uff1b]/u) ?? []
    return parts.length === expected.length && parts.every((p, i) => same(p, expected[i]!))
  }
  const clauses = raw.split(/\r?\n/u).filter(line => line.trim()).map(literal)
  const clause = (pattern: RegExp, ...fields: string[]) => clauses.some(line => {
    const match = pattern.exec(line)
    return match && fields.every((field, i) => same(match[i + 1] ?? '', field))
  })
  const node = (id: string) => batch.find(c => c.kind === 'node-added' && c.nodeId === id)
  const label = (id: string) => {
    const n = node(id)
    return n?.kind === 'node-added' ? n.title : id
  }
  const decomposition = /^(?:split(?: ([A-Za-z0-9_.:-]+))? into|parallel|\u62c6\u5206)\s*:\s*(.+)$/iu.exec(text)
  const stages = decomposition?.[2]?.split(/[;\uff1b]/u) ?? []
  const decomposedParent = decomposition?.[1] ?? active
  const isStage = (value: string) => stages.some(stage => same(stage, value))
  switch (change.kind) {
    case 'edge-added': {
      if (!clauses.every(line => strong(line) && !/\b(?:no|not|never|don't)\b|\u4e0d\u4f9d\u8d56/iu.test(line))) return false
      const from = label(change.from), to = label(change.to)
      if (change.relation === 'depends_on') return clause(/^(.+?)\s+(?:depends on|waits for)\s+(.+)$/iu, from, to)
        || clause(/^(.+?)\s*\u4f9d\u8d56\s*(.+)$/u, from, to)
        || clause(/^continue:\s*dependency\s+(.+?)\s+->\s+(.+)$/iu, from, to)
      if (change.relation === 'decomposes_into') return node(change.to) !== undefined && isStage(to) && change.from === decomposedParent
      if (change.relation === 'joins_into') return clause(/^require (.+?) for (.+)$/iu, from, to)
      if (change.relation === 'references') return clause(/^optional (.+?) for (.+)$/iu, to, from)
      return clause(/^(.+?) precedes (.+)$/iu, from, to)
    }
    case 'node-added': return change.role === 'work' ? isStage(change.title) && batch.some(c =>
      c.kind === 'edge-added' && c.relation === 'decomposes_into' && c.to === change.nodeId && c.from === decomposedParent)
      : clause(/^create join:\s*(.+)$/iu, change.title)
        && batch.some(c => c.kind === 'edge-added' && c.relation === 'joins_into' && c.to === change.nodeId)
    case 'node-refined': {
      const match = /^continue:\s*refine\s+([^\s:]+)\s*:\s*(.+)$/iu.exec(text)
      return match?.[1] === change.nodeId && list(match[2], [change.description, ...change.criteria])
    }
    case 'task-reframed': return list(/^(?:continue:\s*)?set objective:\s*(.+)$/iu.exec(text)?.[1], [change.objective, ...change.criteria])
    case 'work-transitioned': {
      const match = /^continue:\s*(block|ready|mark completed|confirm completed)\s+([^\s]+)$/iu.exec(text)
      return match?.[2] === change.nodeId && (match[1]!.toLowerCase() === 'block' ? 'blocked'
        : match[1]!.toLowerCase() === 'ready' ? 'ready' : 'completed') === change.state
    }
    case 'result-reviewed': return change.stage !== 'accepted'
      && clause(/^result (\S+) (\S+) for (\S+)$/u, change.resultId, change.stage, change.nodeId)
    case 'evidence-recorded': {
      const c = change.content
      if (c.kind === 'result-assessment') return change.nodeId !== undefined
        && clause(/^(reject|supersede) result (\S+) for (\S+):\s*(.+)$/u,
          c.state === 'rejected' ? 'reject' : 'supersede', c.resultId, change.nodeId, c.text)
      if (c.kind === 'constraint') return c.explicit === true && c.category !== undefined && c.validity !== undefined
        && clause(/^constraint (\S+) (\S+) (\S+):\s*(.+)$/iu, change.nodeId ?? 'task', c.category, c.validity, c.text)
      if (c.kind === 'next-action') return change.nodeId === active && clause(/^(?:continue:\s*)?next action:\s*(.+)$/iu, c.text)
      return false
    }
    default: return false
  }
}

export function validateGroundedChange(input: GroundingInput, sha: Digest): GroundingVerdict {
  const { workspaceId, taskId, evidence, link, change } = input
  const claimHash = sha(canonical(change))
  const answer = (status: GroundingStatus, reason: string, role?: EvidenceRole): GroundingVerdict =>
    ({ status, reason, claimHash, ...(role ? { role } : {}) })
  if (!evidence || !link || evidence.revoked) return answer('unavailable', 'evidence-unavailable')
  if (evidence.workspaceId !== workspaceId || evidence.source.session.instanceId !== workspaceId || evidence.taskId !== taskId) {
    return answer('scope', 'evidence-out-of-scope')
  }
  const { revision, ...body } = evidence
  if (evidence.version !== qualificationEvidencePolicy || sha(canonical(body)) !== revision
    || evidence.excerpt && sha(evidence.excerpt.text) !== evidence.excerpt.hash
    || canonical(qualificationEvidenceLink(evidence)) !== canonical(link)) return answer('stale', 'evidence-revision-or-hash-mismatch')
  if (change.kind === 'evidence-recorded' && change.content.kind === 'decision') {
    const { status, reason, role } = decisionEvidence(change, evidence, claimHash)
    return answer(status, reason, role)
  }
  if (change.kind === 'result-observed') {
    if (evidence.actor !== 'tool' || evidence.detailKind !== 'tool-result') return answer('authority', 'result-not-observed-tool-content')
    const excerpt = evidence.excerpt
    const text = excerpt?.text
    const lines = text?.split(/\r?\n/u) ?? []
    // An excerpt's boundary may cut a result line in half.
    if (excerpt && excerpt.start > 0) lines.shift()
    if (excerpt && excerpt.end < excerpt.totalLength) lines.pop()
    if (!text || /ignore (?:previous|all)|system prompt|modify (?:the )?graph|\u5ffd\u7565.{0,8}\u6307\u4ee4/iu.test(text)
      || !lines.some(line => line.trim() === change.summary.trim() && line.trim().length > 0)) {
      return answer('insufficient', 'result-summary-not-extractive')
    }
    return answer('supported', 'bounded-exact-result-excerpt', 'tool_result_content')
  }
  if (change.kind === 'evidence-recorded' && change.content.kind === 'next-action' && evidence.detailKind === 'turn-failed'
    && change.content.text === 'Inspect the failed execution before retrying.') return answer('supported', 'known-failed-turn-rule', 'runtime_fact')
  if (evidence.actor !== 'user') return answer('authority', 'user-evidence-required')
  if (evidence.excerpt && !evidence.excerpt.truncated
    && userGraphSupport(change, evidence.excerpt.text, input.batch ?? [], input.activeNodeId)) {
    return answer('supported', 'exact-scoped-user-content', 'direct_support')
  }
  return answer('insufficient', 'claim-not-directly-supported')
}
