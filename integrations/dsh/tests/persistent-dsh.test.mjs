import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScopeAuthority, runtimeFactId } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import Subagent from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
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
      if (!textOf(options.messages).includes(marker)) continue
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

async function boot(t, workingDirectory = false) {
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
  const open = (maxPages, understanding) => acmi.openGraphStore({ root, workspaceId, read, write, maxPages, understanding })
  const ctx = new Context()
  t.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(base, { recursive: true, force: true }) }
  })
  await mountAgentLoopTestDependencies(ctx, { workingDirectory, systemPrompt: { includeHarnessIdentity: false } })
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

test('a real guarded reader contention retries automatically without jumping the durable cursor', async t => {
  const h = await boot(t)
  const store = h.open()
  let supervisor
  let reading = true
  let lockWork
  try {
    const agent = await h.fresh('082-reader-contention')
    for (let i = 0; i < 24; i++) appendPluginRecord(agent.session, 'plugin:acmi-probe/busy', {})
    expect(await h.ctx.sessions.flush(agent.session)).toBe(true)
    const opts = h.options(store)
    const journal = await acmi.openDshJournal(opts.journalRoot, opts.workspaceRoot, opts.compression)
    const signal = AbortSignal.timeout(5000)
    lockWork = (async () => {
      while (reading) {
        try {
          const snap = await journal.inspect(agent.session.id, signal)
          if (snap) await journal.read(snap, signal)
        } catch (error) {
          if (error.code !== 'ACMI_JOURNAL_BUSY') throw error
          await new Promise(resolve => setImmediate(resolve))
        }
      }
    })()
    lockWork.catch(() => {})
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, { ...opts, authorize: s => s === agent.session ? {} : null,
      pollMs: 20, retryBaseMs: 120 })
    await vi.waitFor(() => expect(supervisor.status(agent.session)).toMatchObject({ phase: 'retrying', error: 'busy' }))
    const identity = acmi.dshRuntimeIdentity(agent.session.header, h.workspaceId)
    expect(store.cursor(h.scope, identity).next).toBe(0)
    reading = false
    await lockWork
    await vi.waitFor(() => expect(store.cursor(h.scope, identity).next).toBe(agent.session.seq))
    expect(supervisor.metrics()).toMatchObject({ retryCount: expect.any(Number), failures: 0 })
    console.log('ACMI082_RETRY ' + JSON.stringify({ retries: supervisor.metrics().retryCount, caughtUp: true }))
  } finally {
    reading = false
    await lockWork?.catch(() => {})
    await supervisor?.stop(1000)
    store.close()
  }
}, 10000)

test.for(['revoke', 'expiry', 'revision', 'dispose', 'restart'])('guard blocks old stock snapshot at adapter for %s', async (reason, t) => {
  const h = await boot(t)
  let store = h.open()
  let guard
  try {
    const old = await h.fresh('082-old')
    const add = seed(store, h, old.session, taskA)
    const install = () => acmi.registerDshSnapshotGuard(h.ctx, h.options(store))
    guard = install()
    let now = 1000
    const reg = await acmi.registerPersistentDshRecovery(h.ctx, old,
      { ...h.options(store), governance: guard, request, ttlMs: 100, now: () => now })
    expect(await reg.prepare()).toBe('ok')
    const { packageHash } = reg.snapshot()
    await h.send(old, 'Expose first snapshot.')
    expect(textOf(h.adapter.calls.at(-1).messages)).toContain(packageHash)
    expect(checkpointEvents(old)).toHaveLength(1)
    await h.ctx.sessions.flush(old.session)
    const file = (await h.ctx.sessionPersistence.stat(old.session.id, {})).location.path
    const before = await readFile(file)
    if (reason === 'revoke') {
      h.read.revoke(h.scope)
      guard.retire(old.session.id)
    }
    if (reason === 'expiry') now = 1100
    if (reason === 'revision') add({ kind: 'evidence-recorded', content: { kind: 'constraint', text: 'New revision.' } })
    if (reason === 'dispose') reg.dispose()
    if (reason === 'restart') {
      guard.dispose()
      reg.dispose()
      store.close()
      store = h.open()
      guard = install()
    }
    expect(reg.snapshot()).toBeNull()
    const calls = h.adapter.calls.length
    await h.send(old, 'Must not reach the adapter.')
    await h.ctx.compaction.compactNow(old, AbortSignal.timeout(5000)).catch(() => null)
    expect(h.adapter.calls).toHaveLength(calls)
    expect(guard.metrics()).toMatchObject({ denied: 2, staleCandidates: 2, compactionDenied: 1 })
    expect(checkpointEvents(old)).toHaveLength(1)
    await h.ctx.sessions.flush(old.session)
    expect((await readFile(file)).subarray(0, before.length)).toEqual(before)
    const clean = await h.fresh('082-clean')
    await h.send(clean, 'Fresh ordinary request.')
    expect(h.adapter.calls).toHaveLength(calls + 1)
    expect(textOf(h.adapter.calls.at(-1).messages)).not.toContain(packageHash)
    console.log('ACMI082_SNAPSHOT ' + JSON.stringify({ mode: built ? 'built' : 'source', reason, ...guard.metrics(),
      journalPrefixUnchanged: true, adapterPostRevocation: 0, freshSession: true }))
  } finally { guard?.dispose(); store.close() }
}, 15000)

test('stock Scheduler creates durable catalog, descriptor and turn evidence, not durable Scheduler state or acceptance', async t => {
  const h = await boot(t, true)
  let store = h.open()
  let supervisor
  try {
    const parent = await h.fresh('082-scheduler')
    seed(store, h, parent.session, taskA)
    await h.ctx.plugin(Subagent)
    await h.ctx.plugin(Spawn, { providerName: 'spawn' })
    const events = []
    h.ctx.on('subagent/start', info => events.push({ type: 'start', id: info.id, run: info.runId }), { global: true })
    h.ctx.on('subagent/end', info => events.push({ type: 'end', id: info.id, run: info.runId }), { global: true })
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, {
      ...h.options(store), authorize: session => session === parent.session || session.header.parentSession === parent.session.id ? {} : null,
      debounceMs: 4, maxWaitMs: 10, pollMs: 20,
    })
    const parentRef = acmi.dshRuntimeIdentity(parent.session.header, h.workspaceId)
    const gate = h.adapter.gate('CHILD-DURABILITY-082')
    let activation
    let childRef
    try {
      activation = await h.ctx.subagents.startActivation({
        provider: 'spawn', label: 'PRIVATE-CHILD-LABEL',
        request: { parent, prompt: [{ type: 'text', text: 'CHILD-DURABILITY-082' }] },
        signal: AbortSignal.timeout(5000), delivery: 'caller',
      })
      await Promise.race([gate.entered, activation.result.then(result => {
        throw new Error('Child settled before reaching adapter: ' + result.stopReason)
      })])
      const child = h.ctx.agents.get(activation.childId)
      childRef = acmi.dshRuntimeIdentity(child.session.header, h.workspaceId)
      await vi.waitFor(() => expect(store.childEvidence(h.scope, parentRef, childRef)).toMatchObject({
        membership: 'confirmed_local', turn: { kind: 'turn-open' }, scheduler: 'execution_state_unknown_after_restart',
      }))
    } finally { gate.release() }
    await activation.result
    await vi.waitFor(() => expect(store.childEvidence(h.scope, parentRef, childRef)).toMatchObject({
      membership: 'confirmed_local', turn: { kind: 'turn-complete' },
    }))
    expect(events.map(e => e.type)).toEqual(['start', 'end'])
    expect(events[0].run).toBe(events[1].run)
    expect(events[0].run).toBeTruthy()
    expect(store.childEvidence(h.scope, parentRef, { ...childRef, incarnation: '0' }).membership).toBe('unconfirmed')
    const evidence = store.childEvidence(h.scope, parentRef, childRef)
    expect(JSON.stringify(evidence)).not.toMatch(/PRIVATE-CHILD-LABEL|CHILD-DURABILITY-082/)
    expect(state(store, h).snapshot.results).toEqual([])
    expect(state(store, h).snapshot.reviews).toEqual([])
    await supervisor.stop(1000)
    store.close()
    store = h.open()
    expect(store.childEvidence(h.scope, parentRef, childRef)).toEqual(evidence)
    console.log('ACMI082_SUBAGENT ' + JSON.stringify({ liveNotifications: events.length, liveRunIdPersisted: false,
      membership: evidence.membership, nativeTurn: evidence.turn.kind, scheduler: evidence.scheduler, accepted: false }))
  } finally { await supervisor?.stop(1000); store.close() }
}, 15000)

test('authorized live feed drains automatically, reconciles overflow and reload gaps, and stays idle without decoding', async t => {
  const h = await boot(t)
  const store = h.open()
  let supervisor
  const authorized = new Set(['082-live', '082-second'])
  const options = { ...h.options(store), authorize: s => authorized.has(s.id) ? {} : null,
    debounceMs: 8, maxWaitMs: 24, pollMs: 25, queueLimit: 4, sessionQueueLimit: 2, batchRows: 2 }
  try {
    const first = await h.fresh('082-live')
    const cursor = a => store.cursor(h.scope, acmi.dshRuntimeIdentity(a.session.header, h.workspaceId)).next
    const caughtUp = a => vi.waitFor(() => expect(cursor(a)).toBe(a.session.seq), { timeout: 4000 })
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, options)
    await caughtUp(first)
    const second = await h.fresh('082-second')
    const denied = await h.fresh('082-not-authorized')
    const before = supervisor.metrics().coldDecodedRows
    for (let i = 0; i < 17; i++) appendPluginRecord(first.session, 'plugin:acmi-probe/fixture', { i })
    await Promise.all([h.send(second, 'Second authorized agent'), h.send(denied, 'Unrelated agent')])
    await Promise.all([caughtUp(first), caughtUp(second)])
    expect(supervisor.metrics().coldDecodedRows).toBeGreaterThan(before)
    expect(supervisor.metrics().queued).toBe(0)
    expect(cursor(denied)).toBe(0)
    expect(supervisor.status(first.session)).toMatchObject({ phase: 'idle', dropped: expect.any(Number) })
    expect(supervisor.status(first.session).dropped).toBeGreaterThan(0)
    const oldCursor = cursor(first)
    expect(await supervisor.stop(1000)).toMatchObject({ pending: 0 })
    await h.send(first, 'Between two supervisor lifetimes')
    await h.ctx.sessions.flush(first.session)
    expect(cursor(first)).toBe(oldCursor)
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, options)
    await caughtUp(first)
    const cold = supervisor.metrics().coldDecodedRows
    const probes = supervisor.metrics().probes
    await vi.waitFor(() => expect(supervisor.metrics().probes).toBeGreaterThanOrEqual(probes + 6))
    expect(supervisor.metrics().coldDecodedRows).toBe(cold)
    console.log('ACMI082_SUPERVISOR ' + JSON.stringify({ ...supervisor.metrics(), unownedCursor: cursor(denied), idleDecodes: 0 }))
  } finally { await supervisor?.stop(1000); store.close() }
}, 15000)

test('Phase 0.9 only analyzes selected durable deltas and requires explicit Host apply', async t => {
  const h = await boot(t)
  const store = h.open(undefined, true)
  let supervisor
  try {
    const agent = await h.fresh('09-intent')
    const denied = await h.fresh('09-unrelated')
    seed(store, h, agent.session, taskA)
    const identity = acmi.dshRuntimeIdentity(agent.session.header, h.workspaceId)
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, { ...h.options(store),
      authorize: s => s === agent.session ? { assignment: { taskId: taskA, nodeId: 'main' } } : null,
      pollMs: 20, understanding: {
        targets: [{ taskId: taskA, currentTaskId: taskA, candidates: [{ taskId: taskA, alias: 'a' }] }],
        excerpt: id => agent.session.snapshotEvents().some(e => e.type === 'user/message' && e.data.source.kind === 'user'
          && runtimeFactId(identity, e.seq, checksum) === id) ? 'split into: audit; verify' : undefined,
      },
    })
    const cursor = () => store.cursor(h.scope, identity).next
    await vi.waitFor(() => expect(cursor()).toBe(agent.session.seq))
    const cold = supervisor.metrics().coldDecodedRows
    await Promise.all([h.send(agent, 'PHASE-09-SYNTHETIC-INTENT'), h.send(denied, 'UNRELATED-FIXTURE')])
    await vi.waitFor(() => expect(cursor()).toBe(agent.session.seq))
    const item = await vi.waitFor(() => {
      const item = store.listUnderstanding(h.scope, taskA).find(x => x.proposal.changes.length === 4)
      expect(item?.risks).toEqual([])
      return item
    })
    expect(state(store, h).snapshot.nodes).toHaveLength(1)
    expect(supervisor.understanding.metrics()).toMatchObject({ providerRequests: 0 })
    expect(supervisor.metrics().coldDecodedRows).toBe(cold)
    expect(store.cursor(h.scope, acmi.dshRuntimeIdentity(denied.session.header, h.workspaceId)).next).toBe(0)
    const seq = agent.session.seq
    expect(store.reviewUnderstanding(h.writer, item.proposal.id,
      { decision: 'accept', reviewerId: 'fixture-host', reason: 'Validated explicit stages' }).status).toBe('accepted')
    expect(state(store, h).snapshot.nodes.map(n => n.title)).toEqual(['main', 'audit', 'verify'])
    expect(agent.session.seq).toBe(seq)
    expect(agent.session.snapshotEvents().some(e => e.type === 'plugin:acmi-probe/task-binding')).toBe(false)
  } finally { await supervisor?.stop(1000); store.close() }
}, 10000)

test.for(['before-drain', 'after-flush-before-commit', 'after-commit-before-ack'])('restarts native writer and Store at %s', async (mode, t) => {
  const h = await boot(t)
  const id = '082-crash-' + mode
  const { store: unusedStore, scope: unusedScope, writer: unusedWriter, ...options } = h.options(null)
  const child = spawnSync(process.execPath, [...(built ? [] : ['--experimental-transform-types']),
    fileURLToPath(new URL('./fixtures/phase-082-crash.mjs', import.meta.url))], {
    input: JSON.stringify({ options, root: h.root, workspaceId: h.workspaceId, mode, id }),
    encoding: 'utf8', timeout: 10000,
  })
  expect(child.status, child.stderr).toBe(82)
  const oracle = JSON.parse(child.stdout)
  const store = h.open()
  let supervisor
  try {
    expect(store.cursor(h.scope, oracle.identity).next).toBe(oracle.cursor)
    expect(oracle.cursor).toBe(oracle.checkpoint + Number(mode === 'after-commit-before-ack'))
    const oldFact = oracle.cursor > 0 ? store.factAt(h.scope, oracle.identity, oracle.cursor - 1) : null
    const { agent } = await h.ctx.agents.resume({ resumeSessionId: SessionId(id), agentOptions: { provider, model: 'fixture' } })
    const resumedHead = agent.session.seq
    expect(resumedHead).toBeGreaterThanOrEqual(oracle.head)
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, { ...h.options(store), authorize: s => s === agent.session ? {} : null,
      pollMs: 20, batchRows: 2 })
    await vi.waitFor(() => expect(store.cursor(h.scope, oracle.identity).next).toBe(resumedHead))
    expect(supervisor.metrics().committed).toBe(resumedHead - oracle.cursor)
    const recovered = store.unassigned(h.scope, oracle.identity)
    expect(new Set(recovered.map(row => row.fact.eventId)).size).toBe(resumedHead)
    if (oldFact) expect(store.factAt(h.scope, oracle.identity, oracle.cursor - 1)).toEqual(oldFact)
    console.log('ACMI082_CRASH ' + JSON.stringify({ mode, exit: child.status, start: oracle.cursor, head: oracle.head, resumedHead,
      replayed: supervisor.metrics().committed, duplicateFacts: 0 }))
  } finally { await supervisor?.stop(1000); store.close() }
}, 15000)

test('resumed old snapshot is guarded across a native process exit, fresh authorized recovery still works', async t => {
  const h = await boot(t)
  const id = '082-crash-snapshot'
  const { store: unusedStore, scope: unusedScope, writer: unusedWriter, ...options } = h.options(null)
  const child = spawnSync(process.execPath, [...(built ? [] : ['--experimental-transform-types']),
    fileURLToPath(new URL('./fixtures/phase-082-crash.mjs', import.meta.url))], {
    input: JSON.stringify({ options, root: h.root, workspaceId: h.workspaceId, mode: 'snapshot', id, request }),
    encoding: 'utf8', timeout: 10000,
  })
  expect(child.status, child.stderr).toBe(82)
  const { packageHash } = JSON.parse(child.stdout)
  const store = h.open()
  const guard = acmi.registerDshSnapshotGuard(h.ctx, h.options(store))
  try {
    const { agent } = await h.ctx.agents.resume({ resumeSessionId: SessionId(id), agentOptions: { provider, model: 'fixture' } })
    expect(textOf(checkpointEvents(agent).map(e => e.data))).toContain(packageHash)
    expect(await h.send(agent, 'Quarantined after crash')).toBeUndefined()
    expect(h.adapter.calls).toHaveLength(0)
    expect(guard.metrics()).toMatchObject({ denied: 1, staleCandidates: 1 })
    const target = await h.fresh('082-new-from-crash')
    const recovery = await acmi.registerPersistentDshRecovery(h.ctx, target,
      { ...h.options(store), governance: guard, request, ttlMs: 60_000 })
    expect(await recovery.prepare()).toBe('ok')
    await h.send(target, 'Recover via a fresh authorization')
    expect(h.adapter.calls).toHaveLength(1)
    expect(textOf(h.adapter.calls[0].messages)).toContain('Cross process snapshot objective')
    console.log('ACMI082_SNAPSHOT_RESTART ' + JSON.stringify({ nativeSnapshotRetained: true, deniedOld: 1, authorizedFresh: 1 }))
  } finally { guard.dispose(); store.close() }
}, 15000)

test('explicit offline reconciliation restores Scheduler membership but does not fabricate a lost terminal event', async t => {
  const h = await boot(t)
  const { store: unusedStore, scope: unusedScope, writer: unusedWriter, ...options } = h.options(null)
  const child = spawnSync(process.execPath, [...(built ? [] : ['--experimental-transform-types']),
    fileURLToPath(new URL('./fixtures/phase-082-crash.mjs', import.meta.url))], {
    input: JSON.stringify({ options, root: h.root, workspaceId: h.workspaceId, mode: 'child-open', id: '082-parent-crash' }),
    encoding: 'utf8', timeout: 10000,
  })
  expect(child.status, child.stderr).toBe(82)
  const refs = JSON.parse(child.stdout)
  const store = h.open()
  try {
    const opts = h.options(store)
    expect(h.ctx.agents.list()).toHaveLength(0)
    await expect(acmi.reconcileKnownDshSession(h.ctx, opts, { ...refs.parent, incarnation: '0' })).rejects.toThrow(/unavailable/)
    expect(store.childEvidence(h.scope, refs.parent, refs.child).membership).toBe('unconfirmed')
    await acmi.reconcileKnownDshSession(h.ctx, opts, refs.parent)
    await acmi.reconcileKnownDshSession(h.ctx, opts, refs.child)
    expect(store.childEvidence(h.scope, refs.parent, refs.child)).toMatchObject({
      membership: 'confirmed_local', turn: { kind: 'turn-open' }, scheduler: 'execution_state_unknown_after_restart',
      acceptance: 'not_inferred',
    })
    expect((await acmi.reconcileKnownDshSession(h.ctx, opts, refs.child)).committed).toBe(0)
    expect(h.ctx.agents.list()).toHaveLength(0)
    console.log('ACMI082_SUBAGENT_CRASH ' + JSON.stringify({ agentsActivated: 0, durableMembership: true, terminalProven: false, accepted: false }))
  } finally { store.close() }
}, 15000)

test('shutdown seals the cut, reports uncommitted work and permits safe restart after SQLITE_FULL', async t => {
  const h = await boot(t)
  let store = h.open(24)
  let supervisor
  try {
    const agent = await h.fresh('082-full')
    const ref = acmi.dshRuntimeIdentity(agent.session.header, h.workspaceId)
    const start = () => acmi.startDshIngestionSupervisor(h.ctx, { ...h.options(store), authorize: s => s === agent.session ? {} : null,
      pollMs: 20, queueLimit: 16, batchRows: 3 })
    supervisor = await start()
    for (let i = 0; i < 150; i++) appendPluginRecord(agent.session, 'plugin:acmi-probe/full', { i })
    await vi.waitFor(() => expect(supervisor.status(agent.session)).toMatchObject({ phase: 'degraded', error: 'limit' }), { timeout: 5000 })
    const before = store.cursor(h.scope, ref).next
    expect(before).toBeLessThan(agent.session.seq)
    expect(store.factAt(h.scope, ref, before)).toBeNull()
    expect(await supervisor.stop(1000)).toMatchObject({ pending: 1, timedOut: false })
    store.close()
    store = h.open()
    expect(store.cursor(h.scope, ref).next).toBe(before)
    supervisor = await start()
    await vi.waitFor(() => expect(store.cursor(h.scope, ref).next).toBe(agent.session.seq), { timeout: 6000 })
    const saved = store.cursor(h.scope, ref).next
    for (let i = 0; i < 12; i++) appendPluginRecord(agent.session, 'plugin:acmi-probe/shutdown', {})
    const sealed = agent.session.seq
    const stopping = supervisor.stop(1)
    appendPluginRecord(agent.session, 'plugin:acmi-probe/post-shutdown', {})
    expect(await stopping).toMatchObject({ pending: 1, timedOut: true, appendedAfterSeal: 1 })
    expect(store.cursor(h.scope, ref).next).toBeGreaterThanOrEqual(saved)
    expect(store.cursor(h.scope, ref).next).toBeLessThan(sealed)
    const stopped = supervisor.metrics()
    expect(stopped.phase).toBe('stopped')
    supervisor = await start()
    await vi.waitFor(() => expect(store.cursor(h.scope, ref).next).toBe(agent.session.seq))
    console.log('ACMI082_FULL ' + JSON.stringify({ lastBeforeFull: before, restoredHead: agent.session.seq, shutdownDeadline: true }))
  } finally { await supervisor?.stop(1000); store.close() }
}, 15000)

test('max-wait forces a native drain during continuous notifications and leaves room for a quiet Session', async t => {
  const h = await boot(t)
  const store = h.open()
  let supervisor
  let ticker
  try {
    const noisy = await h.fresh('082-noisy')
    const quiet = await h.fresh('082-quiet')
    const authorized = new Set([noisy.session, quiet.session])
    const cursor = agent => store.cursor(h.scope, acmi.dshRuntimeIdentity(agent.session.header, h.workspaceId)).next
    supervisor = await acmi.startDshIngestionSupervisor(h.ctx, { ...h.options(store), authorize: s => authorized.has(s) ? {} : null,
      pollMs: 1000, debounceMs: 100, maxWaitMs: 130, queueLimit: 128, batchRows: 4 })
    await vi.waitFor(() => expect(cursor(noisy)).toBe(noisy.session.seq))
    const start = cursor(noisy)
    ticker = setInterval(() => appendPluginRecord(noisy.session, 'plugin:acmi-probe/noisy', {}), 5)
    appendPluginRecord(quiet.session, 'plugin:acmi-probe/quiet', {})
    await vi.waitFor(() => {
      expect(cursor(noisy)).toBeGreaterThan(start)
      expect(cursor(quiet)).toBe(quiet.session.seq)
    }, { timeout: 600 })
    clearInterval(ticker)
    await vi.waitFor(() => expect(cursor(noisy)).toBe(noisy.session.seq))
    const before = cursor(quiet)
    authorized.delete(quiet.session)
    appendPluginRecord(quiet.session, 'plugin:acmi-probe/revoked', {})
    expect(await supervisor.stop(500)).toMatchObject({ pending: 0 })
    expect(cursor(quiet)).toBe(before)
    expect(supervisor.metrics().queued).toBe(0)
  } finally { clearInterval(ticker); await supervisor?.stop(500); store.close() }
}, 10000)

test('retirement before exposure is conservative; completed stock Compact does not authorize old Session reuse', async t => {
  const h = await boot(t)
  const store = h.open()
  const guard = acmi.registerDshSnapshotGuard(h.ctx, h.options(store))
  try {
    const early = await h.fresh('082-early-revoke')
    seed(store, h, early.session, taskA)
    const config = { ...h.options(store), governance: guard, request, ttlMs: 60_000 }
    const reserved = await acmi.registerPersistentDshRecovery(h.ctx, early, config)
    expect(await reserved.prepare()).toBe('ok')
    guard.retire(early.session.id)
    expect(guard.status(early.session.id)).toMatchObject({
      futureContribution: 'stopped', guardedRequest: 'denied', deletion: 'not_performed', providerRetention: 'unknown',
    })
    expect(await reserved.prepare()).toBe('unavailable')
    await h.send(early, 'Not exposed')
    expect(h.adapter.calls).toHaveLength(0)
    expect(checkpointEvents(early)).toHaveLength(0)
    const active = await h.fresh('082-compact-first')
    const recovery = await acmi.registerPersistentDshRecovery(h.ctx, active, config)
    expect(await recovery.prepare()).toBe('ok')
    const hash = recovery.snapshot().packageHash
    await h.send(active, 'Turn to compact before revocation')
    expect(await h.ctx.compaction.compactNow(active, AbortSignal.timeout(5000))).not.toBeNull()
    const compact = h.adapter.calls.find(call => call.purpose === 'compaction')
    expect(textOf(compact.messages)).toContain(hash)
    const count = h.adapter.calls.length
    guard.retire(active.session.id)
    await h.send(active, 'Post-successful-Compact guarded turn')
    expect(h.adapter.calls).toHaveLength(count)
    expect(checkpointEvents(active)).toHaveLength(1)
    const fresh = await h.fresh('082-ordinary')
    await h.send(fresh, 'Unmanaged and no stale marker')
    expect(h.adapter.calls).toHaveLength(count + 1)
    console.log('ACMI082_COMPACT ' + JSON.stringify({ compactAdapterSawOriginal: true, persistedAfterCompact: true,
      retiredAdapterResends: 0, revokedBeforeExposure: true }))
  } finally { guard.dispose(); store.close() }
}, 15000)

test('recognizes an inherited stock Snapshot with no registered destination id or parent link', async t => {
  const h = await boot(t)
  const store = h.open()
  const guard = acmi.registerDshSnapshotGuard(h.ctx, h.options(store))
  try {
    const original = await h.fresh('082-copy-original')
    seed(store, h, original.session, taskA)
    const recovery = await acmi.registerPersistentDshRecovery(h.ctx, original,
      { ...h.options(store), request, ttlMs: 60_000 })
    expect(await recovery.prepare()).toBe('ok')
    // Generate legacy history in a separate pre-guard lifecycle.
    guard.dispose()
    await h.send(original, 'Create a stock legacy snapshot')
    const seedEvents = original.session.snapshotEvents()
    const scopedGuard = acmi.registerDshSnapshotGuard(h.ctx, h.options(store))
    try {
      const { agent: inherited } = await h.ctx.agents.create({
        sessionId: SessionId('082-copy-destination'), seed: seedEvents, inheritedEventCount: SessionLogOffset(seedEvents.length),
        meta: { cwd: original.session.header.cwd, isSeeded: true }, agentOptions: { provider, model: 'fixture' },
      })
      expect(checkpointEvents(inherited)).toHaveLength(1)
      const refused = await acmi.registerPersistentDshRecovery(h.ctx, inherited,
        { ...h.options(store), governance: scopedGuard, request, ttlMs: 60_000 })
      expect(await refused.prepare()).toBe('unavailable')
      const before = h.adapter.calls.length
      await h.send(inherited, 'Try sending copied snapshot')
      expect(h.adapter.calls).toHaveLength(before)
      expect(scopedGuard.metrics()).toMatchObject({ copiedCandidates: 1, denied: 1, reserved: 0 })
    } finally { scopedGuard.dispose() }
  } finally { guard.dispose(); store.close() }
}, 12000)
