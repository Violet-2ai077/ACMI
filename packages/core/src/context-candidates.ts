import type {
  ContextItem, ContextSource, GraphEvidence, GraphRef, OmissionReason, TaskGraphSnapshot, WorkNode, WorkResult,
} from '@acmi/contracts'
import { canonical } from './canonical.ts'

export type OmitCandidate = (id: string, reason: OmissionReason) => void
type Input = Omit<ContextItem, 'taskId' | 'sources'> & { refs: readonly GraphRef[]; extra?: readonly ContextSource[] }
const source = (taskId: string, ref: GraphRef): ContextSource =>
  ({ taskId, event: ref.source, graph: { eventId: ref.eventId, seq: ref.seq } })

export function collectCandidates(
  graph: TaskGraphSnapshot,
  active: WorkNode,
  includeDependencies: boolean,
  omit: OmitCandidate,
): ContextItem[] {
  const { taskId, task, position } = graph
  const items: ContextItem[] = []
  const add = ({ refs, extra = [], ...input }: Input) => {
    const citations = [...refs.map(r => source(taskId, r)), ...extra]
    const sources = [...new Map(citations.map(s => [canonical(s), s])).values()]
    items.push({ taskId, ...input, sources })
  }
  const activeId = active.id
  const nodes = new Map(graph.nodes.map(n => [n.id, n]))
  const immediate = new Set<string>()
  const predecessors = new Set<string>()
  const nextJoins = new Set<string>()
  for (const e of graph.edges) {
    if (e.from === activeId && e.relation !== 'references') immediate.add(e.to)
    if (e.to === activeId && e.relation !== 'references') immediate.add(e.from)
    if (e.to === activeId && e.relation === 'continues_as') predecessors.add(e.from)
    if (e.from === activeId && e.relation === 'continues_as' && nodes.get(e.to)?.role === 'join') nextJoins.add(e.to)
  }
  add({ id: 'task:objective', kind: 'objective', status: 'active', tier: 0, reason: 'required_state',
    text: [task!.objective, ...task!.criteria.map((x, i) => `Acceptance ${i + 1}: ${x}`)].join('\n'),
    refs: [task!.opened, ...(task!.reframed ? [task!.reframed] : []), ...(task!.closed ? [task!.closed] : [])] })
  add({ id: `work:${activeId}`, kind: 'active-work', nodeId: activeId, status: 'active', tier: 0, reason: 'required_state',
    text: `${active.title} [${active.state}; attempt ${active.attempt}${active.joinSatisfied ? '; join satisfied' : ''}]`,
    refs: [position!, active.declared, active.changed, ...(active.joinSatisfied ? [active.joinSatisfied] : [])] })
  for (const n of graph.nodes) {
    if (n.id === activeId) continue
    if (n.state === 'superseded' || (n.state === 'completed' && !immediate.has(n.id))) {
      omit(`work:${n.id}`, n.state === 'superseded' ? 'superseded' : 'low_relevance')
      continue
    }
    add({ id: `work:${n.id}`, kind: 'work-status', nodeId: n.id, status: 'active',
      tier: n.state === 'blocked' || n.state === 'failed' ? 0 : immediate.has(n.id) ? 1 : 2,
      reason: 'related_work', text: `${n.title} [${n.state}; attempt ${n.attempt}]`, refs: [n.declared, n.changed] })
  }
  const executions = new Map(graph.executions.map(e => [e.id, e]))
  for (const e of graph.executions) {
    if (e.nodeId !== activeId || e.attempt !== active.attempt || !['running', 'waiting', 'idle'].includes(e.state)) continue
    const awaited = (e.waitingFor ?? []).map(id => executions.get(id)!)
    add({ id: `execution:${e.id}`, kind: 'execution-state', nodeId: e.nodeId, status: 'active', tier: 0, reason: 'required_state',
      text: `${e.agentId} [${e.state}]${awaited.length ? ': ' + awaited.map(x => `${x.id} [${x.state}]`).join(', ') : ''}`,
      refs: [e.started, e.changed, ...awaited.map(x => x.changed)] })
  }
  for (const issue of graph.unresolved) {
    add({ id: `issue:${issue.ref.eventId}`, kind: 'graph-issue', status: 'unresolved', tier: 0,
      reason: 'unresolved_evidence', text: issue.reason, refs: [issue.ref] })
  }
  for (const p of graph.progress) {
    if (p.nodeId !== activeId && !predecessors.has(p.nodeId)) { omit(`progress:${p.ref.eventId}`, 'low_relevance'); continue }
    add({ id: `progress:${p.ref.eventId}`, kind: 'progress', nodeId: p.nodeId, status: 'active', tier: 2,
      reason: p.nodeId === activeId ? 'active_work' : 'related_work', text: p.summary, refs: [p.ref] })
  }
  const decisions = new Map<string, GraphEvidence[]>()
  const dedup = new Map<string, GraphEvidence>()
  let hasNextAction = false
  for (const row of graph.evidence) {
    const { content: c, nodeId, ref } = row
    const id = `evidence:${row.id}`
    if (row.superseded) { omit(id, 'superseded'); continue }
    if (nodeId !== undefined && nodeId !== activeId && c.kind !== 'blocker' && c.kind !== 'unresolved') {
      omit(id, 'low_relevance')
      continue
    }
    if (c.kind === 'artifact' && c.state !== 'verified') { omit(id, c.state === 'stale' ? 'stale' : 'unverified'); continue }
    if (c.kind === 'decision' && ['superseded', 'rejected', 'proposed'].includes(c.state)) {
      omit(id, c.state === 'superseded' ? 'superseded' : c.state === 'proposed' ? 'unverified' : 'low_relevance')
      continue
    }
    const signature = canonical([nodeId ?? null, c])
    if (dedup.has(signature)) { omit(id, 'duplicate'); continue }
    dedup.set(signature, row)
    if (c.kind === 'decision') {
      const group = decisions.get(c.topic) ?? []
      group.push(row)
      decisions.set(c.topic, group)
      continue
    }
    if (c.kind === 'next-action') hasNextAction = true
    const tier = c.kind === 'constraint' || c.kind === 'blocker' || c.kind === 'unresolved' || c.kind === 'runtime-state' ? 0
      : c.kind === 'tool-outcome' ? 2 : 1
    add({ id, kind: c.kind, ...(nodeId ? { nodeId } : {}),
      status: c.kind === 'artifact' || c.kind === 'tool-outcome' ? 'verified' : c.kind === 'unresolved' ? 'unresolved' : 'active',
      tier, text: c.text, reason: tier === 0 ? 'required_state' : 'active_work', refs: [ref],
      ...(c.kind === 'tool-outcome' ? { extra: [{ taskId, event: c.call }] } : {}) })
  }
  if (!hasNextAction && !task!.closed) {
    add({ id: 'task:next-action-unknown', kind: 'unresolved', nodeId: activeId, status: 'unresolved', tier: 0,
      text: 'No validated next action for this position.', reason: 'unresolved_evidence', refs: [position!] })
  }
  for (const [topic, group] of decisions) {
    const rows = group.flatMap(row => row.content.kind === 'decision' ? [row.content] : [])
    const conflict = new Set(rows.filter(c => c.state === 'accepted').map(c => c.text)).size > 1
      || rows.some(c => c.state === 'disputed')
    const unresolved = rows.some(c => c.state === 'unresolved')
    add({ id: `decision:${topic}`, kind: conflict ? 'decision-conflict' : unresolved ? 'unresolved' : 'decision',
      status: conflict ? 'disputed' : unresolved ? 'unresolved' : 'active', tier: conflict || unresolved ? 0 : 1,
      reason: conflict || unresolved ? 'unresolved_evidence' : 'active_work',
      text: rows.map(c => `[${c.state}] ${c.text}${c.rationale ? ' (Rationale: ' + c.rationale + ')' : ''}`).join('\n'),
      refs: group.map(row => row.ref) })
  }

  const reviews = new Map(graph.reviews.map(r => [canonical([r.nodeId, r.attempt, r.resultId]), r]))
  const acceptedAtNextJoin = new Map<string, string[]>()
  for (const r of graph.reviews) {
    if (r.stage !== 'accepted' || !nextJoins.has(r.nodeId) || nodes.get(r.nodeId)?.attempt !== r.attempt) continue
    const list = acceptedAtNextJoin.get(r.resultId) ?? []
    list.push(r.nodeId)
    acceptedAtNextJoin.set(r.resultId, list)
  }
  function dependency(id: string, node: WorkNode, result: WorkResult, producer: string, revision?: string, required?: GraphRef) {
    const review = reviews.get(canonical([node.id, node.attempt, id]))
    const accepted = review?.stage === 'accepted'
    const itemId = 'dependency:' + canonical([node.id, id])
    if (!includeDependencies) { omit(itemId, 'policy_disabled'); return }
    if (!accepted && node.id !== activeId) { omit(itemId, 'not_consumed'); return }
    add({ id: itemId, kind: accepted ? 'dependency-result' : 'unreviewed_dependency_output',
      nodeId: node.id, status: accepted ? 'verified' : 'unverified', tier: accepted ? 1 : 2,
      reason: 'explicit_dependency', text: result.summary,
      dependency: { taskId: producer, resultId: result.id, stage: review?.stage ?? 'produced',
        producerVerified: result.verified, ...(revision ? { sourceRevision: revision } : {}) },
      refs: [...(required ? [required] : []), ...(review?.history ?? [])],
      extra: [source(producer, result.produced)] })
  }
  for (const d of graph.dependencies) {
    if (d.nodeId === activeId || nextJoins.has(d.nodeId)) {
      dependency(d.id, nodes.get(d.nodeId)!, d.receipt.result, d.receipt.taskId, d.receipt.sourceRevision, d.ref)
    } else omit('dependency:' + canonical([d.nodeId, d.id]), 'low_relevance')
  }
  const consumers = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    const pair = edge.relation === 'joins_into' ? [edge.from, edge.to] as const
      : edge.relation === 'depends_on' ? [edge.to, edge.from] as const : undefined
    if (!pair || (pair[1] !== activeId && !nextJoins.has(pair[1]))) continue
    const matches = consumers.get(pair[0]) ?? new Set()
    matches.add(pair[1])
    consumers.set(pair[0], matches)
  }
  for (const r of graph.results) {
    const producer = nodes.get(r.nodeId)!
    const id = `result:${r.id}`
    if (producer.attempt !== r.attempt || ['failed', 'cancelled', 'superseded'].includes(producer.state)) { omit(id, 'stale'); continue }
    const related = consumers.get(r.nodeId)
    if (related) {
      const direct = related.has(activeId)
      if (direct) dependency(r.id, active, r, taskId)
      let accepted = false
      for (const consumer of acceptedAtNextJoin.get(r.id) ?? []) {
        if (consumer === activeId || !related.has(consumer)) continue
        accepted = true
        dependency(r.id, nodes.get(consumer)!, r, taskId)
      }
      // Report the unreviewed source once, not one speculative candidate per future join.
      if (!direct && !accepted) omit(id, includeDependencies ? 'not_consumed' : 'policy_disabled')
    } else if ((r.nodeId === activeId || predecessors.has(r.nodeId)) && r.verified && producer.state === 'completed') {
      add({ id, kind: 'completed-result', nodeId: r.nodeId, status: 'verified', tier: 1, reason: 'related_work',
        text: r.summary, refs: [r.produced, producer.changed] })
    } else omit(id, r.verified ? 'low_relevance' : 'unverified')
  }
  return items
}
