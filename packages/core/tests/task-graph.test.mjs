import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { createScopeAuthority, TaskGraph } from '../dist/index.js'

export const taskId = '10000000-0000-4000-8000-000000000001'
export const digest = text => createHash('sha256').update(text).digest('hex')
export const source = (localSeq, sessionId = 'first') => ({
  session: { adapterId: 'fixture', instanceId: 'local', sessionId, incarnation: 'one' },
  sourceRevision: 'fixture-cut', localSeq,
})
export function setup(id = taskId, workspaceId = 'work', authority = createScopeAuthority()) {
  const scope = authority.grant(workspaceId)
  return { scope, authority, graph: new TaskGraph({ taskId: id, workspaceId, digest, authority }) }
}
export const event = (seq, payload, session) => ({ seq, id: `g-${seq}`, source: source(seq, session), ...payload })
export const opening = [
  { kind: 'task-opened', objective: 'Deliver A', criteria: ['Green suite'] },
  { kind: 'node-added', nodeId: 'main', title: 'Implementation', role: 'work' },
  { kind: 'node-added', nodeId: 'b', title: 'Build B', role: 'work' },
  { kind: 'node-added', nodeId: 'c', title: 'Check C', role: 'work' },
  { kind: 'node-added', nodeId: 'join', title: 'Merge results', role: 'join' },
  { kind: 'edge-added', from: 'main', to: 'b', relation: 'decomposes_into' },
  { kind: 'edge-added', from: 'b', to: 'join', relation: 'joins_into' },
  { kind: 'edge-added', from: 'c', to: 'join', relation: 'joins_into' },
  { kind: 'edge-added', from: 'main', to: 'join', relation: 'continues_as' },
  { kind: 'mainline-advanced', nodeId: 'main' },
  ...['main', 'b', 'c'].flatMap(nodeId => ['ready', 'running'].map(state => ({ kind: 'work-transitioned', nodeId, state }))),
  { kind: 'execution-started', executionId: 'em', nodeId: 'main', agentId: 'lead' },
  { kind: 'execution-started', executionId: 'eb', nodeId: 'b', agentId: 'worker-b', parentId: 'em' },
  { kind: 'execution-started', executionId: 'ec', nodeId: 'c', agentId: 'worker-c', parentId: 'em' },
]
export const work = (nodeId, state) => ({ kind: 'work-transitioned', nodeId, state })
export const result = (resultId, nodeId, executionId) => ({
  kind: 'result-produced', resultId, nodeId, executionId, summary: `Verified result ${resultId}`, verified: true,
})
export const review = (resultId, stage, nodeId = 'join') => ({ kind: 'result-reviewed', resultId, stage, nodeId })
export const stages = ['available', 'inspected', 'consumed', 'accepted']
export const exec = (executionId, state, waitingFor) => ({
  kind: 'execution-transitioned', executionId, state, ...(waitingFor ? { waitingFor } : {}),
})
export function append(graph, scope, payloads, offset = 0, session) {
  return payloads.map((payload, i) => graph.append(scope, event(offset + i + 1, payload, session)))
}

describe('Task Graph', () => {
  test.each([true, false])('separates branch output, execution timing and mainline advancement (wait=%s)', waiting => {
    const { graph, scope } = setup()
    expect(append(graph, scope, opening).every(s => s === 'applied')).toBe(true)
    let seq = opening.length
    const add = (...payloads) => {
      const statuses = append(graph, scope, payloads, seq)
      seq += payloads.length
      return statuses
    }
    const read = () => graph.read(scope)
    if (waiting) expect(add(exec('em', 'waiting', ['eb', 'ec']))).toEqual(['applied'])
    else expect(add({ kind: 'work-progressed', nodeId: 'main', summary: 'Continued while branches run' })).toEqual(['applied'])
    expect(read().nodes.find(n => n.id === 'main').state).toBe('running')
    expect(read().executions[0].state).toBe(waiting ? 'waiting' : 'running')
    expect(add(work('c', 'failed'), exec('ec', 'failed'), work('c', 'ready'), work('c', 'running'),
      { kind: 'execution-started', executionId: 'ec2', nodeId: 'c', agentId: 'worker-c', parentId: 'em' },
      result('rb', 'b', 'eb'), result('rc', 'c', 'ec2'), work('b', 'completed'), work('c', 'completed'),
      exec('eb', 'completed'), exec('ec2', 'completed')).every(s => s === 'applied')).toBe(true)
    expect(read().reviews).toEqual([])
    expect(add(...stages.slice(0, 3).map(s => review('rb', s)), { kind: 'join-satisfied', nodeId: 'join' }))
      .toEqual(['applied', 'applied', 'applied', 'unresolved'])
    if (waiting) add(exec('em', 'running'))
    expect(add(review('rb', 'accepted'), ...stages.map(s => review('rc', s)), { kind: 'join-satisfied', nodeId: 'join' })
      .every(s => s === 'applied')).toBe(true)
    expect(read().activeNodeId).toBe('main')
    expect(add(work('main', 'completed'), exec('em', 'completed'), { kind: 'mainline-advanced', nodeId: 'join' },
      work('join', 'ready'), work('join', 'running'),
      { kind: 'execution-started', executionId: 'ej', nodeId: 'join', agentId: 'lead' })
      .every(s => s === 'applied')).toBe(true)
    expect(read().activeNodeId).toBe('join')
    expect(read().executions.at(-1).agentId).toBe(read().executions[0].agentId)
    expect(read().unresolved.map(row => row.reason)).toEqual(['join-not-ready'])
  })

  test('orders deliveries, deduplicates, and restores a serialized checkpoint plus suffix', () => {
    const a = setup()
    const b = setup()
    const entries = opening.map((payload, i) => event(i + 1, payload))
    expect(a.graph.append(a.scope, entries[1])).toBe('buffered')
    expect(a.graph.read(a.scope).pending).toBe(1)
    expect(a.graph.append(a.scope, entries[1])).toBe('duplicate')
    for (const e of [entries[0], ...entries.slice(2, 10)]) a.graph.append(a.scope, e)
    const restored = a.graph.restore(a.scope, JSON.parse(JSON.stringify(a.graph.checkpoint(a.scope))))
    for (const e of entries.slice(10)) restored.append(a.scope, e)
    for (const e of entries.toReversed()) b.graph.append(b.scope, e)
    expect(restored.read(a.scope)).toEqual(b.graph.read(b.scope))
    expect(restored.append(a.scope, entries[0])).toBe('duplicate')
    expect(restored.append(a.scope, { ...entries[0], objective: 'Conflict' })).toBe('conflict')
    expect(restored.read(a.scope)).toBeNull()
  })

  test('reports cycles and missing causality without mutating valid graph state', () => {
    const { graph, scope, authority } = setup()
    append(graph, scope, opening)
    const n = opening.length
    expect(append(graph, scope, [
      { kind: 'edge-added', from: 'b', to: 'c', relation: 'depends_on' },
      { kind: 'edge-added', from: 'c', to: 'b', relation: 'depends_on' },
      { ...work('main', 'completed'), after: ['missing'] },
      review('missing', 'consumed'),
      work('missing', 'ready'),
    ], n)).toEqual(['applied', 'unresolved', 'unresolved', 'unresolved', 'unresolved'])
    expect(graph.read(scope).unresolved.map(row => row.reason)).toEqual([
      'edge-cycle', 'missing-cause', 'unknown-result', 'unknown-node',
    ])
    expect(graph.read(scope).nodes[0].state).toBe('running')
    const foreign = authority.grant('foreign')
    expect(graph.append(foreign, event(n + 6, work('main', 'completed')))).toBe('scope-denied')
    expect(graph.read(foreign)).toBeNull()
    expect(graph.checkpoint(foreign)).toBeNull()
    authority.revoke(scope)
    expect(graph.read(scope)).toBeNull()
  })
})
