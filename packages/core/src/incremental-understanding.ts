import type { Digest, UnderstandingCandidate, UnderstandingEvidence, UnderstandingInput, UnderstandingMode,
  UnderstandingPacket, UnderstandingProposal } from '@acmi/contracts'
import { canonical, freeze } from './canonical.ts'
import { estimateContextTokens } from './context-assembly.ts'
import { isTaskId } from './guards.ts'
import { boundedText, runtimeIdentity, validateRuntimeFact } from './runtime-facts.ts'
import { compileUnderstandingOperations } from './understanding-graph.ts'
import { classifyUnderstandingIntent, explicitUnderstandingOperations } from './understanding-intent.ts'
import { parseUnderstandingOutput } from './understanding-schema.ts'

export const understandingPolicy = 'incremental-understanding-v1' as const
export const understandingFactLimit = 32
export const understandingCandidateLimit = 8
export const understandingDefaultBudget = 16_384
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v)
const alias = (v: string) => /^[A-Za-z0-9_.:-]{1,96}$/u.test(v)

export function isUnderstandingTrigger(kind: UnderstandingEvidence['kind']): boolean {
  return ['user', 'turn-complete', 'turn-failed', 'tool-result'].includes(kind)
}
function collect(input: UnderstandingInput, sha: Digest) {
  const { cut } = input
  const taskId = cut.snapshot.taskId
  const candidates = input.candidates.slice(0, understandingCandidateLimit).filter(c => c.workspaceId === cut.workspaceId
    && isTaskId(c.taskId) && alias(c.alias) && boundedText(c.objective, 512) && hash(c.revision))
  const current = candidates.some(c => c.taskId === input.currentTaskId) ? input.currentTaskId : undefined
  const facts = input.facts.slice(-understandingFactLimit).filter(({ attribution, fact }) =>
    fact.source.session.instanceId === cut.workspaceId && validateRuntimeFact(fact, cut.workspaceId, sha)
    && (attribution.kind === 'assigned' && attribution.taskId === taskId
      || attribution.kind === 'unassigned' && fact.eventId === input.anchorId && fact.detail.kind === 'user'))
  const anchor = facts.find(r => r.fact.eventId === input.anchorId)
  const user = anchor?.fact.detail.kind === 'user' && input.user?.provenance === 'synthetic_host_excerpt'
    && input.user.evidenceId === anchor.fact.eventId && boundedText(input.user.text, 1024)
    ? { evidenceId: input.user.evidenceId, provenance: input.user.provenance, text: input.user.text } : undefined
  return { cut, candidates, current, facts, anchor, user }
}

function buildPacket(input: UnderstandingInput, context: ReturnType<typeof collect>): UnderstandingPacket | null {
  const { cut, candidates, facts, user } = context
  const { snapshot } = cut
  const task = snapshot.task
  if (!task || !context.anchor || snapshot.pending || !Number.isSafeInteger(input.budget) || input.budget > 32_768) return null
  const active = snapshot.activeNodeId
  const nodes = snapshot.nodes.slice(-31)
  const selected = active && !nodes.some(n => n.id === active) ? snapshot.nodes.find(n => n.id === active) : undefined
  if (selected) nodes.unshift(selected)
  const visible = new Set(nodes.map(n => n.id))
  const packet: UnderstandingPacket = {
    anchorId: input.anchorId,
    task: { objective: task.objective, criteria: task.criteria, ...(active ? { activeNodeId: active } : {}) },
    candidates: candidates.map(({ taskId, alias, objective }) => ({ taskId, alias, objective })),
    facts: facts.map(({ fact }) => ({ eventId: fact.eventId, kind: fact.detail.kind })),
    nodes: nodes.map(({ id, title, state, description, criteria }) => ({ id, title, state,
      ...(description ? { description } : {}), ...(criteria ? { criteria } : {}) })),
    edges: snapshot.edges.slice(-64).filter(e => visible.has(e.from) && visible.has(e.to)).map(({ from, to, relation }) => ({ from, to, relation })),
    executions: snapshot.executions.slice(-16).filter(e => visible.has(e.nodeId)).map(({ id, nodeId, state }) => ({ id, nodeId, state })),
    results: [...snapshot.results.slice(-16), ...snapshot.dependencies.slice(-16)].filter(r => visible.has(r.nodeId)).map(({ id, nodeId }) => ({ id, nodeId })),
    decisions: snapshot.evidence.slice(-24).flatMap(e => e.content.kind === 'decision' && !e.superseded
      ? [{ id: e.id, topic: e.content.topic, state: e.content.state }] : []),
    reviews: snapshot.reviews.slice(-16).filter(r => visible.has(r.nodeId)).map(({ resultId, nodeId, stage, disposition }) =>
      ({ resultId, nodeId, stage, ...(disposition ? { disposition } : {}) })),
    pending: (input.pending ?? []).slice(0, 8).filter(hash), ...(user ? { user } : {}),
  }
  return estimateContextTokens(canonical(packet)) + 192 <= input.budget ? freeze(packet) : null
}

export function buildUnderstandingPacket(input: UnderstandingInput, sha: Digest): UnderstandingPacket | null {
  return buildPacket(input, collect(input, sha))
}

export function analyzeUnderstanding(input: UnderstandingInput, sha: Digest, modelJson?: string,
  mode: UnderstandingMode = modelJson === undefined ? 'rules' : 'structured-mock'): UnderstandingProposal {
  const collected = collect(input, sha)
  const { cut, candidates, current, facts, anchor, user } = collected
  const packet = buildPacket(input, collected)
  const intent = classifyUnderstandingIntent(packet?.user, current, candidates)
  const unresolved: string[] = []
  if (!anchor) unresolved.push('missing-or-out-of-scope-evidence')
  else if (!packet) unresolved.push('budget-insufficient')
  if (intent.kind === 'uncertain') unresolved.push(user ? 'ambiguous-user-intent' : 'no-authoritative-user-cue')
  if (intent.kind === 'create_new' || intent.kind === 'switch_existing') unresolved.push('routing-requires-separate-host-action')
  const evidence: UnderstandingEvidence[] = facts.map(({ fact }) => ({ eventId: fact.eventId, source: fact.source,
    kind: fact.detail.kind, provenance: 'runtime_observed' }))
  const sourceRevision = sha(canonical([input.anchorId, evidence]))
  const candidateRevision = sha(canonical([current ?? null, candidates]))
  const taskId = cut.snapshot.taskId
  const seed = [understandingPolicy, cut.workspaceId, taskId, sourceRevision, candidateRevision, cut.revision]
  const allocate = (slot: string) => slot.startsWith('native:') && anchor
    ? 'native:' + sha(canonical([runtimeIdentity(anchor.fact.source.session), slot.slice(7)]))
    : 'p09:' + sha(canonical([...seed, slot])).slice(0, 32)
  const usingModel = modelJson !== undefined && mode !== 'rules' && mode !== 'abstention-first'
  const model = usingModel ? parseUnderstandingOutput(modelJson) : []
  if (usingModel && !model) unresolved.push('invalid-model-output')
  const allowWork = model && anchor?.attribution.kind === 'assigned' && packet && !cut.snapshot.task?.closed
    && (intent.kind === 'continue_current' && intent.taskId === taskId
      || !user && isUnderstandingTrigger(anchor.fact.detail.kind) && mode !== 'abstention-first')
  let changes: ReturnType<typeof compileUnderstandingOperations>['changes'] = []
  let explicitApplied = false
  if (allowWork && anchor && packet) {
    const explicit = explicitUnderstandingOperations(user, cut.snapshot.activeNodeId)
    const rules = explicit.length ? explicit : anchor.fact.detail.kind === 'turn-failed' && cut.snapshot.activeNodeId
      ? [{ kind: 'next-action', text: 'Inspect the failed execution before retrying.' }] : []
    const operations = rules.length ? parseUnderstandingOutput(JSON.stringify(rules)) : mode === 'rules-scripted'
      ? model?.filter(o => ['next-action', 'decision', 'constraint', 'needs-confirmation'].includes(o.kind)) : model
    if (!operations && rules.length) unresolved.push('invalid-explicit-structure')
    if (operations) {
      const compiled = compileUnderstandingOperations(operations, cut.snapshot, packet, anchor.fact, allocate)
      changes = compiled.changes
      explicitApplied = explicit.length > 0 && changes.length > 0
      unresolved.push(...compiled.unresolved)
    }
  }
  const body = {
    version: 'understanding-proposal-v1', policy: understandingPolicy, mode, status: 'proposed',
    workspaceId: cut.workspaceId, taskId, graphRevision: cut.revision, projectionRevision: cut.snapshot.sourceRevision,
    sourceRevision, candidateRevision, evidence, intent,
    ...(user ? { userEvidence: { evidenceId: user.evidenceId, excerptHash: sha(user.text), provenance: user.provenance } } : {}),
    changes: changes.map((change, i) => ({ id: sha(canonical([...seed, i, change])), evidenceId: input.anchorId, change })),
    provenance: explicitApplied ? 'explicit_user_instruction' : usingModel ? 'scripted_model_mock' : 'deterministic_rules',
    unresolved: [...new Set(unresolved)],
    supersessionKey: sha(canonical([cut.workspaceId, taskId, input.anchorId, understandingPolicy])),
  } as const
  return freeze({ ...body, id: sha(canonical(body)), createdAt: input.now, expiresAt: input.now + input.ttlMs })
}
