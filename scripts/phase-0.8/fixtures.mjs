import { createHash } from 'node:crypto'
import { createScopeAuthority, TaskGraph } from '../../packages/core/dist/index.js'

export const digest = data => createHash('sha256').update(data).digest('hex')
const uuid = n => '08000000-0000-4000-8000-' + n.toString(16).padStart(12, '0')
const families = [
  ['interleaved', 'development'], ['multi-session', 'development'], ['parallel', 'development'],
  ['retry-join', 'holdout'], ['external-receipt', 'holdout'], ['unicode-pressure-conflict', 'development'],
]
export const cases = families.flatMap(([family, split], f) =>
  Array.from({ length: 20 }, (_, i) => ({ family, split, i, serial: f * 20 + i + 1 })))

export function makeFixture({ family, i, serial }) {
  const id = uuid(serial)
  const foreign = uuid(200 + serial)
  const noiseTask = uuid(400 + serial)
  const marker = name => `${name}:${serial}`
  const scopeAuthority = createScopeAuthority()
  const workspaceId = 'benchmark-workspace'
  const scope = scopeAuthority.grant(workspaceId)
  const makeGraph = taskId => new TaskGraph({ taskId, workspaceId, authority: scopeAuthority, digest })
  const graph = makeGraph(id)
  const external = makeGraph(foreign)
  const history = []
  const events = []
  const extEvents = []
  const first = `s${serial}-1`
  const second = `s${serial}-2`
  let session = first
  const row = (text, taskId = id, kind = 'signal') => {
    history.push({ text, taskId, kind, session })
    return {
      session: { adapterId: 'synthetic', instanceId: 'phase-08', sessionId: session, incarnation: '1' },
      sourceRevision: 'fixture-v1', localSeq: history.length,
    }
  }
  const add = (payload, text = payload.kind, producer = false) => {
    const log = producer ? extEvents : events
    const target = producer ? external : graph
    const seq = log.length + 1
    const event = { ...payload, seq, id: `g${seq}`, source: row(text, producer ? foreign : id, text === payload.kind ? 'meta' : 'signal') }
    log.push(event)
    const result = target.append(scope, event)
    if (result !== 'applied') throw new Error(`Bad fixture ${family}/${serial}: ${payload.kind} -> ${result}`)
    return event.id
  }
  const fact = {
    objective: marker('objective'), criteria: marker('acceptance'), constraint: marker('constraint'),
    decision: marker('decision-current'), unresolved: marker('unresolved'), nextAction: marker('next-action'),
  }
  let activeNodeId = 'main'
  let workState = 'running'
  let executionState
  const deps = []
  const forbidden = [marker('foreign-session'), marker('unrelated-task-c'), marker('old-decision')]
  const evidence = (kind, text, content = {}, opts = {}) =>
    add({ kind: 'evidence-recorded', content: { kind, text, ...content }, ...opts }, text)
  const work = (nodeId, state, text) => add({ kind: 'work-transitioned', nodeId, state }, text)
  const node = (nodeId, role = 'work') => add({ kind: 'node-added', nodeId, title: marker('node-' + nodeId), role })
  const edge = (from, to, relation) => add({ kind: 'edge-added', from, to, relation })
  const advance = nodeId => add({ kind: 'mainline-advanced', nodeId }, `Active node ${nodeId}`)
  const exec = (executionId, nodeId, parentId, agentId = 'lead') => add({
    kind: 'execution-started', executionId, nodeId, agentId, ...(parentId ? { parentId } : {}),
  }, `Execution ${executionId} is running`)
  const execution = (executionId, state, waitingFor) => add({
    kind: 'execution-transitioned', executionId, state, ...(waitingFor ? { waitingFor } : {}),
  }, `Execution ${executionId} is ${state}`)
  const produce = (resultId, nodeId, executionId, summary, producer = false) => add({
    kind: 'result-produced', resultId, nodeId, executionId, summary, verified: true,
  }, `Produced (not consumed): ${summary}`, producer)
  const review = (resultId, nodeId, stages) => stages.forEach(stage => add({
    kind: 'result-reviewed', resultId, nodeId, stage,
  }, `Review ${resultId} is ${stage}`))
  const all = ['available', 'inspected', 'consumed', 'accepted']

  add({ kind: 'task-opened', objective: fact.objective, criteria: [fact.criteria] }, `${fact.objective}; ${fact.criteria}`)
  node('main')
  advance('main')
  work('main', 'ready')
  work('main', 'running', 'Work main is running')
  exec('lead-main', 'main')
  evidence('constraint', fact.constraint)
  const old = evidence('decision', forbidden[2], { state: 'accepted', topic: 'approach' })
  evidence('decision', fact.decision, { state: 'accepted', topic: 'approach', rationale: 'Retain stable identifiers.' }, { supersedes: old })
  const volume = family === 'multi-session' ? 330 + i * 9 : 10 + i
  for (let n = 0; n < volume; n++) {
    row(`Synthetic background ${n}. ` + 'Long conversational detail. '.repeat(10), n % 2 === 0 ? foreign : id, 'filler')
  }
  row(forbidden[0], foreign)
  row(forbidden[1], noiseTask)
  row('Thanks; no task attribution.', null, 'social')
  if (family !== 'interleaved') session = second
  if (family === 'parallel' || family === 'retry-join') {
    node('b')
    node('c')
    node('join', 'join')
    edge('main', 'b', 'decomposes_into')
    edge('main', 'c', 'decomposes_into')
    edge('b', 'join', 'joins_into')
    edge('c', 'join', 'joins_into')
    edge('main', 'join', 'continues_as')
    for (const branch of ['b', 'c']) {
      work(branch, 'ready')
      work(branch, 'running')
      exec('worker-' + branch, branch, 'lead-main', 'agent-' + branch)
    }
    const waiting = i % 2 === 0
    if (waiting) execution('lead-main', 'waiting', ['worker-b', 'worker-c'])
    else add({ kind: 'work-progressed', nodeId: 'main', summary: 'Mainline continues while branches run' }, 'Execution lead-main is running')
    executionState = waiting ? 'waiting' : 'running'
    if (family === 'parallel') {
      const unconsumed = marker('pending-branch-output')
      produce('rb', 'b', 'worker-b', unconsumed)
      deps.push({ text: unconsumed, stage: 'produced', expected: 'absent', id: 'rb' })
    } else {
      const stale = marker('stale-attempt')
      produce('retry-old', 'c', 'worker-c', stale)
      forbidden.push(stale)
      work('c', 'failed')
      execution('worker-c', 'failed')
      work('c', 'ready')
      work('c', 'running')
      exec('worker-c2', 'c', 'lead-main', 'agent-c')
      for (const [branch, worker] of [['b', 'worker-b'], ['c', 'worker-c2']]) {
        const value = marker('accepted-' + branch)
        produce('r' + branch, branch, worker, value)
        work(branch, 'completed')
        execution(worker, 'completed')
        review('r' + branch, 'join', all)
        deps.push({ id: 'r' + branch, text: value, stage: 'accepted', expected: 'integrated' })
      }
      if (waiting) execution('lead-main', 'running')
      add({ kind: 'join-satisfied', nodeId: 'join' }, 'Join satisfied explicitly')
      work('main', 'completed')
      execution('lead-main', 'completed')
      advance('join')
      work('join', 'ready')
      work('join', 'running', 'Work join is running')
      exec('lead-join', 'join')
      activeNodeId = 'join'
      executionState = 'running'
    }
  }
  if (family === 'external-receipt') {
    const ex = (payload, text) => add(payload, text, true)
    const output = marker('external-selected')
    ex({ kind: 'task-opened', objective: forbidden[0], criteria: ['Verified result'] }, forbidden[0])
    ex({ kind: 'node-added', nodeId: 'external', title: 'Dependency producer', role: 'work' })
    for (const state of ['ready', 'running']) ex({ kind: 'work-transitioned', nodeId: 'external', state })
    ex({ kind: 'execution-started', nodeId: 'external', executionId: 'p', agentId: 'dependency-agent' })
    produce('selected', 'external', 'p', output, true)
    const other = marker('external-not-required')
    produce('other', 'external', 'p', other, true)
    forbidden.push(other)
    ex({ kind: 'work-transitioned', nodeId: 'external', state: 'completed' })
    const receipt = graph.captureDependency(scope, external, 'selected')
    add({ kind: 'dependency-required', resultId: 'use-selected', nodeId: 'main', receipt }, 'Requires external result selected')
    const stages = i % 3 === 0 ? [] : i % 3 === 1 ? all.slice(0, 3) : all
    review('use-selected', 'main', stages)
    deps.push({ id: 'selected', refId: 'use-selected', text: output, stage: stages.at(-1) ?? 'produced',
      expected: stages.length === 4 ? 'integrated' : 'unreviewed' })
  }
  if (family === 'unicode-pressure-conflict') {
    evidence('decision', marker('competing-decision'), { state: 'accepted', topic: 'approach' })
    for (let n = 0; n < 40 + i * 13; n++) {
      evidence('artifact', `${marker('artifact')}-${n} \u62a5\u8868\ud83d\ude42 ` + '`{"payload": 42}` '.repeat(n % 4), { state: 'verified' })
    }
    const call = row('Causal call; structured synthetic JSON.')
    evidence('tool-outcome', '```json {"output":"\u4f60\u597d\ud83d\ude42"} ```'.repeat(120), { call })
    evidence('blocker', marker('blocking-review'), {}, { nodeId: 'main' })
    work('main', 'blocked', 'Work main is blocked')
    workState = 'blocked'
  }
  if (family !== 'parallel' && family !== 'retry-join') executionState = 'running'
  evidence('unresolved', fact.unresolved)
  evidence('next-action', fact.nextAction, {}, { nodeId: activeNodeId })
  if (i % 2 === 1) row(forbidden[1], noiseTask)
  const tokenBudget = family === 'unicode-pressure-conflict' ? (i < 4 ? 500 : 6800 + 100 * (i % 4)) : 12000
  return {
    graph, makeGraph, scope, history, events, tokenBudget,
    labels: { id, activeNodeId, workState, executionState, fact, deps, forbidden,
      conflict: family === 'unicode-pressure-conflict' ? marker('competing-decision') : null,
      expectRefusal: tokenBudget === 500, labelProvenance: 'agent_generated_not_human_reviewed' },
  }
}
