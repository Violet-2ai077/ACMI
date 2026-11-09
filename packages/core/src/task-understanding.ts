import type { Digest, GraphChange, GraphProposal, GraphStreamCut, SemanticSuggestion, StoredRuntimeFact } from '@acmi/contracts'
import { canonical } from './canonical.ts'
import { boundedText, exactFields, validateRuntimeFact } from './runtime-facts.ts'

const policy = 'bounded-suggestions-v1' as const
const nodeKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(v)
type Analysis = {
  readonly status: 'proposed'; readonly proposal: GraphProposal; readonly examined: number
} | { readonly status: 'unresolved'; readonly reason: 'invalid-suggestion' | 'missing-evidence' | 'ambiguous'; readonly examined: number }

function interpret(raw: unknown, cut: GraphStreamCut): { suggestion: SemanticSuggestion; changes: GraphChange[] } | null {
  if (!exactFields(raw, ['kind', 'evidenceId', 'parent', 'stages', 'text', 'topic', 'nodeId', 'resultId', 'executionId', 'stage',
    'objective', 'criteria', 'from', 'to', 'relation'])
    || typeof raw.evidenceId !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.evidenceId)) return null
  const base = { evidenceId: raw.evidenceId }
  switch (raw.kind) {
    case 'decompose': {
      if (!exactFields(raw, ['kind', 'evidenceId', 'parent', 'stages']) || !nodeKey(raw.parent) || !Array.isArray(raw.stages)
        || raw.stages.length < 1 || raw.stages.length > 8 || !cut.snapshot.nodes.some(n => n.id === raw.parent)) return null
      const stages: { id: string; title: string }[] = []
      const seen = new Set(cut.snapshot.nodes.map(n => n.id))
      for (const s of raw.stages) {
        if (!exactFields(s, ['id', 'title']) || !nodeKey(s.id) || !boundedText(s.title, 240) || seen.has(s.id)) return null
        stages.push({ id: s.id, title: s.title })
        seen.add(s.id)
      }
      const parent = raw.parent
      return { suggestion: { ...base, kind: raw.kind, parent, stages }, changes: stages.flatMap(({ id, title }) => [
        { kind: 'node-added', nodeId: id, title, role: 'work' },
        { kind: 'edge-added', from: parent, to: id, relation: 'decomposes_into' },
      ]) }
    }
    case 'next-action':
      if (!exactFields(raw, ['kind', 'evidenceId', 'text']) || !boundedText(raw.text, 1024) || !cut.snapshot.activeNodeId) return null
      return { suggestion: { ...base, kind: raw.kind, text: raw.text }, changes: [
        { kind: 'evidence-recorded', nodeId: cut.snapshot.activeNodeId, content: { kind: 'next-action', text: raw.text } },
      ] }
    case 'decision':
      if (!exactFields(raw, ['kind', 'evidenceId', 'text', 'topic']) || !boundedText(raw.text, 1024) || !nodeKey(raw.topic)) return null
      return { suggestion: { ...base, kind: raw.kind, text: raw.text, topic: raw.topic }, changes: [
        { kind: 'evidence-recorded', content: { kind: 'decision', state: 'accepted', topic: raw.topic, text: raw.text } },
      ] }
    case 'objective': {
      if (!exactFields(raw, ['kind', 'evidenceId', 'objective', 'criteria']) || !boundedText(raw.objective, 1024)
        || !Array.isArray(raw.criteria) || raw.criteria.length < 1 || raw.criteria.length > 8
        || !raw.criteria.every(c => boundedText(c, 256))) return null
      const { objective, criteria } = raw
      return { suggestion: { ...base, kind: raw.kind, objective, criteria }, changes: [{ kind: 'task-reframed', objective, criteria }] }
    }
    case 'dependency':
      if (!exactFields(raw, ['kind', 'evidenceId', 'from', 'to', 'relation']) || !nodeKey(raw.from) || !nodeKey(raw.to)
        || (raw.relation !== 'depends_on' && raw.relation !== 'joins_into')) return null
      return { suggestion: { ...base, kind: raw.kind, from: raw.from, to: raw.to, relation: raw.relation },
        changes: [{ kind: 'edge-added', from: raw.from, to: raw.to, relation: raw.relation }] }
    case 'advance':
      if (!exactFields(raw, ['kind', 'evidenceId', 'nodeId']) || !nodeKey(raw.nodeId)) return null
      return { suggestion: { ...base, kind: raw.kind, nodeId: raw.nodeId }, changes: [{ kind: 'mainline-advanced', nodeId: raw.nodeId }] }
    case 'work-result':
      if (!exactFields(raw, ['kind', 'evidenceId', 'text', 'nodeId', 'executionId', 'resultId']) || !boundedText(raw.text, 1024)
        || !nodeKey(raw.nodeId) || !nodeKey(raw.executionId) || !nodeKey(raw.resultId)) return null
      return { suggestion: { ...base, kind: raw.kind, text: raw.text, nodeId: raw.nodeId, executionId: raw.executionId, resultId: raw.resultId },
        changes: [{ kind: 'result-produced', resultId: raw.resultId, nodeId: raw.nodeId, executionId: raw.executionId,
          summary: raw.text, verified: false }] }
    case 'result-review':
      if (!exactFields(raw, ['kind', 'evidenceId', 'nodeId', 'resultId', 'stage']) || !nodeKey(raw.nodeId) || !nodeKey(raw.resultId)
        || (raw.stage !== 'inspected' && raw.stage !== 'consumed' && raw.stage !== 'accepted')) return null
      return { suggestion: { ...base, kind: raw.kind, nodeId: raw.nodeId, resultId: raw.resultId, stage: raw.stage },
        changes: [{ kind: 'result-reviewed', resultId: raw.resultId, nodeId: raw.nodeId, stage: raw.stage }] }
    case 'join':
      if (!exactFields(raw, ['kind', 'evidenceId', 'nodeId']) || !nodeKey(raw.nodeId)) return null
      return { suggestion: { ...base, kind: raw.kind, nodeId: raw.nodeId }, changes: [{ kind: 'join-satisfied', nodeId: raw.nodeId }] }
    default: return null
  }
}

/** Analyze a bounded, already-authorized delta. No writer, model client or raw Session is accepted. */
export function proposeGraphChanges(cut: GraphStreamCut, delta: readonly StoredRuntimeFact[], sha: Digest, input?: unknown): Analysis {
  const facts = delta.slice(-64).filter(({ attribution, fact }) => attribution.kind === 'assigned'
    && attribution.taskId === cut.snapshot.taskId && validateRuntimeFact(fact, cut.workspaceId, sha))
  const examined = Math.min(delta.length, 64)
  const failure = input === undefined ? facts.reverse().find(f => f.fact.detail.kind === 'turn-failed') : undefined
  if (input === undefined && !failure) return { status: 'unresolved', reason: 'ambiguous', examined }
  const raw = input === undefined
    ? { kind: 'next-action', evidenceId: failure!.fact.eventId, text: 'Inspect the failed execution before retrying.' }
    : input
  const interpreted = interpret(raw, cut)
  if (!interpreted || cut.snapshot.task?.closed) return { status: 'unresolved', reason: 'invalid-suggestion', examined }
  const match = facts.find(row => row.fact.eventId === interpreted.suggestion.evidenceId)
  if (!match) return { status: 'unresolved', reason: 'missing-evidence', examined }
  // A reference is evidence of observation, not proof that the proposed text was present in a message.
  const body = {
    version: 'graph-proposal-v1', policy, taskId: cut.snapshot.taskId, workspaceId: cut.workspaceId,
    baseRevision: cut.revision, sourceRevision: cut.snapshot.sourceRevision, status: 'proposed',
    requiresConfirmation: true, provenance: 'heuristic_proposed', ...interpreted,
    evidence: [{ eventId: match.fact.eventId, source: match.fact.source, provenance: 'runtime_observed' }],
  } as const
  return { status: 'proposed', proposal: { ...body, id: sha(canonical(body)) }, examined }
}
