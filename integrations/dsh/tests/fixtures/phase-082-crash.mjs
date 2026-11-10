import { readFileSync, writeSync } from 'node:fs'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagent from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../../dist/index.js') : await import('../../src/index.ts')
const { options, root, workspaceId, mode, id, request } = JSON.parse(readFileSync(0, 'utf8'))
const read = createScopeAuthority()
const write = createScopeAuthority()
const scope = read.grant(workspaceId)
const writer = write.grant(workspaceId)
const store = acmi.openGraphStore({ root, workspaceId, read, write })
const ctx = new Context()
await mountAgentLoopTestDependencies(ctx, { workingDirectory: mode === 'child-open' })
await ctx.plugin(Jsonl, { root: options.journalRoot, compression: 'none' })
await ctx.plugin(TokenMeter)
const provider = 'crash-local'
const entered = Promise.withResolvers()
class Adapter extends LlmAdapter {
  async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 200_000 } } }
  async *stream() {
    if (mode === 'child-open') {
      entered.resolve()
      await new Promise(() => {})
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
ctx.llm.registerAdapter([provider], new Adapter())
const harness = await mountAgentLoopTestHarness(ctx)
const agent = await harness.create(SessionId(id), { provider, model: 'fixture' }, { cwd: options.workspaceRoot })
const session = agent.session
const identity = acmi.dshRuntimeIdentity(session.header, workspaceId)
if (mode === 'child-open') {
  await ctx.plugin(Subagent)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  const activation = await ctx.subagents.startActivation({
    provider: 'spawn', label: 'Synthetic crash child', request: {
      parent: agent, prompt: [{ type: 'text', text: 'No native turn/end before process exit' }],
    }, signal: AbortSignal.timeout(3000), delivery: 'caller',
  })
  await Promise.race([entered.promise, activation.result.then(() => { throw Error('Child unexpectedly settled') })])
  const child = ctx.agents.get(activation.childId)
  if (!await ctx.sessions.flush(session) || !await ctx.sessions.flush(child.session)) throw Error('Native flush failed')
  writeSync(1, JSON.stringify({ parent: identity, child: acmi.dshRuntimeIdentity(child.session.header, workspaceId) }))
  process.exit(82)
}
if (mode === 'snapshot') {
  const runtimeOptions = { ...options, store, scope, writer }
  const changes = [
    { kind: 'task-opened', objective: 'Cross process snapshot objective', criteria: ['Fresh isolation'] },
    { kind: 'node-added', nodeId: 'main', title: 'Main', role: 'work' },
    { kind: 'mainline-advanced', nodeId: 'main' },
  ]
  for (const [i, change] of changes.entries()) store.append(writer, request.taskId, { key: 'seed-' + i, change,
    source: { session: { ...identity, adapterId: 'acmi-host' }, localSeq: i, sourceRevision: 'host-fixture' } })
  const guard = acmi.registerDshSnapshotGuard(ctx, runtimeOptions)
  const recovery = await acmi.registerPersistentDshRecovery(ctx, agent, { ...runtimeOptions, request, governance: guard, ttlMs: 60_000 })
  if (await recovery.prepare() !== 'ok') throw Error('Could not reserve snapshot')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Prepare durable witness' }] }))
  await agent.whenIdle()
  if (!await ctx.sessions.flush(session)) throw Error('Native flush failed')
  writeSync(1, JSON.stringify({ packageHash: recovery.snapshot().packageHash }))
  process.exit(82)
}
let ingestion
if (mode !== 'before-drain') {
  ingestion = await acmi.registerDshRuntimeIngestion(ctx, { ...options, store, scope, writer })
  ingestion.attach(session)
  await ingestion.reconcile(session)
}
for (let i = 0; i < 5; i++) appendPluginRecord(session, 'plugin:acmi-probe/crash', { i })
if (!await ctx.sessions.flush(session)) throw Error('Native persistence barrier failed')
const checkpoint = store.cursor(scope, identity).next
if (mode === 'after-commit-before-ack') {
  const event = session.snapshotEvents()[checkpoint]
  const fact = acmi.normalizeDshRuntimeFact(session.header, event, workspaceId, 0)
  if (store.ingest(writer, fact, session.inheritedEventCount).status !== 'committed') throw Error('Missing graph commit')
}
// Record only the oracle, not a Supervisor ACK. No finally/close/fiber disposal executes.
writeSync(1, JSON.stringify({ head: session.seq, checkpoint, cursor: store.cursor(scope, identity).next, identity }))
process.exit(82)
