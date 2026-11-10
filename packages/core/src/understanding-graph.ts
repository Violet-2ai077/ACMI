import type { EventRef, GraphChange, RuntimeFact, TaskGraphSnapshot, UnderstandingPacket, WorkRelation } from '@acmi/contracts'
import { canonical } from './canonical.ts'
import { runtimeIdentity } from './runtime-facts.ts'
import type { UnderstandingOperation } from './understanding-schema.ts'

export function compileUnderstandingOperations(ops: readonly UnderstandingOperation[], snapshot: TaskGraphSnapshot,
  packet: UnderstandingPacket, anchor: RuntimeFact, allocate: (slot: string) => string,
): { changes: GraphChange[]; unresolved: string[] } {
  const changes: GraphChange[] = []
  const unresolved: string[] = []
  const node = (id: string) => packet.nodes.some(n => n.id === id)
  const result = (id: string) => packet.results.some(r => r.id === id)
  const active = snapshot.activeNodeId
  const user = packet.user?.text ?? ''
  const evidence = (content: Extract<GraphChange, { kind: 'evidence-recorded' }>['content'], nodeId?: string, supersedes?: string) =>
    changes.push({ kind: 'evidence-recorded', content, ...(nodeId ? { nodeId } : {}), ...(supersedes ? { supersedes } : {}) })
  const edge = (from: string, to: string, relation: Extract<GraphChange, { kind: 'edge-added' }>['relation']) =>
    changes.push({ kind: 'edge-added', from, to, relation })
  const scopedResult = (nodeId: string, resultId: string) => node(nodeId) && result(resultId)
    && (snapshot.dependencies.some(r => r.id === resultId && r.nodeId === nodeId)
      || snapshot.results.some(r => r.id === resultId && snapshot.edges.some(e =>
        (e.relation === 'joins_into' && e.from === r.nodeId && e.to === nodeId)
        || (e.relation === 'depends_on' && e.from === nodeId && e.to === r.nodeId))))
  const invalid = (reason: string) => ({ changes: [], unresolved: [...new Set([...unresolved, reason])] })
  for (const [i, op] of ops.entries()) {
    switch (op.kind) {
      case 'decompose': case 'branch': {
        if (!node(op.parent) || !user) return invalid('unsupported-decomposition')
        for (const [n, title] of op.titles.entries()) {
          const id = allocate(i + ':stage:' + n)
          changes.push({ kind: 'node-added', nodeId: id, title, role: 'work' })
          edge(op.parent, id, 'decomposes_into')
        }
        break
      }
      case 'refine':
        if (!node(op.nodeId) || !user) return invalid('unknown-node-or-user-evidence')
        changes.push({ kind: 'node-refined', nodeId: op.nodeId, description: op.description, criteria: op.criteria })
        break
      case 'objective':
        if (!user) return invalid('missing-user-evidence')
        changes.push({ kind: 'task-reframed', objective: op.objective, criteria: op.criteria })
        break
      case 'dependency': case 'successor':
        if (!node(op.from) || !node(op.to) || op.from === op.to || !user) return invalid('unknown-or-invalid-edge')
        edge(op.from, op.to, op.kind === 'dependency' ? 'depends_on' : 'continues_as')
        break
      case 'join': {
        const ids = [...op.required, ...op.optional, ...op.next]
        if (!user || !ids.every(node) || new Set(ids).size !== ids.length) return invalid('invalid-join-policy')
        const id = allocate(i + ':join')
        changes.push({ kind: 'node-added', nodeId: id, title: op.title, role: 'join' })
        for (const branch of op.required) edge(branch, id, 'joins_into')
        for (const branch of op.optional) edge(id, branch, 'references')
        if (op.next[0]) edge(id, op.next[0], 'continues_as')
        break
      }
      case 'decision': {
        const state = op.state
        const replaces = op.replaces[0]
        const prior = replaces && snapshot.evidence.find(e => e.id === replaces && !e.superseded && !e.nodeId
          && e.content.kind === 'decision' && e.content.topic === op.topic)
        if (replaces && (!prior || !packet.decisions.some(e => e.id === replaces)) || state === 'superseded' && !prior) {
          return invalid('invalid-supersession')
        }
        if (state !== 'proposed' && !user) return invalid('missing-user-evidence')
        if (state === 'accepted' && (snapshot.evidence.some(e => !e.superseded && e.id !== replaces
          && e.content.kind === 'decision' && e.content.state === 'accepted' && e.content.topic === op.topic)
          || changes.some(c => c.kind === 'evidence-recorded' && c.content.kind === 'decision'
            && c.content.state === 'accepted' && c.content.topic === op.topic))) return invalid('conflicting-accepted-decision')
        evidence({ kind: 'decision', state, topic: op.topic, text: op.text, rationale: op.rationale,
          ...(op.alternatives.length ? { alternatives: op.alternatives } : {}) }, undefined, replaces)
        break
      }
      case 'constraint': {
        const nodeId = op.node[0]
        if (nodeId && !node(nodeId)) return invalid('unknown-constraint-scope')
        evidence({ kind: 'constraint', text: op.text, category: op.category, validity: op.validity,
          explicit: user.length > 0 && user.includes(op.text) }, nodeId)
        break
      }
      case 'state':
        if (!node(op.nodeId) || !user) return invalid('missing-work-state-evidence')
        if (op.state === 'completed' && /^continue:\s*(?:confirm|mark)\s+completed\s+([a-z0-9_.:-]+)$/iu.exec(user)?.[1] !== op.nodeId) {
          unresolved.push('work-completion-needs-explicit-confirmation')
        } else changes.push({ kind: 'work-transitioned', nodeId: op.nodeId, state: op.state })
        break
      case 'execution-link': {
        if (!node(op.nodeId) || !packet.executions.some(e => e.id === op.executionId)) return invalid('unknown-execution')
        // An execution's historical WorkNode/attempt cannot be reassigned.
        unresolved.push(packet.executions.some(e => e.id === op.executionId && e.nodeId === op.nodeId)
          ? 'execution-already-linked' : 'execution-association-needs-host')
        break
      }
      case 'work-result': {
        const execution = packet.executions.find(e => e.id === op.executionId)
        if (!execution || !node(execution.nodeId) || anchor.detail.kind !== 'tool-result' || anchor.detail.callSeq === undefined) {
          return invalid('missing-durable-result-cause')
        }
        const started = snapshot.executions.find(e => e.id === execution.id)!.started.source
        if (!sameEpoch(started, anchor.source) || started.localSeq > anchor.detail.callSeq
          || (anchor.source.session.adapterId === 'dsh' && execution.id !== allocate('native:' + anchor.detail.turn))) {
          return invalid('result-execution-mismatch')
        }
        changes.push({ kind: 'result-observed', nodeId: execution.nodeId, executionId: execution.id, resultId: allocate(i + ':result'),
          summary: op.text })
        break
      }
      case 'result-review':
        if (!scopedResult(op.nodeId, op.resultId) || !user) return invalid('missing-result-review-evidence')
        changes.push({ kind: 'result-reviewed', nodeId: op.nodeId, resultId: op.resultId, stage: op.stage })
        break
      case 'result-assessment':
        if (!scopedResult(op.nodeId, op.resultId) || !user) return invalid('missing-result-review-evidence')
        evidence({ kind: 'result-assessment', text: op.text, resultId: op.resultId, state: op.state }, op.nodeId)
        break
      case 'next-action':
        if (!active || !packet.nodes.some(n => n.id === active && !['completed', 'cancelled', 'superseded'].includes(n.state))) {
          return invalid('no-active-work')
        }
        evidence({ kind: 'next-action', text: op.text }, active)
        break
      case 'needs-confirmation':
        unresolved.push(op.subject + '-requires-separate-host-operation')
        break
    }
    if (changes.length > 24) return invalid('change-limit')
  }
  if (new Set(changes.map(canonical)).size !== changes.length) return invalid('duplicate-change')
  return { changes, unresolved: [...new Set(unresolved)] }
}

function sameEpoch(a: EventRef, b: EventRef) {
  return a.sourceRevision === b.sourceRevision && runtimeIdentity(a.session) === runtimeIdentity(b.session)
}

/** Check new prerequisites across relation types, not only within each edge kind. */
export function understandingTopologyRisk(snapshot: TaskGraphSnapshot, changes: readonly GraphChange[]): string | undefined {
  const proposed = changes.filter(c => c.kind === 'edge-added')
  if (!proposed.length) return
  const graph = new Map<string, Set<string>>()
  const successors = new Set<string>()
  const prerequisite = ({ from, to, relation }: { from: string; to: string; relation: WorkRelation }) =>
    relation === 'depends_on' ? [from, to] as const : relation === 'joins_into' || relation === 'continues_as' ? [to, from] as const : null
  const add = (from: string, to: string) => {
    const next = graph.get(from) ?? new Set<string>()
    next.add(to)
    graph.set(from, next)
  }
  for (const edge of snapshot.edges) {
    const gate = prerequisite(edge)
    if (gate) add(...gate)
    if (edge.relation === 'continues_as') successors.add(edge.from)
  }
  for (const edge of proposed) {
    if (edge.relation === 'continues_as') {
      if (successors.has(edge.from)) return 'mainline-cardinality'
      successors.add(edge.from)
    }
    const gate = prerequisite(edge)
    if (!gate) continue
    const [consumer, dependency] = gate
    const seen = new Set<string>()
    const pending = [dependency]
    while (pending.length) {
      const id = pending.pop()!
      if (id === consumer) return edge.relation === 'depends_on'
        && snapshot.edges.some(e => e.relation === 'depends_on' && e.from === dependency && e.to === consumer) ? 'edge-cycle' : 'gating-cycle'
      if (seen.has(id)) continue
      seen.add(id)
      for (const next of graph.get(id) ?? []) pending.push(next)
    }
    add(consumer, dependency)
  }
}
