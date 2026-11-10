import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { assembleTaskContext, createScopeAuthority, runtimeFactId, serializeTaskContext } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as acmi from '../../dist/index.js'

assert(process.argv[2], 'Pass an explicit empty evidence output directory')
const output = resolve(process.argv[2])
const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-082-benchmark-')))
const dirs = Object.fromEntries(['work', 'journal', 'graph', 'home', 'agents'].map(key => [key, join(base, key)]))
for (const path of Object.values(dirs)) await mkdir(path)
process.env.DSH_HOME = dirs.home
process.env.DSH_AGENTS_HOME = dirs.agents
const { partitionId: workspaceId } = await acmi.createStorageIsolationMarker(dirs.journal, dirs.work, 'none')
acmi.provisionGraphRoot(dirs.graph, workspaceId)
const read = createScopeAuthority()
const write = createScopeAuthority()
const scope = read.grant(workspaceId)
const writer = write.grant(workspaceId)
const open = (root = dirs.graph, maxPages) => acmi.openGraphStore({ root, workspaceId, read, write, maxPages })
let store = open()
const ctx = new Context()
let supervisor
const hash = text => createHash('sha256').update(text).digest('hex')
const results = []
const families = ['rates', 'burst', 'reload', 'ordering', 'sqlite', 'child', 'snapshot', 'context']
const holdout = new Set(['burst', 'snapshot'])
const scenarios = families.flatMap((family, f) => Array.from({ length: 16 }, (_, i) => ({
  id: '082-' + family + '-' + i, family, index: f * 16 + i, variant: i,
  split: holdout.has(family) ? 'holdout' : 'development',
  labelProvenance: 'agent_generated_not_human_reviewed',
})))
const samples = {}
const record = (name, value) => (samples[name] ??= []).push(value)
const timed = (name, fn) => {
  const start = performance.now()
  try { return fn() } finally { record(name, performance.now() - start) }
}
const textOf = request => request.messages.flatMap(message => message.content)
  .filter(block => block.type === 'text').map(block => block.text).join('\n')
const adapter = new class extends LlmAdapter {
  calls = 0
  last = ''
  async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 200_000 } } }
  async *stream(request) {
    this.calls++
    this.last = textOf(request)
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}()
const options = () => ({ enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION, workspaceRoot: dirs.work,
  journalRoot: dirs.journal, compression: 'none', store, scope, writer })
const ref = (sessionId, incarnation = '1') => ({ adapterId: 'dsh', sessionId, incarnation, instanceId: workspaceId })
const fact = (session, seq, detail) => ({ version: 'runtime-fact-v1', workspaceId, runtimeVersion: acmi.DSH_VERSION,
  adapterVersion: '0.8.2', provenance: 'runtime_observed', eventId: runtimeFactId(session, seq, hash), detail,
  source: { session, localSeq: seq, sourceRevision: hash(JSON.stringify(session)) } })
const append = (agent, n) => { for (let i = 0; i < n; i++) appendPluginRecord(agent.session, 'plugin:acmi-probe/benchmark', { i }) }
const cursor = agent => store.cursor(scope, acmi.dshRuntimeIdentity(agent.session.header, workspaceId)).next
async function until(predicate) {
  const deadline = performance.now() + 5000
  while (!predicate()) {
    if (performance.now() >= deadline) throw Error('Benchmark timeout')
    await delay(2)
  }
}
const ingest = (session, seq, detail, target = store) =>
  timed('sqliteAppendMs', () => target.ingest(writer, fact(session, seq, detail), 0))
const requestFor = taskId => ({ taskId, tokenBudget: 15000, policyVersion: 'task-context-v1', includeDependencyResults: true })
const taskId = index => '08200000-0000-4000-8000-' + String(index).padStart(12, '0')
function seed(task, objective) {
  for (const [i, change] of [
    { kind: 'task-opened', objective, criteria: ['Preserve source and acceptance boundary'] },
    { kind: 'node-added', nodeId: 'main', title: 'Main', role: 'work' },
    { kind: 'mainline-advanced', nodeId: 'main' },
  ].entries()) store.append(writer, task, { key: 'seed-' + i, change,
    source: { session: { ...ref('host'), adapterId: 'acmi-host' }, localSeq: i, sourceRevision: 'fixture-host' } })
}
const send = async agent => {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic benchmark turn' }] }))
  await agent.whenIdle()
}
const start = agents => acmi.startDshIngestionSupervisor(ctx, { ...options(),
  authorize: session => agents.some(agent => agent.session === session) ? {} : null,
  pollMs: 30, debounceMs: 4, maxWaitMs: 12, queueLimit: 16, sessionQueueLimit: 12, batchRows: 8,
})

try {
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { includeHarnessIdentity: false } })
  await ctx.plugin(Jsonl, { root: dirs.journal, compression: 'none' })
  await ctx.plugin(TokenMeter)
  ctx.llm.registerAdapter(['acmi-fixture'], adapter)
  await mountAgentLoopTestHarness(ctx)
  const fresh = id => ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: dirs.work },
    agentOptions: { provider: 'acmi-fixture', model: 'fixture' } })
  seed(taskId(999), 'UNRELATED-SYNTHETIC-TASK')
  for (const c of scenarios) {
    const started = performance.now()
    const result = { ...c }
    if (['rates', 'burst', 'reload'].includes(c.family)) {
      const a = await fresh(c.id)
      const b = c.family === 'burst' ? await fresh(c.id + '-quiet') : null
      const agents = b ? [a.agent, b.agent] : [a.agent]
      supervisor = await start(agents)
      await until(() => agents.every(agent => cursor(agent) === agent.session.seq))
      const cold = supervisor.metrics().coldDecodedRows
      const rows = c.family === 'burst' ? 28 + c.variant : c.family === 'rates' ? 1 + (c.variant % 3) * 4 : 4 + c.variant
      let begin = performance.now()
      if (c.family === 'reload') {
        assert.equal((await supervisor.stop()).pending, 0)
        append(a.agent, rows)
        assert(await ctx.sessions.flush(a.agent.session))
        store.close()
        begin = performance.now()
        store = open()
        supervisor = await start(agents)
      } else {
        append(a.agent, rows)
        if (b) {
          append(b.agent, 1)
          await until(() => cursor(b.agent) === b.agent.session.seq)
          result.quietCaughtUpMs = performance.now() - begin
          result.noisyRemainingAtQuietCommit = a.agent.session.seq - cursor(a.agent)
        }
      }
      await until(() => cursor(a.agent) === a.agent.session.seq)
      result.completionMs = performance.now() - begin
      result.batchSize = rows
      result.decodedRows = supervisor.metrics().coldDecodedRows - (c.family === 'reload' ? 0 : cold)
      result.queueHighWater = supervisor.metrics().queueHighWater
      result.dropped = supervisor.metrics().dropped
      result.reconciliations = supervisor.metrics().reconciliations
      assert(result.queueHighWater <= 16)
      if (c.family === 'rates') assert.equal(result.decodedRows, 0)
      if (c.family === 'burst') assert(result.dropped > 0)
      if (c.family === 'reload') assert(result.decodedRows >= rows)
      assert.equal((await supervisor.stop()).pending, 0)
      await b?.dispose()
      await a.dispose()
    } else if (c.family === 'ordering') {
      const s = ref(c.id)
      assert.throws(() => ingest(s, 1, { kind: 'unmapped' }), e => e.code === 'gap')
      assert.equal(store.cursor(scope, s).next, 0)
      ingest(s, 0, { kind: 'unmapped' })
      assert.equal(ingest(s, 0, { kind: 'unmapped' }).status, 'duplicate')
      ingest(s, 1, { kind: 'unmapped' })
      result.duplicatesSuppressed = 1
      result.gapsRejected = 1
    } else if (c.family === 'sqlite') {
      assert.throws(() => open(), e => e.code === 'busy')
      const root = join(base, c.id)
      await mkdir(root)
      acmi.provisionGraphRoot(root, workspaceId)
      const limited = open(root, 24)
      const s = ref(c.id)
      try {
        assert.throws(() => {
          for (let seq = 0; seq < 150; seq++) ingest(s, seq, { kind: 'unmapped' }, limited)
        }, e => e.code === 'limit')
        result.cursorAtFull = limited.cursor(scope, s).next
        assert.equal(limited.factAt(scope, s, result.cursorAtFull), null)
      } finally { limited.close() }
      const restored = open(root)
      try { assert.equal(restored.cursor(scope, s).next, result.cursorAtFull) } finally { restored.close() }
      result.lockDenied = 1
    } else if (c.family === 'child') {
      const parent = ref(c.id), child = ref(c.id + '-child')
      ingest(parent, 0, { kind: 'subagent-catalog', nativeVersion: 0, childId: child.sessionId,
        childIncarnation: child.incarnation, mode: 'continuable' })
      ingest(child, 0, { kind: 'subagent-descriptor', nativeVersion: 3, mode: 'continuable', parentSessionId: parent.sessionId })
      ingest(child, 1, { kind: 'turn-open', turn: '1' })
      const terminal = ['turn-complete', 'turn-failed', 'turn-interrupted', null][c.variant % 4]
      if (terminal) ingest(child, 2, { kind: terminal, turn: '1' })
      const e = store.childEvidence(scope, parent, child)
      assert.equal(e.membership, 'confirmed_local')
      assert.equal(e.turn.kind, terminal ?? 'turn-open')
      assert.equal(store.childEvidence(scope, parent, { ...child, incarnation: '2' }).membership, 'unconfirmed')
      assert.equal(e.acceptance, 'not_inferred')
      assert.equal(e.scheduler, 'execution_state_unknown_after_restart')
      result.terminal = terminal
      result.schedulerUnknown = 1
      result.falseAcceptance = 0
    } else if (c.family === 'snapshot') {
      const guard = acmi.registerDshSnapshotGuard(ctx, options())
      const { agent, dispose } = await fresh(c.id)
      try {
        const task = taskId(c.index)
        seed(task, 'Snapshot benchmark task ' + c.index)
        let now = 1000
        const recovery = await acmi.registerPersistentDshRecovery(ctx, agent,
          { ...options(), governance: guard, request: requestFor(task), ttlMs: 20, now: () => now })
        assert.equal(await recovery.prepare(), 'ok')
        const id = recovery.snapshot().packageHash
        if (c.variant % 3 !== 0) {
          await send(agent)
          assert(adapter.last.includes(id))
        }
        const before = adapter.calls
        const begin = performance.now()
        if (c.variant % 2 === 0) guard.retire(agent.session.id)
        else now = 1020
        assert.equal(recovery.snapshot(), null)
        result.revokeToNoContributionMs = performance.now() - begin
        await send(agent)
        assert.equal(adapter.calls, before)
        result.adapterResends = 0
        result.persistedSnapshots = agent.session.snapshotEvents().filter(event =>
          event.type === 'user/message' && event.data.source.kind === 'runtime-context'
          && event.data.content.some(block => block.type === 'text' && block.text.includes(id))).length
        assert.equal(result.persistedSnapshots, Number(c.variant % 3 !== 0))
        result.requestDenials = guard.metrics().denied
      } finally { await dispose(); guard.dispose() }
    } else {
      const task = taskId(c.index)
      seed(task, 'Scoped Context Benchmark ' + c.index)
      const foreign = read.grant('foreign')
      assert.equal(store.read(foreign, task), null)
      store.close()
      store = timed('graphOpenMs', () => open())
      const cut = timed('graphRestoreMs', () => store.read(scope, task))
      const request = { ...requestFor(task), tokenBudget: c.variant % 4 === 0 ? 100 : 15000 }
      const pack = timed('contextAssemblyMs', () => assembleTaskContext({ read: () => cut.snapshot }, scope, request, hash))
      result.packageStatus = pack.status
      if (request.tokenBudget === 100) assert.equal(pack.status, 'budget_insufficient')
      else {
        assert.equal(pack.status, 'ok')
        assert(!serializeTaskContext(pack.package).includes('UNRELATED-SYNTHETIC-TASK'))
        result.tokenEstimate = pack.package.assembly.estimatedTokens
      }
      result.foreignLeaks = 0
    }
    results.push({ ...result, elapsedMs: performance.now() - started, pass: true })
  }
  const stats = values => {
    const sorted = [...values].sort((a, b) => a - b)
    return { n: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * .5)], p95: sorted[Math.floor((sorted.length - 1) * .95)], max: sorted.at(-1) }
  }
  const summary = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, stats(values)]))
  for (const family of ['rates', 'burst', 'reload']) {
    const selected = results.filter(c => c.family === family)
    summary[family] = { settleMs: stats(selected.map(c => c.completionMs)), queue: stats(selected.map(c => c.queueHighWater)),
      coldRows: selected.reduce((a, c) => a + c.decodedRows, 0) }
  }
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'phase-0.8.2-scenarios.json'), JSON.stringify(scenarios, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'phase-0.8.2-results.json'), JSON.stringify({ results, summary, memoryRssBytes: process.memoryUsage().rss }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ scenarios: scenarios.length, development: 96, holdout: 32, summary }))
} finally {
  await supervisor?.stop()
  store.close()
  try { await ctx.fiber.dispose() } finally { await rm(base, { recursive: true, force: true }) }
}
