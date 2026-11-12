import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, pluginRecordOf, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { selectPlaintextJournal } from './plaintext-journal.mjs'

const digest = s => createHash('sha256').update(s).digest('hex')
const provider = 'acmi-dsh-identity-loopback'
const text = s => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: s }] })
const uuid = s => {
  const h = digest(s)
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-')
}

export async function createNativeIdentityHost(acmi, base, transport, { runtimeModel = 'offline-test' } = {}) {
  const root = await realpath(base)
  const [workspaceRoot, journalRoot, graphRoot, home, agents] = ['work', 'journal', 'graph', 'home', 'agents'].map(p => join(root, p))
  for (const folder of [workspaceRoot, journalRoot, graphRoot, home, agents]) await mkdir(folder)
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = agents
  const ctx = new Context()
  const { partitionId: workspaceId } = await acmi.createStorageIsolationMarker(journalRoot, workspaceRoot, 'none')
  const authority = createScopeAuthority(), write = createScopeAuthority()
  const scope = authority.grant(workspaceId), writer = write.grant(workspaceId)
  acmi.provisionGraphRoot(graphRoot, workspaceId)
  const store = acmi.openGraphStore({ root: graphRoot, workspaceId, read: authority, write, understanding: true })
  const routes = new Map()
  let totalNativeCalls = 0
  let transportFailure
  class NativeAdapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 2048 } } }
    async *stream(options) {
      totalNativeCalls++
      try {
        const route = routes.get(options.sessionId)
        assert(route && ++route.calls === 1, 'unexpected dsh model call')
        assert.equal(options.provider, provider)
        assert.equal(options.model, runtimeModel)
        assert.equal(options.tools?.length ?? 0, 0)
        const current = options.messages.findLast(m => m.role === 'user')
        assert(current && current.content.every(b => b.type === 'text'))
        const received = current.content.map(b => b.text).join('\n')
        const request = await route.bridge.prepare(options.sessionId, received)
        assert(request, 'native request did not have an authorized ACMI projection')
        route.request = request
        const reply = await transport(request, options.signal)
        const raw = typeof reply === 'string' ? reply : reply.raw
        assert(typeof raw === 'string')
        route.reply = raw
        route.finish = typeof reply !== 'string' && reply.stopType === 'limit' ? 'max-tokens' : 'stop'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: raw } }
        yield { type: 'finish', reason: { kind: route.finish } }
      } catch (error) {
        transportFailure = error
        throw error
      }
    }
  }
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: false, systemPrompt: { includeHarnessIdentity: false } })
  await ctx.plugin(Jsonl, { root: journalRoot, compression: 'none' })
  ctx.llm.registerAdapter([provider], new NativeAdapter())
  const harness = await mountAgentLoopTestHarness(ctx)
  const fresh = name => harness.create(SessionId(name), { provider, model: runtimeModel }, { cwd: workspaceRoot })
  const baseOptions = { enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION, workspaceRoot, journalRoot,
    authority, scope, compression: 'none' }
  const seeded = new Map()
  async function seed(story) {
    if (seeded.has(story.id)) return seeded.get(story.id)
    const old = await fresh(story.id + '-past')
    const taskIds = story.titles.map((_, i) => uuid(story.id + '-' + i))
    const session = acmi.dshRuntimeIdentity(old.session.header, workspaceId)
    for (const [i, taskId] of taskIds.entries()) {
      store.append(writer, taskId, { change: { kind: 'task-opened', objective: story.titles[i], criteria: ['isolated fixture'] },
        key: 'seed', source: { session: { ...session, adapterId: 'acmi-host' }, localSeq: i, sourceRevision: 'fixture' } })
      assert(store.read(scope, taskId))
    }
    old.session.append('turn/start', { turn: 1 })
    const source = old.session.append('user/message', text(story.prior), { surfaceOp: 'append' })
    old.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(old.session)
    const state = { taskIds, prior: { session: old.session, seq: source.seq } }
    seeded.set(story.id, state)
    return state
  }
  async function files(dir, sessionId) {
    const names = (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile())
      .map(e => relative(dir, join(e.parentPath, e.name))).filter(n => !sessionId || n.split(sep).includes(sessionId)).sort()
    return Promise.all(names.map(async n => [n, digest(await readFile(join(dir, n)))]))
  }
  const bindings = session => session.snapshotEvents().map(pluginRecordOf).filter(e => e?.type === 'plugin:acmi-probe/task-binding')
  async function runCase(story, mode, overrides = {}) {
    const state = await seed(story)
    const agent = await fresh(story.id + '-' + mode)
    appendPluginRecord(agent.session, 'plugin:acmi-probe/task-binding', { sessionId: agent.session.id, taskId: state.taskIds[0], revision: 1 })
    await ctx.sessions.flush(agent.session)
    const catalog = () => ({ authorizationEpoch: 1, graphRevision: 1, candidateRevision: 1, complete: true,
      candidates: state.taskIds.map((taskId, i) => {
        const cut = store.peek(scope, taskId)
        assert(cut?.snapshot.task)
        return { taskId, workspaceId, catalogRevision: 1, revision: cut.snapshot.through,
          status: cut.snapshot.task.closed ? 'closed' : 'open', objective: cut.snapshot.task.objective,
          aliases: story.aliases?.[i] ?? [], lastActivity: 2 - i, reason: 'lexical' }
      }) })
    const bridge = await acmi.registerDshIdentityAdvice(ctx, { ...baseOptions, session: agent.session,
      readCatalog: catalog, permitsTask: (_, id) => state.taskIds.includes(id),
      prior: mode === 'off' ? undefined : state.prior, permitsPrior: () => !story.denied, ...overrides })
    const capture = async () => ({ graph: (await files(graphRoot)).map(([, sha]) => sha),
      historical: (await files(journalRoot, state.prior.session.id)).map(([, sha]) => sha),
      bindings: digest(JSON.stringify(bindings(agent.session))),
      proposals: state.taskIds.map(id => store.listUnderstanding(scope, id).length) })
    const before = await capture()
    assert(before.historical.length > 0 && before.graph.length > 0)
    if (!bridge) return { status: 'disabled', calls: 0 }
    const route = { calls: 0, bridge }
    routes.set(agent.session.id, route)
    try {
      agent.followup(text(story.focus))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
      if (transportFailure) throw transportFailure
      const review = await bridge.review()
      const events = agent.session.snapshotEvents()
      const native = events.filter(e => e.type === 'assistant/message')
      const end = events.findLast(e => e.type === 'turn/end')
      const user = events.filter(e => e.type === 'user/message' && e.data.source.kind === 'user')
      const [, journalDigest] = selectPlaintextJournal(await files(journalRoot, agent.session.id))
      const after = await capture()
      assert.equal(user.length, 1)
      assert.equal(events.filter(e => e.type === 'user/message').length, 1, 'identity sidecar leaked into Journal user context')
      assert.equal(native.length, 1)
      assert.equal(end?.data.reason.kind, route.finish === 'max-tokens' ? 'max-tokens' : 'completed')
      assert.equal(native[0].data.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n'), route.reply)
      assert.equal(events.filter(e => e.type === 'tool/call' || e.type === 'tool/result').length, 0)
      assert(state.taskIds.every(id => !JSON.stringify(route.request.model).includes(id)), 'private task ID in model view')
      assert.deepEqual(after, before, 'read-only advice changed Graph, historical Journal, Binding or proposal inventory')
      return { status: review.status, review, calls: route.calls, priorVisible: route.request.model.prior !== null,
        focusDigest: digest(story.focus), candidateDigest: digest(JSON.stringify([route.request.model.candidates, route.request.model.binding])),
        requestDigest: route.request.requestDigest, reply: route.reply,
        native: { userSeq: user[0].seq, assistantSeq: native[0].seq, endSeq: end.seq, endKind: end.data.reason.kind, journalDigest },
        unchanged: { graph: digest(JSON.stringify(before.graph)), historical: digest(JSON.stringify(before.historical)),
          binding: before.bindings, proposals: before.proposals }, taskIds: state.taskIds }
    } finally { bridge.dispose(); routes.delete(agent.session.id) }
  }
  return { runCase, calls: () => totalNativeCalls, async close() { store.close(); await ctx.fiber.dispose() } }
}
