import type { UnderstandingContextPackage } from '@acmi/contracts'
import { freeze } from './canonical.ts'
import { validateLayeredClaims } from './layered-claims.ts'
import type { LayeredClaimGraph, LayeredClaimKind, LayeredClaimValidation } from './layered-claims.ts'
import { measureUnderstandingText } from './layered-context.ts'
import { understandLayered } from './layered-pipeline.ts'
import type { LayeredInterpretation } from './layered-pipeline.ts'

type DraftArgs = { readonly kind: LayeredClaimKind } & Record<string, unknown>
const structuredGrammar: readonly [RegExp, readonly string[], LayeredClaimKind][] = [
  [/^Suggest decision (\S+) for (\S+): (.+)$/iu, ['decisionId', 'topic', 'text'], 'decision-proposed'],
  [/^Approve decision (\S+) for (\S+): (.+)$/iu, ['decisionId', 'topic', 'text'], 'decision-accepted'],
  [/^Reject decision (\S+) for (\S+): (.+)$/iu, ['decisionId', 'topic', 'text'], 'decision-rejected'],
  [/^Supersede decision (\S+) with (\S+) for (\S+): (.+)$/iu, ['priorDecisionId', 'decisionId', 'topic', 'text'], 'decision-superseded'],
  [/^Refine objective: (.+)$/iu, ['objective'], 'objective-refined'],
  [/^Set work (\S+) to (\S+)$/iu, ['nodeId', 'state'], 'work-transition'],
  [/^Propose branch (\S+) under (\S+): (.+)$/iu, ['branchId', 'nodeId', 'title'], 'branch-proposed'],
  [/^Propose work (\S+) under (\S+): (.+)$/iu, ['nodeId', 'parentNodeId', 'title'], 'worknode-proposed'],
  [/^Refine work (\S+): (.+)$/iu, ['nodeId', 'objective'], 'worknode-refined'],
  [/^Record constraint for (\S+): (.+)$/iu, ['target', 'text'], 'constraint-proposed'],
  [/^Propose next action for (\S+): (.+)$/iu, ['nodeId', 'text'], 'next-action-proposed'],
  [/^Work (\S+) depends on (\S+)$/iu, ['from', 'to'], 'dependency-proposed'],
]

function recognize(text: string): DraftArgs | null {
  for (const [pattern, keys, kind] of structuredGrammar) {
    const groups = pattern.exec(text)
    if (groups) return { kind, ...Object.fromEntries(keys.map((key, i) => [key, groups[i + 1]!])) }
  }
  const join = /^Configure join (\S+) (all-of|any-of) (.+)$/iu.exec(text)
  return join ? { kind: 'join-proposed', nodeId: join[1], predicate: join[2], prerequisites: join[3]!.split(', ') } : null
}

/** Provider-neutral read-side interface; its JSON is not trusted and cannot invoke host operations. */
export interface LayeredProposalAnalyzer {
  propose(packet: UnderstandingContextPackage, interpretation: LayeredInterpretation): string
}

export const scriptedLayeredProposalAnalyzer: LayeredProposalAnalyzer = freeze({
  propose(packet: UnderstandingContextPackage, interpretation: LayeredInterpretation): string {
    const claims: Record<string, unknown>[] = []
    if (packet.current.actor === 'user') {
      for (const [i, act] of interpretation.utterance.entries()) {
        const resolved = interpretation.identities[i]
        if (!resolved || resolved.status === 'historical' || resolved.status === 'ambiguous' || resolved.status === 'unassigned') continue
        const candidate = resolved.status === 'active' ? packet.active.find(x => x.handle === resolved.handle)
          : packet.active.find(x => x.taskId === packet.binding.taskId)
        if (!candidate) continue
        const raw = packet.current.text.slice(act.span.start, act.span.end)
        const text = raw.replace(/[;；\n]+$/u, '').trimEnd()
        const args = recognize(text)
        if (!args) continue
        claims.push({ id: 'draft-' + claims.length, taskHandle: candidate.handle, ...args, evidence: [{
          source: 'turn', id: packet.current.id, sourceRevision: packet.cut.sourceRevision,
          span: { start: 0, end: packet.current.text.length }, excerpt: packet.current.text, turnDigest: packet.current.digest,
        }] })
      }
    }
    const resultKind = { 'tool-result': 'result-observed', 'result-produced': 'result-produced',
      'result-inspected': 'result-inspected', 'result-consumed': 'result-consumed' } as const
    for (const fact of packet.facts) {
      if (claims.length >= 16 || fact.cursor !== packet.cut.cursor) continue
      const candidate = packet.active.find(x => x.taskId === fact.relatedTaskId)
      if (!candidate || !fact.cause) continue
      const fields = fact.kind === 'execution-completed' || fact.kind === 'subagent-completed'
        ? fact.relatedWorkNodeId ? { kind: 'execution-completed', nodeId: fact.relatedWorkNodeId, cause: fact.cause } : null
        : fact.kind in resultKind && fact.relatedResultId ? { kind: resultKind[fact.kind as keyof typeof resultKind], resultId: fact.relatedResultId } : null
      if (fields) claims.push({ id: 'draft-' + claims.length, taskHandle: candidate.handle, ...fields,
        evidence: [{ source: 'fact', id: fact.id, sourceRevision: fact.sourceRevision }] })
    }
    return JSON.stringify({ cut: packet.cut, claims })
  },
})

export interface LayeredAnalysis {
  readonly interpretation: LayeredInterpretation
  readonly graph: LayeredClaimValidation
  readonly rawClaimKinds: readonly string[]
}
export function analyzeLayered(packet: UnderstandingContextPackage, graph: LayeredClaimGraph,
  options: { readonly singlePass?: boolean; readonly analyzer?: LayeredProposalAnalyzer } = {}): LayeredAnalysis {
  const interpretation = understandLayered(packet, options)
  const reject = (reason: string): LayeredAnalysis => freeze({
    interpretation, graph: { status: 'abstain', reason, claims: [], drafts: [] }, rawClaimKinds: [],
  })
  let draft: unknown
  try {
    const text = (options.analyzer ?? scriptedLayeredProposalAnalyzer).propose(packet, interpretation)
    if (typeof text !== 'string' || text.length > 16384 || measureUnderstandingText(text).bytes > 16384) return reject('analyzer_output_budget')
    draft = JSON.parse(text)
  } catch { return reject('analyzer_invalid_output') }
  const claims = (draft as { claims?: unknown } | null)?.claims
  const rawClaimKinds = Array.isArray(claims) ? claims.slice(0, 16)
    .map((x: { kind?: unknown } | null) => typeof x?.kind === 'string' && /^[a-z-]{1,48}$/u.test(x.kind) ? x.kind : 'invalid') : []
  return freeze({ interpretation, graph: validateLayeredClaims(packet, graph, draft), rawClaimKinds })
}
