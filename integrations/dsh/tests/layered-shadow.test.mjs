import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, expect, test, vi } from 'vitest'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const { createDshLayeredShadow } = built ? await import('../dist/layered-shadow.js') : await import('../src/layered-shadow.ts')
const sha = value => createHash('sha256').update(value).digest('hex')
const taskA = '09300000-0000-4000-8000-000000000010'
const taskB = '09300000-0000-4000-8000-000000000020'
const provider = 'acmi-093-offline-fixture'
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

class OfflineFixture extends LlmAdapter {
  calls = 0
  toolUsed = false
  async resolveModel(p, m) { return { provider: p, id: m, name: m, context: { contextWindow: 200_000 } } }
  async *stream() {
    this.calls++
    if (!this.toolUsed) {
      this.toolUsed = true
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('call093'), name: 'verify', arguments: '{}' } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic output; a suggestion is not user authorization.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function boot(t) {
  const tmp = await realpath(tmpdir())
  const base = await realpath(await mkdtemp(join(tmp, 'acmi-phase093-shadow-')))
  const [workspaceRoot, journalRoot, graphRoot, home, agents] = ['work', 'journal', 'graph', 'home', 'agents'].map(x => join(base, x))
  const ctx = new Context()
  let store
  let ingestion
  t.onTestFinished(async () => {
    try { ingestion?.dispose(); store?.close(); await ctx.fiber.dispose() } finally {
      const actual = await realpath(base)
      const rel = relative(tmp, actual)
      if (actual !== base || !rel.startsWith('acmi-phase093-shadow-') || rel.includes(sep) || isAbsolute(rel)) throw new Error('Unsafe fixture cleanup path')
      await rm(actual, { recursive: true, force: true })
    }
  })
  for (const folder of [workspaceRoot, journalRoot, graphRoot, home, agents]) await mkdir(folder)
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DSH_AGENTS_HOME', agents)
  const { partitionId: workspaceId } = await acmi.createStorageIsolationMarker(journalRoot, workspaceRoot, 'none')
  acmi.provisionGraphRoot(graphRoot, workspaceId)
  const read = createScopeAuthority()
  const write = createScopeAuthority()
  const scope = read.grant(workspaceId)
  const writer = write.grant(workspaceId)
  store = acmi.openGraphStore({ root: graphRoot, workspaceId, read, write, understanding: true })
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: false, systemPrompt: { includeHarnessIdentity: false } })
  await ctx.plugin(Jsonl, { root: journalRoot, compression: 'none' })
  const offline = new OfflineFixture()
  ctx.llm.registerAdapter([provider], offline)
  ctx.tools.register(defineContentToolFixture({ name: 'verify', description: 'Local synthetic tool', parameters: {},
    async execute() { return [{ type: 'text', text: 'Synthetic verification result' }] } }))
  const harness = await mountAgentLoopTestHarness(ctx)
  const agent = await harness.create(SessionId('phase093-shadow'), { provider, model: 'offline' }, { cwd: workspaceRoot })
  const session = acmi.dshRuntimeIdentity(agent.session.header, workspaceId)
  for (const [i, taskId] of [taskA, taskB].entries()) {
    for (const [n, change] of [{ kind: 'task-opened', objective: i ? 'Valve startup' : 'Pump rehearsal', criteria: ['Synthetic verification'] },
      { kind: 'node-added', nodeId: 'main', title: 'Main work', role: 'work' },
      { kind: 'work-transitioned', nodeId: 'main', state: 'ready' },
      { kind: 'work-transitioned', nodeId: 'main', state: 'running' }, { kind: 'mainline-advanced', nodeId: 'main' }].entries()) {
      store.append(writer, taskId, { change, key: `seed:${n}`,
        source: { session: { ...session, adapterId: 'acmi-host' }, localSeq: n, sourceRevision: 'synthetic-bootstrap' } })
    }
  }
  ingestion = await acmi.registerDshRuntimeIngestion(ctx, { enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION,
    workspaceRoot, journalRoot, compression: 'none', store, scope, writer })
  ingestion.attach(agent.session, { taskId: taskA, nodeId: 'main' })
  await ingestion.reconcile(agent.session)
  appendPluginRecord(agent.session, 'plugin:acmi-probe/task-binding', { sessionId: agent.session.id, taskId: taskA, revision: 1 })
  const fixture = { sourceRevision: 1, candidateRevision: 1, authorizationEpoch: 1, policyVersion: 'shadow-test-v1' }
  const catalog = ({ cut }) => ({ revision: fixture.candidateRevision, candidates: [taskA, taskB].map((id, i) => ({
    taskId: id, workspaceId, catalogRevision: cut.candidateRevision, revision: store.read(scope, id).snapshot.through,
    status: 'open', objective: i ? 'Valve startup' : 'Pump rehearsal', lastActivity: i + 1,
    reason: i ? 'lexical' : 'binding', activeWorkNode: 'main',
  })) })
  const options = { enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION, store, authority: read, scope,
    authorize: ref => ref.sessionId === session.sessionId && ref.incarnation === session.incarnation,
    permitsTask: (_scope, id) => id === taskA || id === taskB, readEpochs: () => ({ ...fixture }), catalog }
  const send = async (text, fromCursor = -1) => {
    const accepted = []
    const stop = ctx.on('session/event', (s, e) => { if (s === agent.session) accepted.push(e) })
    try {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
      await agent.whenIdle()
      await ingestion.drain(agent.session)
      await ctx.sessions.flush(agent.session)
      const start = accepted.find(e => e.type === 'turn/start')
      const message = accepted.find(e => e.type === 'user/message' && e.data.source.kind === 'user')
      const completion = accepted.findLast(e => e.type === 'turn/end' && e.data.reason.kind === 'completed')
      expect(start && message && completion).toBeTruthy()
      return { session, cursor: store.cursor(scope, session).next - 1, fromCursor,
        observation: { kind: 'completed_user', start, message, completion },
        factCursors: accepted.filter(e => ['tool/call', 'tool/result'].includes(e.type)).map(e => e.seq) }
    } finally { stop() }
  }
  const files = async root => {
    const names = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile())
      .map(e => relative(root, join(e.parentPath, e.name)).split(sep).join('/')).sort()
    return Promise.all(names.map(async name => ({ name, sha256: sha(await readFile(join(root, name))) })))
  }
  const snapshot = async () => ({ journalFiles: await files(journalRoot), graphFiles: await files(graphRoot),
    graphCutSha256: sha(JSON.stringify([taskA, taskB].map(id => store.read(scope, id)))),
    binding: store.cursor(scope, session).bindingRevision, bindingTaskId: store.cursor(scope, session).taskId,
    graphReplayed: store.metrics().replayed, proposalCounts: [taskA, taskB].map(id => store.listUnderstanding(scope, id).length),
    journalSeq: agent.session.seq, adapterCalls: offline.calls })
  const metadata = async (modulo, fromCursor = -1) => {
    do { appendPluginRecord(agent.session, 'plugin:acmi-probe/phase093-metadata', { synthetic: true }) }
    while ((agent.session.seq - 1) % 8 !== modulo)
    await ingestion.drain(agent.session)
    await ctx.sessions.flush(agent.session)
    const cursor = store.cursor(scope, session).next - 1
    return { session, cursor, fromCursor, observation: { kind: 'host_event', eventKind: 'metadata', id: `metadata-${cursor}` } }
  }
  return { options, fixture, send, snapshot, metadata, session, agent, store, ingestion, read, scope, catalog }
}

function witness(snapshot) {
  const { journalFiles, graphFiles, ...metrics } = snapshot
  const files = xs => xs.map(({ name, sha256 }) => ({ file: basename(name), sha256 }))
  return { ...metrics, inventorySha256: sha(JSON.stringify([journalFiles.map(x => x.name), graphFiles.map(x => x.name)])),
    journalFiles: files(journalFiles), graphFiles: files(graphFiles) }
}

test('stock dsh completed turn reaches layered observation without Journal, Graph, Binding or Proposal writes', async t => {
  const f = await boot(t)
  try {
    const input = await f.send('Refine objective: reduce vibration during rehearsal')
    const before = await f.snapshot()
    expect(before.journalFiles.some(x => x.name.endsWith('.jsonl'))).toBe(true)
    expect(before.graphFiles.length).toBeGreaterThan(0)
    expect(before.binding).toBe(1)
    const socket = vi.spyOn(Socket.prototype, 'connect')
    const fetch = vi.spyOn(globalThis, 'fetch')
    const disabled = createDshLayeredShadow({ ...f.options, enabled: undefined, readEpochs: () => { throw new Error('disabled touched host') } })
    expect((await disabled.observe(input)).status).toBe('disabled')
    const shadow = createDshLayeredShadow(f.options)
    const first = await shadow.observe(input)
    expect(first).toMatchObject({ status: 'evaluated', value: { actor: 'user', work: 'analyze', providerRequests: 0 } })
    expect(first.value.metrics).toMatchObject({ candidates: 2, facts: 2, draftCount: 1 })
    expect(first.value.result.graph).toMatchObject({ status: 'draft', claims: [{ kind: 'objective-refined' }] })
    expect(first.value.result.interpretation.authorization).toBe('no_operation')
    expect(first.value.metrics.inputBytes).toBeGreaterThan(0)
    expect(first.value.metrics.estimatedTokens).toBeGreaterThan(0)
    expect((await shadow.observe(input)).status).toBe('duplicate')
    expect((await shadow.observe({ ...input, session: { ...f.session, instanceId: 'foreign' } })).status).toBe('unavailable')
    expect((await shadow.observe({ ...input, observation: { ...input.observation,
      message: { ...input.observation.message, seq: 0 } } })).status).toBe('unavailable')
    const after = await f.snapshot()
    expect(after).toEqual(before)
    const nextInput = await f.send('Do not change the objective. Thanks.', input.cursor)
    const nextBefore = await f.snapshot()
    const next = await shadow.observe(nextInput)
    expect(next).toMatchObject({ status: 'evaluated', invalidations: ['graph_changed'], value: { actor: 'user', work: 'analyze' } })
    expect(next.value.metrics.draftCount).toBe(0)
    const nextAfter = await f.snapshot()
    expect(nextAfter).toEqual(nextBefore)
    expect(socket).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    console.log('ACMI093_LAYERED_SHADOW ' + JSON.stringify({ mode: built ? 'Built' : 'Source', runtimeVersion: acmi.DSH_VERSION,
      before: witness(before), after: witness(after), nextBefore: witness(nextBefore), nextAfter: witness(nextAfter),
      providerRequests: 0, socketConnects: socket.mock.calls.length, fetches: fetch.mock.calls.length,
      offlineFixtureCallsDuringShadow: 0, first: first.value.metrics, next: next.value.metrics, nextInvalidations: next.invalidations }))
  } finally { f.ingestion.dispose(); f.store.close() }
}, 10000)

test('shadow fences current cut and authorization across async reads; cancelled calls do not commit', async t => {
  const f = await boot(t)
  try {
    const input = await f.send('Proceed with Pump rehearsal.')
    const abort = new AbortController()
    let hold = true
    const gate = Promise.withResolvers()
    const entered = Promise.withResolvers()
    const shadow = createDshLayeredShadow({ ...f.options, deadlineMs: 5000, catalog: async p => {
      if (hold) { entered.resolve(); await gate.promise }
      return f.catalog(p)
    } })
    const first = shadow.observe(input, abort.signal)
    await entered.promise
    expect((await shadow.observe(input)).status).toBe('busy_session')
    abort.abort()
    expect((await first).status).toBe('cancelled')
    expect(shadow.metrics().inFlight).toBe(1)
    hold = false
    gate.resolve()
    await vi.waitFor(() => expect(shadow.metrics().inFlight).toBe(0))
    expect((await shadow.observe(input)).status).toBe('evaluated')
    const next = await f.send('Continue Pump rehearsal.', input.cursor)
    const stale = createDshLayeredShadow({ ...f.options, catalog: p => {
      const data = f.catalog(p)
      f.fixture.authorizationEpoch++
      return data
    } })
    expect((await stale.observe(next)).status).toBe('stale')
    const revoked = createDshLayeredShadow({ ...f.options, catalog: p => { const data = f.catalog(p); f.read.revoke(f.scope); return data } })
    expect((await revoked.observe(next)).status).toBe('stale')
    shadow.close()
    expect((await shadow.observe(next)).status).toBe('cancelled')
  } finally { f.ingestion.dispose(); f.store.close() }
}, 10000)

test('only Host metadata can skip and sampled metadata has an ungated comparator', async t => {
  const f = await boot(t)
  try {
    const gated = createDshLayeredShadow(f.options)
    const ungated = createDshLayeredShadow({ ...f.options, trigger: 'ungated' })
    const first = await f.metadata(7)
    const before = await f.snapshot()
    expect((await gated.observe(first)).status).toBe('skipped')
    expect((await ungated.observe(first)).value.work).toBe('analyze')
    expect(await f.snapshot()).toEqual(before)
    const sampled = await f.metadata(0, first.cursor)
    expect(await gated.observe(sampled)).toMatchObject({ status: 'evaluated', invalidations: [], value: { work: 'sample_metadata' } })
  } finally { f.ingestion.dispose(); f.store.close() }
}, 10000)
