import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, expect, test, vi } from 'vitest'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const taskA = '08100000-0000-4000-8000-000000000010'
const taskB = '08100000-0000-4000-8000-000000000020'
const provider = 'acmi-081-local-script'
const textOf = messages => messages.flatMap(m => m.content.flatMap(b => b.type === 'text' ? [b.text] : [])).join('\n')
const checksum = bytes => createHash('sha256').update(bytes).digest('hex')
const request = { taskId: taskA, tokenBudget: 15000, policyVersion: 'task-context-v1', includeDependencyResults: true }
afterEach(() => vi.unstubAllEnvs())

class FixtureAdapter extends LlmAdapter {
  calls = []
  gates = new Map()
  toolUsed = false
  gate(marker) {
    const entered = Promise.withResolvers()
    const release = Promise.withResolvers()
    this.gates.set(marker, { entered, release })
    return { entered: entered.promise, release: release.resolve }
  }
  async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 200_000 } } }
  async *stream(options) {
    this.calls.push(options)
    const last = textOf(options.messages.slice(-1))
    for (const [marker, gate] of this.gates) {
      if (!last.includes(marker)) continue
      this.gates.delete(marker)
      gate.entered.resolve()
      await gate.release.promise
      break
    }
    if (last.includes('CALL-TOOL-ONCE') && !this.toolUsed) {
      this.toolUsed = true
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('call081'), name: 'verify', arguments: '{}' } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic adapter response.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function boot(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-phase081-dsh-')))
  const workspaceRoot = join(base, 'work')
  const journalRoot = join(base, 'journal')
  const root = join(base, 'graph')
  const home = join(base, 'home')
  const agents = join(base, 'agents')
  for (const folder of [workspaceRoot, journalRoot, root, home, agents]) await mkdir(folder)
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DSH_AGENTS_HOME', agents)
  const { partitionId: workspaceId } = await acmi.createStorageIsolationMarker(journalRoot, workspaceRoot, 'none')
  acmi.provisionGraphRoot(root, workspaceId)
  const read = createScopeAuthority()
  const write = createScopeAuthority()
  const scope = read.grant(workspaceId)
  const writer = write.grant(workspaceId)
  const open = () => acmi.openGraphStore({ root, workspaceId, read, write })
  const ctx = new Context()
  t.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(base, { recursive: true, force: true }) }
  })
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { includeHarnessIdentity: false } })
  await ctx.plugin(Jsonl, { root: journalRoot, compression: 'none' })
  await ctx.plugin(TokenMeter)
  const adapter = new FixtureAdapter()
  ctx.llm.registerAdapter([provider], adapter)
  const tool = defineContentToolFixture({ name: 'verify', description: 'Fixture verification', parameters: {},
    async execute() { return [{ type: 'text', text: 'PRIVATE-TOOL-PAYLOAD-081' }] } })
  ctx.tools.register(tool)
  await ctx.plugin(BasicCompaction, { auto: false, maxTokens: 64 })
  const harness = await mountAgentLoopTestHarness(ctx)
  const fresh = name => harness.create(SessionId(name), { provider, model: 'fixture' }, { cwd: workspaceRoot })
  const child = async (name, parent) => (await ctx.agents.create({
    sessionId: SessionId(name), parentAgent: parent, meta: { cwd: workspaceRoot, parentSession: parent.session.id, origin: 'subagent' },
    agentOptions: { provider, model: 'fixture' },
  })).agent
  const send = (agent, text) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    return agent.whenIdle()
  }
  const options = store => ({ enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION,
    workspaceRoot, journalRoot, compression: 'none', store, scope, writer })
  const bind = (s, taskId, revision) => appendPluginRecord(s, 'plugin:acmi-probe/task-binding', { sessionId: s.id, taskId, revision })
  return { workspaceId, root, read, scope, writer, open, ctx, fresh, child, send, options, adapter, bind }
}

const state = (store, h, taskId = taskA) => store.read(h.scope, taskId)
function seed(store, h, session, taskId, nodes = ['main']) {
  const host = { ...acmi.dshRuntimeIdentity(session.header, h.workspaceId), adapterId: 'acmi-host' }
  let n = 0
  const add = change => store.append(h.writer, taskId, { change, key: 'bootstrap-' + ++n,
    source: { session: host, localSeq: n, sourceRevision: 'host-confirmed-bootstrap' } })
  add({ kind: 'task-opened', objective: taskId === taskA ? 'TASK-A-OBJECTIVE' : 'TASK-B-FOREIGN', criteria: ['Verify run'] })
  for (const nodeId of nodes) {
    add({ kind: 'node-added', nodeId, title: nodeId, role: 'work' })
    add({ kind: 'work-transitioned', nodeId, state: 'ready' })
    add({ kind: 'work-transitioned', nodeId, state: 'running' })
  }
  add({ kind: 'mainline-advanced', nodeId: nodes[0] })
  return add
}
const checkpointEvents = a => a.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context')
  .filter(e => textOf([e.data]).includes('ACMI task recovery data'))

test('captures actual dsh Session events, reloads a suffix, and recovers a fresh request after process restart', async t => {
  const h = await boot(t)
  let store = h.open()
  let ingestion
  try {
    const first = await h.fresh('081-original')
    seed(store, h, first.session, taskA)
    seed(store, h, first.session, taskB)
    expect(await acmi.registerDshRuntimeIngestion(h.ctx, { ...h.options(store), enabled: false })).toBeNull()
    ingestion = await acmi.registerDshRuntimeIngestion(h.ctx, h.options(store))
    ingestion.attach(first.session, { taskId: taskA, nodeId: 'main' })
    await ingestion.reconcile(first.session)
    const firstOffset = first.session.seq
    const cold = ingestion.metrics().coldDecodedRows
    h.bind(first.session, taskA, 1)
    await h.send(first, 'CALL-TOOL-ONCE task A')
    await ingestion.drain(first.session)
    const tool = store.facts(h.scope, taskA).find(row => row.fact.detail.kind === 'tool-result')
    expect(tool?.attribution).toEqual({ kind: 'assigned', taskId: taskA, via: 'original-call' })
    expect(JSON.stringify(tool)).not.toContain('PRIVATE-TOOL-PAYLOAD-081')
    expect(state(store, h).snapshot.executions.at(-1).state).toBe('completed')
    h.bind(first.session, taskB, 2)
    await h.send(first, 'PRIVATE B TURN' + ' Isolated unrelated detail.'.repeat(240))
    await ingestion.drain(first.session)
    h.bind(first.session, taskA, 3)
    await h.send(first, 'Return to A')
    await ingestion.drain(first.session)
    const beforeCompact = state(store, h).revision
    expect(await h.ctx.compaction.compactNow(first, AbortSignal.timeout(5000))).not.toBeNull()
    await ingestion.drain(first.session)
    const identity = acmi.dshRuntimeIdentity(first.session.header, h.workspaceId)
    expect(store.unassigned(h.scope, identity).filter(row => row.fact.detail.kind.startsWith('compact-'))
      .map(row => row.fact.detail.kind)).toEqual(['compact-start', 'compact-summary', 'compact-end'])
    expect(state(store, h).revision).toBe(beforeCompact)
    expect(ingestion.metrics().coldDecodedRows).toBe(cold)
    expect(ingestion.metrics().captured).toBe(first.session.seq - firstOffset)
    const liveRows = ingestion.metrics().captured
    expect(store.facts(h.scope, taskB).some(row => row.fact.detail.kind === 'assistant')).toBe(true)
    const savedCursor = store.cursor(h.scope, identity)
    const checkpoint = state(store, h)
    store.checkpoint(h.writer, taskA, checkpoint.revision)
    ingestion.dispose()
    await h.send(first, 'Suffix during observer unload')
    await h.ctx.sessions.flush(first.session)
    ingestion = await acmi.registerDshRuntimeIngestion(h.ctx, h.options(store))
    ingestion.attach(first.session, { taskId: taskA, nodeId: 'main' })
    await expect(ingestion.drain(first.session)).rejects.toThrow(/gap/)
    await ingestion.reconcile(first.session)
    expect(store.cursor(h.scope, acmi.dshRuntimeIdentity(first.session.header, h.workspaceId)).next).toBeGreaterThan(savedCursor.next)
    const second = await h.fresh('081-second')
    ingestion.attach(second.session, { taskId: taskA, nodeId: 'main' })
    await ingestion.reconcile(second.session)
    await h.send(second, 'Second independent source session')
    await ingestion.drain(second.session)
    const evidence = store.facts(h.scope, taskA).findLast(row => row.fact.detail.kind === 'assistant')
    const proposal = acmi.analyzeTaskDelta(state(store, h), [evidence], {
      kind: 'next-action', evidenceId: evidence.fact.eventId, text: 'Run the verified recovery checklist.',
    }).proposal
    expect(store.review(h.writer, proposal, 'accept').status).toBe('accepted')
    const expected = state(store, h)
    const status = await h.ctx.sessionPersistence.stat(first.session.id, {})
    const journal = status.location.path
    const journalHash = checksum(await readFile(journal))
    ingestion.dispose()
    store.close()
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/phase-081-child.mjs', import.meta.url))], {
      encoding: 'utf8', input: JSON.stringify({ mode: 'read', root: h.root, workspaceId: h.workspaceId, taskId: taskA }), timeout: 8000,
    })
    expect(result.status, result.stderr).toBe(0)
    const child = JSON.parse(result.stdout)
    expect(child.cut).toEqual(expected)
    expect(child.metrics.replayed).toBe(expected.snapshot.through - checkpoint.snapshot.through)
    store = h.open()
    const third = await h.fresh('081-recovery')
    let now = 1000
    const registration = await acmi.registerPersistentDshRecovery(h.ctx, third, { ...h.options(store), request, ttlMs: 100, now: () => now })
    expect(await registration.prepare()).toBe('ok')
    const original = registration.snapshot()
    expect(await registration.prepare()).toBe('ok')
    expect(registration.snapshot().id).toBe(original.id)
    await h.send(third, 'Continue selected work.')
    const prompt = textOf(h.adapter.calls.at(-1).messages)
    for (const text of ['TASK-A-OBJECTIVE', original.packageHash, 'Run the verified recovery checklist.']) expect(prompt).toContain(text)
    for (const text of ['TASK-B-FOREIGN', 'PRIVATE B TURN', 'PRIVATE-TOOL-PAYLOAD-081', 'Suffix during observer unload']) expect(prompt).not.toContain(text)
    expect(checkpointEvents(third)).toHaveLength(1)
    expect(checksum(await readFile(journal))).toBe(journalHash)
    expect(original.sessionId).toBe(third.session.id)
    store.append(h.writer, taskA, { key: 'new-revision', source: evidence.fact.source,
      change: { kind: 'evidence-recorded', content: { kind: 'constraint', text: 'Must remain isolated' } } })
    expect(registration.snapshot()).toBeNull()
    expect(await registration.prepare()).toBe('ok')
    expect(registration.snapshot().id).not.toBe(original.id)
    now = 1100
    expect(registration.snapshot()).toBeNull()
    const beforeRevoke = checkpointEvents(third).length
    h.read.revoke(h.scope)
    expect(await registration.prepare()).toBe('unavailable')
    await h.send(third, 'Ordinary request after revocation.')
    expect(checkpointEvents(third)).toHaveLength(beforeRevoke)
    expect(textOf(h.adapter.calls.at(-1).messages)).toContain('Ordinary request after revocation.')
    expect(registration.metrics().renderMs.length).toBeGreaterThan(0)
    registration.dispose()
    console.log('ACMI081_WITNESS ' + JSON.stringify({ mode: built ? 'built' : 'source', restartSuffixRows: child.metrics.replayed,
      sourceJournalUnchanged: true, oldSnapshotRemains: checkpointEvents(third).length === 1,
      oldBytesVisibleInLaterRequest: textOf(h.adapter.calls.at(-1).messages).includes(original.packageHash), warmSourceRows: 0,
      capturedNativeRows: liveRows, expectedNativeRows: liveRows, dynamicRenderMs: registration.metrics().renderMs }))
  } finally { ingestion?.dispose(); store.close() }
}, 20000)

test('two stock child Agents produce execution facts without acceptance or implicit waiting', async t => {
  const h = await boot(t)
  const store = h.open()
  const gates = []
  let ingestion
  try {
    const parent = await h.fresh('081-parent')
    const add = seed(store, h, parent.session, taskA, ['main', 'child-b', 'child-c'])
    ingestion = await acmi.registerDshRuntimeIngestion(h.ctx, h.options(store))
    ingestion.attach(parent.session, { taskId: taskA, nodeId: 'main' })
    await ingestion.reconcile(parent.session)
    const lead = h.adapter.gate('PARENT-GATE')
    gates.push(lead)
    const running = h.send(parent, 'PARENT-GATE')
    await lead.entered
    await ingestion.drain(parent.session)
    const main = state(store, h).snapshot.executions.find(row => row.nodeId === 'main')
    const jobs = []
    for (const label of ['b', 'c']) {
      const agent = await h.child('081-child-' + label, parent)
      ingestion.attach(agent.session, { taskId: taskA, nodeId: 'child-' + label, parentExecutionId: main.id })
      await ingestion.reconcile(agent.session)
      const gate = h.adapter.gate('CHILD-GATE-' + label)
      gates.push(gate)
      const done = h.send(agent, 'CHILD-GATE-' + label)
      await gate.entered
      await ingestion.drain(agent.session)
      jobs.push({ agent, gate, done })
    }
    const children = state(store, h).snapshot.executions.filter(row => row.parentId === main.id)
    expect(children).toHaveLength(2)
    expect(state(store, h).snapshot.executions[0].state).toBe('running')
    add({ kind: 'execution-transitioned', executionId: main.id, state: 'waiting', waitingFor: children.map(row => row.id) })
    expect(state(store, h).snapshot.executions[0].state).toBe('waiting')
    expect(state(store, h).snapshot.nodes[0].state).toBe('running')
    for (const { agent, gate, done } of jobs) {
      gate.release()
      await done
      await ingestion.drain(agent.session)
    }
    const before = state(store, h).snapshot
    expect(before.executions.map(row => row.state)).toEqual(['waiting', 'completed', 'completed'])
    expect(before.results).toEqual([])
    expect(before.reviews).toEqual([])
    expect(before.activeNodeId).toBe('main')
    add({ kind: 'execution-transitioned', executionId: main.id, state: 'running' })
    lead.release()
    await running
    await ingestion.drain(parent.session)
    expect(state(store, h).snapshot.executions[0].state).toBe('completed')
  } finally {
    for (const gate of gates) gate.release()
    ingestion?.dispose()
    store.close()
  }
}, 20000)

test('budget and expiry fail open to stock request with no prepared package on a new Session', async t => {
  const h = await boot(t)
  const store = h.open()
  try {
    const baseline = await h.fresh('081-baseline')
    seed(store, h, baseline.session, taskA)
    const target = await h.fresh('081-small-budget')
    const opts = { ...h.options(store), ttlMs: 100, request }
    const tiny = await acmi.registerPersistentDshRecovery(h.ctx, target, { ...opts, request: { ...request, tokenBudget: 100 } })
    expect(await tiny.prepare()).toBe('budget_insufficient')
    await h.send(target, 'Baseline path.')
    expect(checkpointEvents(target)).toHaveLength(0)
    const expiredTarget = await h.fresh('081-expired')
    let time = 100
    const expiring = await acmi.registerPersistentDshRecovery(h.ctx, expiredTarget, { ...opts, now: () => time })
    expect(await expiring.prepare()).toBe('ok')
    time = 200
    await h.send(expiredTarget, 'Still baseline.')
    expect(checkpointEvents(expiredTarget)).toHaveLength(0)
    expect(textOf(h.adapter.calls.at(-1).messages)).not.toContain('TASK-A-OBJECTIVE')
  } finally { store.close() }
}, 12000)
