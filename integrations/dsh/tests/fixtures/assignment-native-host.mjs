import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { hash, wire } from '../../../../scripts/phase-0.9.11/design.mjs'

const provider = 'acmi-phase0911-loopback'
const ticketId = p => p + '_' + randomBytes(8).toString('hex')
const body = message => message.content.filter(x => x.type === 'text').map(x => x.text).join('\n')
const snapshot = async root => {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name)).sort()
  return Promise.all(files.map(async f => [f, hash(await readFile(f))]))
}

export async function assignmentHost(acmi, splitAssignment, CausalAttribution, root, infer, model, { buildPacket = wire, gateOperations } = {}) {
  const [work, journal, graph, home, agents] = ['workspace', 'journal', 'graph', 'home', 'agents'].map(p => join(root, p))
  for (const dir of [work, journal, graph, home, agents]) await mkdir(dir)
  const keys = ['DSH_HOME', 'DSH_AGENTS_HOME']
  const old = keys.map(k => process.env[k])
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = agents
  const restore = () => keys.forEach((k, i) => old[i] === undefined ? delete process.env[k] : process.env[k] = old[i])
  const ctx = new Context()
  const routes = new Map(), sessions = new Map(), origins = new CausalAttribution()
  let harness
  class Adapter extends LlmAdapter {
    async resolveModel(p, m) { return { provider: p, id: m, name: m, context: { contextWindow: 2048 } } }
    async *stream(options) {
      const route = routes.get(options.sessionId)
      assert(route && options.provider === provider && options.model === model, 'Unauthorized adapter route')
      try {
        const { entry, agent, catalog } = route
        const n = route.steps.length
        assert(++route.adapterCalls === n + 1 && n <= Number(entry.toolAvailable), 'Native step budget')
        const user = options.messages.findLast(x => x.role === 'user' && x.source?.kind === 'user')
        const logged = agent.session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data.source.kind === 'user')
        assert(user && logged && user.id === logged.data.id && body(user) === entry.text, 'Native user mismatch')
        route.user = { id: user.id, seq: logged.seq }
        const toolResults = n ? options.messages.filter(m => m.role === 'tool'
          && route.steps[0].actions.some(a => a.callId === m.toolCallId)).map(m => body(m)) : null
        if (n) assert(toolResults.length === route.steps[0].actions.length, 'Native tool result context mismatch')
        const toolAvailable = entry.toolAvailable && !n
        if (toolAvailable) assert(options.tools?.some(x => x.name === 'lookup'), 'Native tool not admitted')
        const source = { sessionId: options.sessionId, nativeUserId: user.id, sourceUserSeq: logged.seq }
        const packet = buildPacket(entry, toolResults, source)
        const packetText = JSON.stringify(packet)
        assert(!packetText.includes(catalog.workspace) && Object.values(catalog.links).every(l =>
          !packetText.includes(l.taskId) && (!l.workId || !packetText.includes(l.workId))), 'Host UUID in model packet')
        const generation = ticketId('g')
        const received = await infer(packet, { group: 'pilot', id: entry.id, arm: entry.arm ?? 'B', generation }, options.signal)
        const step = { ...received, generation, sourceUserSeq: logged.seq, requestDigest: hash(packetText),
          actions: [], decoded: null, withheld: null }
        route.steps.push(step)
        try { step.decoded = splitAssignment(received.raw, received.stop, { links: catalog.links, toolAvailable, arm: entry.arm }) }
        catch (e) { step.withheld = e.message; throw new Error('ASSIGNMENT_FRAME_WITHHELD') }
        const all = step.decoded.operations
        const admitted = gateOperations ? gateOperations(all, { ...source, entry, catalog, generation }) : all
        assert(Array.isArray(admitted) && new Set(admitted).size === admitted.length
          && admitted.every(action => all.includes(action)), 'Invalid operation gate')
        step.actions = admitted.map(a => ({ ...a, callId: ticketId('call') }))
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: step.decoded.answer }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: step.decoded.answer } }
        for (const [i, a] of step.actions.entries()) {
          yield { type: 'block-start', index: i + 1, blockType: 'tool-call' }
          yield { type: 'block-end', index: i + 1, block: { type: 'tool-call', id: ToolCallId(a.callId),
            name: 'lookup', arguments: JSON.stringify({ key: a.key }) } }
        }
        yield { type: 'usage', usage: received.usage }
        yield { type: 'finish', reason: { kind: step.actions.length ? 'tool-calls' : 'stop' } }
      } catch (e) {
        route.error = e.message
        throw new Error('ACMI_ASSIGNMENT_ADAPTER_STOP')
      }
    }
  }
  try {
    await acmi.createStorageIsolationMarker(journal, work, 'none')
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: false, systemPrompt: { includeHarnessIdentity: false } })
    await ctx.plugin(Jsonl, { root: journal, compression: 'none' })
    ctx.llm.registerAdapter([provider], new Adapter())
    ctx.tools.register(defineContentToolFixture({ name: 'lookup', description: 'Read a synthetic value by key.',
      parameters: { key: { type: 'string', required: true, enum: ['amber', 'indigo'] } },
      isConcurrencySafe: () => true,
      async execute({ key }, exec) {
        const route = routes.get(exec.agent?.session.id)
        assert(route && route.entry.toolAvailable && (key === 'amber' || key === 'indigo'), 'Tool safety boundary')
        const [first, second] = route.steps[0].actions
        const active = route.steps[0].actions.find(x => x.callId === exec.callId)
        assert(active?.key === key, 'Unexpected native execution')
        if (second && first.callId === exec.callId && !route.secondFinished) {
          await once(route.gate, 'second', { signal: AbortSignal.any([exec.signal, AbortSignal.timeout(5000)]) })
        }
        const value = key === 'amber' ? 'amber=17' : 'indigo=29'
        const inherited = origins.result({ workspace: route.catalog.workspace, session: exec.agent.session.id, callId: exec.callId })
        route.arrivals.push({ callId: exec.callId, key, value, inherited })
        if (second?.callId === exec.callId) {
          route.secondFinished = true
          setImmediate(() => route.gate.emit('second'))
        }
        return [{ type: 'text', text: value }]
      },
    }), { when: ({ agent }) => routes.get(agent.session.id)?.entry.toolAvailable === true })
    harness = await mountAgentLoopTestHarness(ctx)
  } catch (e) {
    try { await ctx.fiber.dispose() } finally { restore() }
    throw e
  }
  const off = ctx.on('session/event', (session, event) => {
    const route = routes.get(session.id)
    if (!route || event.type !== 'tool/call') return
    const step = route.steps.find(s => s.actions.some(a => a.callId === event.data.callId))
    const a = step?.actions.find(o => o.callId === event.data.callId)
    if (!a || event.data.name !== 'lookup' || event.data.arguments !== JSON.stringify({ key: a.key })) return
    origins.recordCall({ workspace: route.catalog.workspace, session: session.id, callId: a.callId, generation: step.generation,
      ref: a.ref, task: a.assignment.taskId, work: a.assignment.workId,
      execution: session.id + ':' + event.data.turn, causation: session.id + ':' + event.seq })
  }, { global: true })

  async function run(entry, catalog) {
    const key = entry.variant === 'base' ? entry.story : entry.id.replaceAll(':', '-')
    assert(/^[a-z][a-z0-9-]{0,63}$/iu.test(key), 'Invalid synthetic session ID')
    const id = SessionId(key)
    if (!sessions.has(id)) sessions.set(id, await harness.create(id, { provider, model }, { cwd: work }))
    const agent = sessions.get(id)
    const route = { entry, catalog, agent, steps: [], user: null, error: null, arrivals: [], adapterCalls: 0, gate: new EventEmitter() }
    const owns = ([path]) => path.split(/[\\/]/u).includes(id)
    const before = (await snapshot(journal)).filter(x => !owns(x))
    const startIndex = agent.session.snapshotEvents().length
    routes.set(id, route)
    const started = performance.now()
    try {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: entry.text }] }))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
      const events = agent.session.snapshotEvents().slice(startIndex)
      const native = { session: id, user: route.user,
        end: events.findLast(e => e.type === 'turn/end')?.data.reason.kind ?? null,
        assistant: events.filter(e => e.type === 'assistant/message').map(e => ({ seq: e.seq, text: body(e.data.message),
          usage: e.data.usage, ids: e.data.message.content.filter(c => c.type === 'tool-call').map(c => c.id) })),
        calls: events.filter(e => e.type === 'tool/call').map(e => ({ seq: e.seq, ...e.data })),
        results: events.filter(e => e.type === 'tool/result').map(e => ({ seq: e.seq, callId: e.data.message.toolCallId,
          sourceEventSeqs: e.sourceEventSeqs, text: body(e.data.message), isError: Boolean(e.data.message.isError),
          inherited: origins.result({ workspace: catalog.workspace, session: id, callId: e.data.message.toolCallId }) })),
      }
      const after = await snapshot(journal), owned = after.filter(owns)
      assert.equal(owned.length, 1, 'Isolated journal missing')
      const state = await readFile(owned[0][0], 'utf8')
      const leaked = /\bq-[0-9a-f]{5}\b|"assignment_ref"|"generation_ref"|"user_turn"|"replayState"/iu.test(state)
        || route.steps.some(s => state.includes(s.generation))
        || Object.values(catalog.links).some(x => state.includes(x.taskId) || (x.workId && state.includes(x.workId)))
      const unchanged = { graph: (await snapshot(graph)).length === 0,
        binding: !events.some(x => x.type.startsWith('plugin:acmi')),
        otherJournals: JSON.stringify(before) === JSON.stringify(after.filter(x => !owns(x))) }
      const eligible = route.steps.filter(s => s.decoded)
      assert.deepEqual(native.assistant.map(x => [x.text, x.usage, x.ids]),
        eligible.map(s => [s.decoded.answer, s.usage, s.actions.map(a => a.callId)]), 'Unexpected native assistant projection')
      return { id: entry.id, native, steps: route.steps, arrivals: route.arrivals, adapterCalls: route.adapterCalls,
        error: route.error, leaked, unchanged, journalDigest: owned[0][1], latencyMs: Math.round(performance.now() - started) }
    } finally { routes.delete(id) }
  }
  return { run, async close() { try { off(); await ctx.fiber.dispose() } finally { restore() } } }
}
