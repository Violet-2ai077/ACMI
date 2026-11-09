import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createScopeAuthority, TaskGraph } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, expect, test, vi } from 'vitest'

const entry = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const { createStorageIsolationMarker, DSH_VERSION, registerSyntheticTaskRecovery } = entry
const taskId = '10000000-0000-4000-8000-000000000080'
const hash = value => createHash('sha256').update(value).digest('hex')
const mode = process.env.ACMI_TEST_BUILT === '1' ? 'built' : 'source'
const fixtureText = 'OBJECTIVE-A | NO-NETWORK | DECISION-A | NEXT-A | UNKNOWN-A | VERIFIED-DEPENDENCY-A'
const foreign = 'FOREIGN-TASK-OMEGA'
const textOf = messages => messages.flatMap(m => m.content.flatMap(b => b.type === 'text' ? [b.text] : [])).join('\n')

class ScriptedAdapter extends LlmAdapter {
  summaries = []
  requests = []
  failure = undefined
  toolOnFirst = false
  window = 100_000
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, context: { contextWindow: this.window } }
  }
  async *stream(options) {
    const summary = textOf(options.messages.slice(-1)).includes('acting as a compaction engine')
    if (summary) {
      this.summaries.push(options)
      if (this.failure) throw this.failure
    } else {
      this.requests.push(options)
      if (this.toolOnFirst && this.requests.length === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('work-call'), name: 'work', arguments: '{}' } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
    }
    const input = textOf(options.messages)
    const retained = ['OBJECTIVE-A', foreign].filter(marker => input.includes(marker))
    const text = summary ? 'Scripted whole-Session summary: ' + retained.join(' / ') : 'Synthetic response.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

afterEach(() => vi.unstubAllEnvs())

async function boot(t, { auto = false } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-phase08-dsh-')))
  const workspaceRoot = join(base, 'workspace')
  const journalRoot = join(base, 'journal')
  const home = join(base, 'home')
  const agentsHome = join(base, 'agents')
  const ctx = new Context()
  t.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(base, { recursive: true, force: true }) }
  })
  for (const path of [workspaceRoot, journalRoot, home, agentsHome]) await mkdir(path)
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DSH_AGENTS_HOME', agentsHome)
  const marker = await createStorageIsolationMarker(journalRoot, workspaceRoot, 'none')
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { includeHarnessIdentity: false } })
  await ctx.plugin(Jsonl, { root: journalRoot, compression: 'none' })
  await ctx.plugin(TokenMeter)
  const adapter = new ScriptedAdapter()
  ctx.llm.registerAdapter(['acmi-synthetic'], adapter)
  ctx.tools.register(defineContentToolFixture({
    name: 'work', description: 'Synthetic work', parameters: {},
    async execute() { return [{ type: 'text', text: 'Synthetic tool result' }] },
  }))
  await ctx.plugin(BasicCompaction, { auto, maxTokens: 64, thresholdRatio: 0.5, headroomTokens: 0, retainTokens: 1 })
  const harness = await mountAgentLoopTestHarness(ctx)
  const fresh = id => harness.create(SessionId(id), { provider: 'acmi-synthetic', model: 'fixture' }, { cwd: workspaceRoot })
  const send = async (agent, text) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
    await ctx.sessions.flush(agent.session)
    expect(agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')?.data.reason.kind).toBe('completed')
  }
  return { ctx, adapter, fresh, send, journalRoot, workspaceRoot, partitionId: marker.partitionId }
}

function graphFixture(host, oldSession, accepted = true) {
  const authority = createScopeAuthority()
  const scope = authority.grant(host.partitionId)
  const graph = new TaskGraph({ workspaceId: host.partitionId, taskId, authority, digest: hash })
  const sourceEvents = oldSession.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source.kind === 'user')
  const input = sourceEvents[0]
  const tail = sourceEvents.at(-1)
  const ref = event => ({ session: { adapterId: 'dsh', instanceId: 'isolated', sessionId: oldSession.session.id, incarnation: 'fixture' },
    sourceRevision: 'original-cut', localSeq: event.seq })
  const producer = new TaskGraph({ workspaceId: host.partitionId, taskId: '10000000-0000-4000-8000-000000000081', authority, digest: hash })
  const producerChanges = [
    { kind: 'task-opened', objective: 'Dependency producer; not included in A', criteria: ['Publish result'] },
    { kind: 'node-added', nodeId: 'produce', title: 'Produce fixture', role: 'work' },
    { kind: 'work-transitioned', nodeId: 'produce', state: 'ready' },
    { kind: 'work-transitioned', nodeId: 'produce', state: 'running' },
    { kind: 'execution-started', nodeId: 'produce', executionId: 'producer', agentId: 'worker' },
    { kind: 'result-produced', nodeId: 'produce', executionId: 'producer', resultId: 'verified', summary: 'VERIFIED-DEPENDENCY-A', verified: true },
    { kind: 'work-transitioned', nodeId: 'produce', state: 'completed' },
  ]
  producerChanges.forEach((change, index) => expect(producer.append(scope, {
    ...change, seq: index + 1, id: `producer-${index + 1}`, source: ref(input),
  })).toBe('applied'))
  const receipt = graph.captureDependency(scope, producer, 'verified')
  const changes = [
    { kind: 'task-opened', objective: 'OBJECTIVE-A', criteria: ['Verified regression'] },
    { kind: 'node-added', nodeId: 'recover', title: 'Verify restored work', role: 'work' },
    { kind: 'mainline-advanced', nodeId: 'recover' },
    { kind: 'work-transitioned', nodeId: 'recover', state: 'ready' },
    { kind: 'work-transitioned', nodeId: 'recover', state: 'running' },
    ...[
      { kind: 'constraint', text: 'NO-NETWORK' },
      { kind: 'decision', state: 'accepted', topic: 'method', text: 'DECISION-A' },
      { kind: 'unresolved', text: 'UNKNOWN-A' },
      { kind: 'next-action', text: 'NEXT-A' },
    ].map(content => ({ kind: 'evidence-recorded', content })),
    { kind: 'dependency-required', nodeId: 'recover', resultId: 'required', receipt },
    ...(accepted ? ['available', 'inspected', 'consumed', 'accepted'] : []).map(stage => ({
      kind: 'result-reviewed', nodeId: 'recover', resultId: 'required', stage,
    })),
  ]
  changes.forEach((change, index) => expect(graph.append(scope, {
    ...change, seq: index + 1, id: `change-${index + 1}`,
    source: ref(index > 6 ? tail : input),
  })).toBe('applied'))
  return { graph, scope, authority }
}

const contexts = agent => agent.session.snapshotEvents()
  .filter(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context')
  .filter(e => textOf([e.data]).includes('ACMI task recovery data'))
const compactEvents = agent => agent.session.snapshotEvents().filter(e => e.type.startsWith('compaction/'))

test.for([true, false])('runs stock Compact and fresh Session recovery (accepted=%s)', async (accepted, t) => {
  const host = await boot(t)
  const { ctx, adapter, fresh, send, journalRoot, workspaceRoot } = host
  const old = await fresh('acmi-shadow-source')
  await send(old, fixtureText + ' Old details. '.repeat(420))
  await send(old, foreign + ' Foreign details. '.repeat(420))
  await send(old, 'Return to A: NEXT-A')
  const { graph, scope } = graphFixture(host, old, accepted)
  const prior = old.session.snapshotEvents()
  const journalBucket = (await readdir(journalRoot, { withFileTypes: true })).find(row => row.isDirectory()).name
  const journalPath = join(journalRoot, journalBucket, old.session.id, 'session.v4.jsonl')
  const bytesBeforeCompact = await readFile(journalPath)
  const signal = AbortSignal.timeout(8000)
  const started = performance.now()
  const compacted = await ctx.compaction.compactNow(old, signal)
  const compactMs = performance.now() - started
  expect(compacted?.summary).toBeDefined()
  const summary = textOf([{ content: compacted.summary }])
  expect(summary).toContain(foreign)
  expect(adapter.summaries).toHaveLength(1)
  expect(compactEvents(old).map(e => e.type)).toEqual(['compaction/start', 'compaction/summary', 'compaction/end'])
  expect(old.session.snapshotEvents().slice(0, prior.length)).toEqual(prior)
  const compactBytes = await readFile(journalPath)
  expect(compactBytes.subarray(0, bytesBeforeCompact.length).equals(bytesBeforeCompact)).toBe(true)
  expect(compactBytes.length).toBeGreaterThan(bytesBeforeCompact.length)
  const journalBefore = hash(compactBytes)

  const next = await fresh('acmi-shadow-recovery')
  const unrelated = await fresh('acmi-shadow-unrelated')
  const request = { taskId, tokenBudget: 10000, policyVersion: 'task-context-v1', includeDependencyResults: true }
  const config = { runtimeVersion: DSH_VERSION, workspaceRoot, journalRoot, compression: 'none', graph, scope, request }
  expect(await registerSyntheticTaskRecovery(ctx, unrelated, config)).toBeNull()
  await send(unrelated, 'Unrelated conversation remains normal.')
  expect(contexts(unrelated)).toHaveLength(0)
  const registration = await registerSyntheticTaskRecovery(ctx, next, { ...config, enabled: true, synthetic: true })
  expect(registration).not.toBeNull()
  const recoveryStarted = performance.now()
  await send(next, 'Continue the explicitly selected task.')
  const recoveryMs = performance.now() - recoveryStarted
  const newRequest = textOf(adapter.requests.at(-1).messages)
  const markers = fixtureText.split(' | ')
  for (const marker of markers) expect(newRequest).toContain(marker)
  expect(newRequest).not.toContain(foreign)
  expect(newRequest).not.toContain('Old details.')
  expect(contexts(next)).toHaveLength(1)
  const observed = registration.lastPackage()
  expect(observed?.taskId).toBe(taskId)
  expect(observed?.activeNodeId).toBe('recover')
  expect(observed?.currentState.work).toBe('running')
  expect(observed.items.find(x => x.kind === (accepted ? 'dependency-result' : 'unreviewed_dependency_output'))
    ?.dependency.stage).toBe(accepted ? 'accepted' : 'produced')
  expect(observed.items.some(x => x.kind === 'dependency-result')).toBe(accepted)
  const firstHash = observed.assembly.deterministicHash
  await send(next, 'Same recovery projection. ' + 'Repeatable synthetic work. '.repeat(460))
  expect(contexts(next)).toHaveLength(1)
  for (let i = 0; i < 2; i++) {
    await ctx.compaction.compactNow(next, signal)
    await send(next, 'After native compact ' + i + ' Tail. '.repeat(700))
    expect(textOf(adapter.requests.at(-1).messages)).toContain(firstHash)
    expect(registration.lastPackage()?.assembly.deterministicHash).toBe(firstHash)
    expect(next.session.deriveMessages().filter(m => m.source?.kind === 'runtime-context'
      && textOf([m]).includes('ACMI task recovery data'))).toHaveLength(1)
  }
  expect(hash(await readFile(journalPath))).toBe(journalBefore)
  expect(next.session.snapshotEvents().some(e => e.type.startsWith('plugin:acmi-probe/'))).toBe(false)
  registration.dispose()
  console.log('ACMI_DSH_WITNESS ' + JSON.stringify({
    mode, accepted, compactMs, recoveryMs, nativeCompactPreservedJournalPrefix: true, sourceJournalUnchangedByRecovery: true,
    runtime: DSH_VERSION, taskId, activeNodeId: observed.activeNodeId, firstHash, repeatedRecoveryChecks: 2,
    baselineFactRetention: markers.filter(m => summary.includes(m)).length, requiredFacts: markers.length,
    recoveredFactRetention: markers.filter(m => newRequest.includes(m)).length, baselineForeign: summary.includes(foreign),
    recoveredForeign: newRequest.includes(foreign), baselineSummaryBytes: Buffer.byteLength(summary),
    packageEstimatedTokens: observed.assembly.estimatedTokens, budget: observed.assembly.tokenBudget,
  }))
}, 15000)

test('falls back on insufficient context budget, and preserves native failure/cancellation behavior', async t => {
  const host = await boot(t)
  const { ctx, adapter, fresh, send, journalRoot, workspaceRoot } = host
  const old = await fresh('fallback-source')
  await send(old, fixtureText + ' Large older history. '.repeat(350))
  const { graph, scope, authority } = graphFixture(host, old)
  const next = await fresh('fallback-target')
  const options = {
    enabled: true, synthetic: true, runtimeVersion: DSH_VERSION, workspaceRoot, journalRoot, compression: 'none', graph, scope,
    request: { taskId, tokenBudget: 32, policyVersion: 'task-context-v1', includeDependencyResults: true },
  }
  expect(await registerSyntheticTaskRecovery(ctx, next, { ...options, scope: authority.grant('another-workspace') })).toBeNull()
  expect(await registerSyntheticTaskRecovery(ctx, next, { ...options, runtimeVersion: '0.2.1-rc.2' })).toBeNull()
  const registration = await registerSyntheticTaskRecovery(ctx, next, options)
  await send(next, 'Baseline prompt only.')
  expect(contexts(next)).toHaveLength(0)
  expect(registration.lastPackage()).toBeNull()
  expect(textOf(adapter.requests.at(-1).messages)).toContain('Baseline prompt only.')
  const controller = new AbortController()
  const cancelled = new Error('synthetic cancellation')
  controller.abort(cancelled)
  expect(() => ctx.compaction.compactNow(old, controller.signal)).toThrow(cancelled)
  expect(compactEvents(old)).toEqual([])
  const before = textOf(old.session.deriveMessages())
  adapter.failure = new Error('synthetic adapter summary failure')
  await expect(ctx.compaction.compactNow(old, AbortSignal.timeout(4000))).rejects.toMatchObject({ code: 'summary' })
  expect(compactEvents(old).map(e => e.type)).toEqual(['compaction/start', 'compaction/end'])
  expect(textOf(old.session.deriveMessages())).toBe(before)
  registration.dispose()
})

test('stock pressure compaction runs before the next request and retains the tool pair', async t => {
  const { adapter, fresh, send } = await boot(t, { auto: true })
  adapter.toolOnFirst = true
  adapter.window = 2048
  const agent = await fresh('pressure')
  await send(agent, 'Synthetic pressure. '.repeat(720) + 'Run one tool.')
  expect(adapter.summaries).toHaveLength(1)
  expect(adapter.requests).toHaveLength(2)
  const summary = compactEvents(agent).find(e => e.type === 'compaction/summary')
  expect(summary?.data.shadowedTokenCount).toBeGreaterThan(0)
  expect(agent.session.snapshotEvents().some(e => e.type === 'tool/result')).toBe(true)
})
