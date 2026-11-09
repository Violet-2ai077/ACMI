import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { assembleTaskContext, createScopeAuthority, estimateContextTokens, loadTaskContext, serializeTaskContext, TaskGraph } from '../dist/index.js'

const a = '10000000-0000-4000-8000-000000000001'
const b = '10000000-0000-4000-8000-000000000002'
const c = '10000000-0000-4000-8000-000000000003'
const digest = text => createHash('sha256').update(text).digest('hex')
function fixture() {
  const authority = createScopeAuthority()
  const scope = authority.grant('work')
  const create = (taskId, workspaceId = 'work') => {
    const graph = new TaskGraph({ taskId, workspaceId, authority, digest })
    let seq = 0
    return { graph, add(payload, sessionId = 'shared') {
      const n = ++seq
      const source = { session: { adapterId: 'fixture', instanceId: 'local', sessionId, incarnation: 'one' },
        localSeq: n, sourceRevision: 'cut' }
      return graph.append(scope, { ...payload, seq: n, id: `e${n}`, source })
    } }
  }
  const main = create(a)
  const required = create(b)
  const unrelated = create(c)
  const evidence = (content, opts) => ({ kind: 'evidence-recorded', content, ...opts })
  for (const [task, title] of [[main, 'Ship A'], [required, 'B-objective-not-required'], [unrelated, 'C-interleaved-private']]) {
    task.add({ kind: 'task-opened', objective: title, criteria: ['PASS-CRITERION'] })
    task.add({ kind: 'node-added', nodeId: 'impl', title: 'Work', role: 'work' })
    task.add({ kind: 'mainline-advanced', nodeId: 'impl' })
    for (const state of ['ready', 'running']) task.add({ kind: 'work-transitioned', nodeId: 'impl', state })
    task.add({ kind: 'execution-started', nodeId: 'impl', executionId: 'lead', agentId: 'agent' })
  }
  for (const [resultId, summary] of [['picked', 'B-verified-payload'], ['other', 'B-not-required']]) {
    required.add({ kind: 'result-produced', resultId, nodeId: 'impl', executionId: 'lead', verified: true, summary })
  }
  required.add({ kind: 'work-transitioned', nodeId: 'impl', state: 'completed' })
  const receipt = main.graph.captureDependency(scope, required.graph, 'picked')
  expect(receipt?.result.summary).toBe('B-verified-payload')
  expect(main.graph.captureDependency(scope, create(b, 'other').graph, 'picked')).toBeNull()
  main.add({ kind: 'dependency-required', resultId: 'from-b', nodeId: 'impl', receipt })
  main.add(evidence({ kind: 'constraint', text: 'No network' }))
  main.add(evidence({ kind: 'decision', topic: 'strategy', state: 'accepted', text: 'old-strategy' }))
  main.add(evidence({ kind: 'decision', topic: 'strategy', state: 'accepted', text: 'new-strategy' }, { supersedes: 'e9' }))
  main.add(evidence({ kind: 'next-action', text: 'Run checkpoint smoke' }, { nodeId: 'impl' }), 'later')
  main.add(evidence({ kind: 'unresolved', text: 'Missing optional evidence' }), 'later')
  const run = (overrides = {}, grant = scope) => assembleTaskContext(main.graph, grant, {
    taskId: a, tokenBudget: 12000, policyVersion: 'task-context-v1', includeDependencyResults: true, ...overrides,
  }, digest)
  return { main, evidence, scope, authority, run }
}

test('assembles interleaved work from task evidence and pins only the exact explicit dependency', () => {
  const { main, run } = fixture()
  const before = run().package
  expect(before.items.find(x => x.kind === 'unreviewed_dependency_output')?.dependency.stage).toBe('produced')
  expect(before.items.some(x => x.kind === 'dependency-result')).toBe(false)
  for (const stage of ['available', 'inspected', 'consumed', 'accepted']) {
    expect(main.add({ kind: 'result-reviewed', resultId: 'from-b', nodeId: 'impl', stage })).toBe('applied')
  }
  const after = run().package
  expect(after.items.find(x => x.kind === 'dependency-result')?.dependency).toMatchObject({ taskId: b, stage: 'accepted' })
  expect(after.assembly.deterministicHash).not.toBe(before.assembly.deterministicHash)
  expect(run().package).toEqual(after)
  const wire = serializeTaskContext(after)
  for (const fact of ['Ship A', 'PASS-CRITERION', 'new-strategy', 'No network', 'B-verified-payload', 'Missing optional evidence', 'Run checkpoint smoke', 'later']) expect(wire).toContain(fact)
  for (const fact of ['old-strategy', 'B-not-required', 'B-objective-not-required', 'C-interleaved-private']) expect(wire).not.toContain(fact)
  expect(after.items.every(x => x.sources.length > 0)).toBe(true)
  expect(after.omissions.superseded).toBe(1)
  expect(run({ includeDependencyResults: false }).package.omissions.policy_disabled).toBe(1)
})

test('preserves conflicting decision refs and drops duplicate, stale and unsupported content', () => {
  const { main, evidence, run } = fixture()
  main.add(evidence({ kind: 'decision', topic: 'strategy', state: 'accepted', text: 'competing-strategy' }))
  main.add(evidence({ kind: 'constraint', text: 'No network' }))
  main.add(evidence({ kind: 'artifact', state: 'stale', text: 'stale-work-file' }))
  expect(main.add(evidence({ kind: 'tool-outcome', text: 'unknown call', call: null }))).toBe('unresolved')
  const pkg = run().package
  const conflict = pkg.items.find(x => x.kind === 'decision-conflict')
  expect(conflict.sources).toHaveLength(2)
  expect(conflict.text).toContain('competing-strategy')
  expect(pkg.items.filter(x => x.kind === 'decision')).toHaveLength(0)
  expect(pkg.items.find(x => x.kind === 'graph-issue')?.text).toBe('invalid-evidence')
  expect(pkg.omissions).toMatchObject({ stale: 1, duplicate: 1 })
})

test('budgets the actual serialized envelope, preserves Tier 0, and does not split Unicode', () => {
  const { main, evidence, run } = fixture()
  main.add(evidence({ kind: 'artifact', state: 'verified', text: '报表🙂 ```json {"count": 2}```\n'.repeat(190) }))
  expect(run({ tokenBudget: 64 }).status).toBe('budget_insufficient')
  const large = run().package
  expect(large.assembly.estimator).toBe('utf8-byte-upper-estimate-v1')
  expect(large.assembly.estimatedTokens).toBe(estimateContextTokens(serializeTaskContext(large)) + large.assembly.reservedTokens)
  expect(large.assembly.estimatedTokens).toBeLessThanOrEqual(12000)
  const artifact = large.items.find(x => x.kind === 'artifact')
  expect(artifact.truncated).toBe(true)
  expect(Buffer.from(artifact.text).toString('utf8')).toBe(artifact.text)
  const smallBudget = 4000
  const small = run({ tokenBudget: smallBudget }).package
  expect(small.assembly.estimatedTokens).toBeLessThanOrEqual(smallBudget)
  expect(small.items.some(x => x.kind === 'constraint')).toBe(true)
  expect(small.omissions.budget_exceeded).toBeGreaterThan(0)
})

test('a fresh consumer verifies the bounded wire package against a trusted handoff hash', () => {
  const { main, evidence, run } = fixture()
  for (let i = 0; i < 180; i++) main.add(evidence({ kind: 'artifact', state: 'verified', text: `Fixture file ${i}` }))
  const pkg = run().package
  const wire = serializeTaskContext(pkg)
  const expected = { taskId: a, hash: pkg.assembly.deterministicHash }
  expect(loadTaskContext(wire, expected, digest)).toEqual(pkg)
  expect(loadTaskContext(wire.replace('Ship A', 'Ship X'), expected, digest)).toBeNull()
  expect(loadTaskContext(wire, { ...expected, taskId: b }, digest)).toBeNull()
  expect(pkg.omissions.budget_exceeded).toBeGreaterThan(150)
})

test('fails closed for revoked scope, wrong Task or node, and sequence gaps', () => {
  const { run, authority, scope, main } = fixture()
  expect(run({}, authority.grant('foreign')).status).toBe('unavailable')
  expect(run({ taskId: b }).status).toBe('unavailable')
  expect(run({ activeNodeId: 'invented' }).status).toBe('unresolved')
  const last = main.graph.read(scope).task.opened.source
  main.graph.append(scope, { kind: 'task-closed', seq: 99, id: 'gap', source: last })
  expect(run().status).toBe('unresolved')
  authority.revoke(scope)
  expect(run().status).toBe('unavailable')
})
