import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { packet } from '../../../../scripts/phase-0.9.10/wire.mjs'

const digest = s => createHash('sha256').update(s).digest('hex')
const token = p => p + '_' + randomBytes(8).toString('hex')
const provider = 'acmi-phase0910-loopback'
const text = s => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: s }] })
const body = m => m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
const files = async root => {
  const entries = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name)).sort()
  return Promise.all(entries.map(async p => [relative(root, p), digest(await readFile(p))]))
}
const armSidecarPattern = /"acmi_attribution"|"source_user_turn_ref"|"generation_ref"|[hw]_[0-9a-f]{8}|[gu]_[0-9a-f]{16}/iu

export async function createInlineNativeHost(acmi, protocol, base, infer, { model, catalogs, terminalTools = true } = {}) {
  const [workspaceRoot, journal, graph, home, agents] = ['workspace', 'journal', 'graph', 'home', 'agents'].map(p => join(base, p))
  for (const dir of [workspaceRoot, journal, graph, home, agents]) await mkdir(dir)
  const saved = [process.env.DSH_HOME, process.env.DSH_AGENTS_HOME]
  const restore = () => {
    for (const [i, key] of ['DSH_HOME', 'DSH_AGENTS_HOME'].entries()) {
      if (saved[i] === undefined) delete process.env[key]
      else process.env[key] = saved[i]
    }
  }
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = agents
  const ctx = new Context()
  const routes = new Map(), sessions = new Map()
  const ledger = new protocol.CausalAttribution()
  const graphBefore = await files(graph)
  let harness

  function hostCut(entry, generation, turnRef) {
    const { workspace, tasks } = catalogs.get(entry.id)
    return { workspace, revision: 1, generation, turnRef, current: entry.text, prior: entry.prior,
      binding: entry.binding, toolAvailable: entry.toolAvailable,
      candidates: entry.candidates.map(c => {
        const entity = tasks[c.task]
        assert(entity && entity.workHandle === c.work, 'Host catalog identity missing')
        return { handle: c.task, workHandle: c.work, workspace, revision: 1,
          taskId: entity.taskId, workId: entity.workId }
      }) }
  }
  function buildPacket(entry, arm, cut, answer) {
    const projected = { ...entry, candidates: entry.candidates.map(({ task, work, objective, status }) => ({ task, work, objective, status })) }
    const p = packet(projected, arm, cut.generation, cut.turnRef, answer)
    assert(!JSON.stringify(p).includes(cut.workspace) && cut.candidates.every(c => !JSON.stringify(p).includes(c.taskId)
      && !JSON.stringify(p).includes(c.workId)), 'Private identity entered model input')
    return p
  }
  class Adapter extends LlmAdapter {
    async resolveModel(p, m) { return { provider: p, id: m, name: m, context: { contextWindow: 2048 } } }
    async *stream(options) {
      const route = routes.get(options.sessionId)
      assert(route && options.provider === provider && options.model === model, 'Unapproved model route')
      try {
        const { entry, arm, agent, group } = route
        const n = ++route.calls
        assert(n <= (terminalTools ? 1 : 2), 'Unexpected native continuation')
        const user = options.messages.findLast(m => m.role === 'user' && m.source?.kind === 'user')
        const recorded = agent.session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data.source.kind === 'user')
        assert(user && recorded && user.id === recorded.data.id && body(user) === entry.text, 'Native source user mismatch')
        if (n === 1) route.source = { seq: recorded.seq, id: recorded.data.id, ref: token('u') }
        const routeEntry = n === 1 ? entry : { ...entry, toolAvailable: false }
        assert(!entry.toolAvailable || options.tools?.some(t => t.name === 'lookup'), 'Native lookup was not admitted')
        const cut = hostCut(routeEntry, token('g'), route.source.ref)
        const p = buildPacket(routeEntry, arm, cut)
        const receipt = await infer(p, { group, id: entry.id, arm, generation: cut.generation }, options.signal)
        const step = { generation: cut.generation, requestDigest: digest(JSON.stringify(p)), ...receipt, error: null }
        route.steps.push(step)
        let decoded
        try { decoded = protocol.decodeInline(receipt.raw, receipt.stop, arm, cut) }
        catch (e) { step.error = e.message; throw new Error('INLINE_COMPLETION_WITHHELD') }
        step.answer = decoded.answer
        step.proposal = decoded.proposal
        step.inherited = decoded.inherited
        step.actions = decoded.actions.map(a => ({ ...a, callId: token('call') }))
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: step.answer }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: step.answer } }
        for (const [i, action] of step.actions.entries()) {
          yield { type: 'block-start', index: i + 1, blockType: 'tool-call' }
          yield { type: 'block-end', index: i + 1, block: { type: 'tool-call', id: ToolCallId(action.callId),
            name: 'lookup', arguments: JSON.stringify({ key: action.key }) } }
        }
        yield { type: 'usage', usage: receipt.usage }
        yield { type: 'finish', reason: { kind: step.actions.length ? 'tool-calls' : 'stop' } }
      } catch (e) {
        route.error = e.message
        throw new Error('INLINE_ADAPTER_STOP')
      }
    }
  }
  try {
    await acmi.createStorageIsolationMarker(journal, workspaceRoot, 'none')
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: false, systemPrompt: { includeHarnessIdentity: false } })
    await ctx.plugin(Jsonl, { root: journal, compression: 'none' })
    ctx.llm.registerAdapter([provider], new Adapter())
    ctx.tools.register(defineContentToolFixture({
      name: 'lookup', description: 'Read-only synthetic amber/indigo lookup.',
      parameters: { key: { type: 'string', required: true, enum: ['amber', 'indigo'] } },
      async execute({ key }, exec) {
        assert(key === 'amber' || key === 'indigo', 'Synthetic key fence')
        if (terminalTools) exec.concludeTurn()
        return [{ type: 'text', text: key === 'amber' ? 'amber=17' : 'indigo=29' }]
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
    const step = route.steps.find(s => s.actions?.some(a => a.callId === event.data.callId))
    const a = step?.actions.find(a => a.callId === event.data.callId)
    if (!a || event.data.name !== 'lookup' || event.data.arguments !== JSON.stringify({ key: a.key })) return
    ledger.recordCall({ workspace: catalogs.get(route.entry.id).workspace, session: session.id,
      callId: a.callId, generation: step.generation, ref: a.ref, task: a.task, work: a.work,
      execution: session.id + ':' + event.data.turn, causation: session.id + ':' + event.seq })
  }, { global: true })

  async function run(entry, arm, group, isolated = false) {
    const id = SessionId([entry.session, arm, isolated ? entry.id.replace(':', '-') : 'native'].join('-'))
    if (!sessions.has(id)) sessions.set(id, await harness.create(id, { provider, model }, { cwd: workspaceRoot }))
    const agent = sessions.get(id)
    const offset = agent.session.snapshotEvents().length
    const before = (await files(journal)).filter(([path]) => !path.split(/[\\/]/u).includes(id))
    const route = { entry, arm, group, agent, calls: 0, steps: [], error: null, source: null }
    routes.set(id, route)
    const started = performance.now()
    try {
      agent.followup(text(entry.text))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
      const events = agent.session.snapshotEvents().slice(offset)
      const output = events.filter(e => e.type === 'assistant/message')
      const toolCalls = events.filter(e => e.type === 'tool/call')
      const toolResults = events.filter(e => e.type === 'tool/result')
      const end = events.findLast(e => e.type === 'turn/end')
      const correlated = toolResults.map(e => {
        const callId = e.data.message.toolCallId
        return { seq: e.seq, callId, text: body(e.data.message), isError: Boolean(e.data.message.isError),
          inherits: ledger.result({ workspace: catalogs.get(entry.id).workspace, session: id, callId }) }
      })
      const native = {
        session: id, user: route.source, end: end?.data.reason.kind ?? null, endSeq: end?.seq ?? null,
        assistant: output.map(e => ({ seq: e.seq, text: body(e.data.message), usage: e.data.usage,
          calls: e.data.message.content.filter(b => b.type === 'tool-call').map(b => b.id) })),
        calls: toolCalls.map(e => ({ seq: e.seq, ...e.data })), results: correlated,
      }
      const after = await files(journal)
      const owned = after.filter(([path]) => path.split(/[\\/]/u).includes(id))
      const journalText = (await Promise.all(owned.map(([p]) => readFile(join(journal, p), 'utf8')))).join('\n')
      const leak = armSidecarPattern.test(JSON.stringify(events.filter(e => e.type !== 'user/message')))
        || armSidecarPattern.test(journalText.replaceAll('using handle h_deadbeef', 'synthetic user reference'))
      const unchanged = { graph: JSON.stringify(graphBefore) === JSON.stringify(await files(graph)),
        otherJournals: JSON.stringify(before) === JSON.stringify(after.filter(([path]) => !path.split(/[\\/]/u).includes(id))),
        binding: !events.some(e => e.type.startsWith('plugin:acmi') || JSON.stringify(e.data).includes('plugin:acmi-probe/task-binding')) }
      assert(owned.length === 1 && !leak && Object.values(unchanged).every(Boolean), 'Native journal or authority fence')
      assert(output.length === route.steps.filter(s => !s.error).length, 'Unexpected native assistant count')
      for (const [i, e] of native.assistant.entries()) {
        const s = route.steps.filter(s => !s.error)[i]
        assert.deepEqual([e.text, e.usage, e.calls], [s.answer, s.usage, s.actions.map(a => a.callId)])
      }
      return { id: entry.id, group, arm, calls: route.calls, steps: route.steps, native, unchanged,
        journalDigest: owned[0][1], metadataLeak: leak, error: route.error, latencyMs: Math.round(performance.now() - started) }
    } finally { routes.delete(id) }
  }
  async function control(entry, record, signal) {
    const answer = record.native.assistant.at(-1)?.text
    assert(answer && record.native.user, 'Missing post-hoc input answer')
    const cut = hostCut(entry, token('g'), record.native.user.ref)
    const p = buildPacket(entry, 'C', cut, answer)
    const receipt = await infer(p, { group: 'control', id: entry.id, arm: 'C', generation: cut.generation }, signal)
    const step = { ...receipt, generation: cut.generation, requestDigest: digest(JSON.stringify(p)), error: null }
    try { step.proposal = protocol.decodeInline(receipt.raw, receipt.stop, 'C', cut).proposal }
    catch (e) { step.error = e.message }
    return step
  }
  return { run, control, async close() { try { off(); await ctx.fiber.dispose() } finally { restore() } } }
}
