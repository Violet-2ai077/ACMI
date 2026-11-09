import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runConformance } from '@acmi/conformance'
import type { NormalizedRuntimeEvent } from '@acmi/contracts'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { expect, it, type TestContext } from 'vitest'
import * as Acmi from '../src/index.ts'

async function roots() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-alpha-')))
  const workspaceRoot = join(base, 'workspace')
  const journalRoot = join(base, 'journals')
  const otherWorkspace = join(base, 'foreign')
  for (const dir of [workspaceRoot, journalRoot, otherWorkspace]) await mkdir(dir)
  return { base, workspaceRoot, journalRoot, otherWorkspace }
}

async function setup(test: TestContext, compression: 'none' | 'zstd' = 'none') {
  const paths = await roots()
  await Acmi.createStorageIsolationMarker(paths.journalRoot, paths.workspaceRoot, compression)
  const ctx = new Context()
  test.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(paths.base, { recursive: true, force: true }) }
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(paths.base, 'registry') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(Jsonl, { root: paths.journalRoot, compression })
  const harness = await mountAgentLoopTestHarness(ctx)
  const agent = await harness.create(SessionId('alpha-one'), {}, { cwd: paths.workspaceRoot })
  await ctx.sessions.flush(agent.session)
  const owner = ctx.plugin(Acmi, { workspaceRoot: paths.workspaceRoot, journalRoot: paths.journalRoot, compression })
  await owner
  const call = (name: string, args: object, id = name) => executeToolFixture(ctx, {
    name, arguments: args, callId: ToolCallId(id), agent, signal: new AbortController().signal,
  })
  return { ...paths, ctx, agent, owner, harness, call }
}

function appendExchange(session: Session, step: number, proved: boolean, beforeResult?: () => Promise<unknown>) {
  const position = { turn: 1, step }
  const callId = ToolCallId('reused')
  const advertised = { type: 'tool-call' as const, id: callId, name: 'synthetic', arguments: '{"neverExpose":true}' }
  session.append('step/start', position)
  const assistant = session.append('assistant/message', {
    ...position, stream: [],
    message: createAssistantMessage({ source: { provider: 'fixture', model: 'fixture' }, content: [advertised] }),
  }, { surfaceOp: 'append' })
  const call = session.append('tool/call', { ...position, callId, name: advertised.name, arguments: advertised.arguments })
  async function finish() {
    await beforeResult?.()
    const result = session.append('tool/result', {
      ...position,
      message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: 'hidden result' }] }),
    }, { surfaceOp: 'append', ...(proved ? { sourceEventSeqs: [call.seq] } : {}) })
    session.append('step/end', position)
    return { assistant, call, result }
  }
  return finish()
}

it('guards the exact dsh runtime and refuses missing isolation proof', async test => {
  expect(() => Acmi.assertDshVersion('0.2.2')).toThrow(/0\.2\.2-rc\.1/)
  expect(() => Acmi.assertDshVersion('0.2.2-rc.1')).not.toThrow()
  const { base, journalRoot, workspaceRoot } = await roots()
  test.onTestFinished(() => rm(base, { recursive: true, force: true }))
  await expect(Acmi.openDshJournal(journalRoot, workspaceRoot, 'none')).rejects.toThrow('ACMI_JOURNAL_SCOPE')
})

it('loads with stock Cordis/dsh tools, preserves explicit revisions and serves scoped metadata', async test => {
  const { ctx, agent, owner, harness, workspaceRoot, otherWorkspace, call } = await setup(test)
  const title = 'Synthetic alpha task'
  const first = await call('acmi_task_create', { title }, 'create-a')
  expect(first).toMatchObject({ isError: false, value: { title, created: true } })
  const taskId = (first.value as { task_id: string }).task_id
  expect(taskId).toMatch(/^[a-f0-9-]{14}4[a-f0-9-]{21}$/)
  expect(await call('acmi_task_create', { title }, 'create-a')).toMatchObject({ value: { task_id: taskId, created: false } })
  expect(await call('acmi_task_create', { title: 'conflicting retry' }, 'create-a')).toMatchObject({ isError: true })
  expect(await call('acmi_task_list', {})).toMatchObject({ value: { binding: null } })
  const second = await call('acmi_task_create', { title: 'Another task' }, 'create-b')
  const another = (second.value as { task_id: string }).task_id
  const bind = (id: string) => call('acmi_task_bind', { task_id: id })
  expect(await bind(taskId)).toMatchObject({ value: { task_id: taskId, binding_revision: 1 } })
  expect(await bind(taskId)).toMatchObject({ value: { binding_revision: 1 } })
  agent.session.append('turn/start', { turn: 1 })
  await appendExchange(agent.session, 1, true, async () => {
    expect(await bind(another)).toMatchObject({ value: { binding_revision: 2 } })
  })
  expect(await bind(taskId)).toMatchObject({ value: { binding_revision: 3 } })
  agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const next = await harness.create(SessionId('alpha-two'), {}, { cwd: workspaceRoot })
  await ctx.sessions.flush(agent.session)
  const reader = ctx.get('acmiHistory')!
  const page = await reader.query(next.session, { taskId, limit: 20 })
  expect(page.rows.find(row => row.attribution.kind === 'bound' && row.attribution.method === 'original-call'))
    .toMatchObject({ attribution: { binding: { taskId, revision: 1 } } })
  expect(await reader.render(next.session, { taskId, limit: 20 })).toContain(taskId)
  expect(JSON.stringify(page)).not.toMatch(/neverExpose|hidden result|workspaceRoot/)
  const firstPage = await reader.query(next.session, { taskId, limit: 1 })
  expect(firstPage.next).toBeDefined()
  await expect(reader.query(agent.session, { taskId, limit: 1, cursor: firstPage.next! })).rejects.toThrow('ACMI_HISTORY_CURSOR')
  const foreign = await harness.create(SessionId('foreign'), {}, { cwd: otherWorkspace })
  await expect(reader.query(foreign.session, { taskId, limit: 20 })).rejects.toThrow('ACMI_HISTORY_SCOPE')
  agent.session.append('turn/start', { turn: 2 })
  await ctx.sessions.flush(agent.session)
  await expect(reader.query(next.session, { taskId, limit: 1, cursor: firstPage.next! })).rejects.toThrow('ACMI_HISTORY_CURSOR')
  await owner.dispose()
  expect(ctx.tools.get('acmi_task_create')).toBeUndefined()
  await expect(reader.query(next.session, { taskId, limit: 20 })).rejects.toThrow()
})

it('conforms to L4 using two cuts reopened from the published dsh v4 writer', async test => {
  const { ctx, agent, harness, journalRoot, workspaceRoot } = await setup(test)
  const second = await harness.create(SessionId('alpha-two'), {}, { cwd: workspaceRoot })
  const user = (session: Session) => session.append('user/message', createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'synthetic user payload' }],
  }), { surfaceOp: 'append' })
  const open = agent.session.append('turn/start', { turn: 1 })
  const input = user(agent.session)
  const proved = await appendExchange(agent.session, 1, true)
  const unproved = await appendExchange(agent.session, 2, false)
  const close = agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const other = user(second.session)
  await ctx.sessions.flush(agent.session)
  await ctx.sessions.flush(second.session)
  const journal = await Acmi.openDshJournal(journalRoot, workspaceRoot, 'none')
  const authority = createScopeAuthority()
  const workspaceId = journal.partitionId
  const signals = AbortSignal.timeout(10_000)
  const adapter = Acmi.createDshJournalHarnessAdapter(journal, authority)
  const revision = async (id: string) => {
    const snapshot = (await journal.inspect(id, signals))!
    return createHash('sha256').update(JSON.stringify([workspaceId, snapshot.revision])).digest('hex')
  }
  const primary = Acmi.dshSessionRef(agent.session.header, workspaceId)
  const secondary = Acmi.dshSessionRef(second.session.header, workspaceId)
  const primaryRevision = await revision(primary.sessionId)
  const secondaryRevision = await revision(secondary.sessionId)
  const ref = (localSeq: number, session = primary) => ({ session, localSeq, sourceRevision: session === primary ? primaryRevision : secondaryRevision })
  const step = (kind: 'step-open' | 'step-close' | 'assistant', localSeq: number, stepId: string): NormalizedRuntimeEvent =>
    ({ kind, ref: ref(localSeq), turnId: '1', stepId })
  const tool = (kind: 'tool-call' | 'tool-result', localSeq: number, stepId: string, origin?: number): NormalizedRuntimeEvent => {
    const base = { ref: ref(localSeq), turnId: '1', stepId, toolCallId: 'reused' }
    return kind === 'tool-call' ? { ...base, kind } : { ...base, kind, originalCall: origin === undefined ? null : ref(origin) }
  }
  const expected: NormalizedRuntimeEvent[] = [
    { kind: 'turn-open', ref: ref(open.seq), turnId: '1' }, { kind: 'user', ref: ref(input.seq), turnId: '1' },
    step('step-open', proved.assistant.seq - 1, '1'), step('assistant', proved.assistant.seq, '1'),
    tool('tool-call', proved.call.seq, '1'), tool('tool-result', proved.result.seq, '1', proved.call.seq),
    step('step-close', proved.result.seq + 1, '1'),
    step('step-open', unproved.assistant.seq - 1, '2'), step('assistant', unproved.assistant.seq, '2'),
    tool('tool-call', unproved.call.seq, '2'), tool('tool-result', unproved.result.seq, '2'),
    step('step-close', unproved.result.seq + 1, '2'), { kind: 'turn-complete', ref: ref(close.seq), turnId: '1' },
  ]
  const report = await runConformance({
    adapter, capabilities: Acmi.dshJournalCapabilities, scope: authority.grant(workspaceId), foreignScope: authority.grant('foreign'),
    sessions: [{ session: primary, events: expected }, { session: secondary, events: [{ kind: 'user', ref: ref(other.seq, secondary) }] }],
    reopen: async () => Acmi.createDshJournalHarnessAdapter(await Acmi.openDshJournal(journalRoot, workspaceRoot, 'none'), authority),
  })
  expect(report.checks.filter(check => !check.passed)).toEqual([])
  expect(report).toMatchObject({ level: 4, passed: true })
})

it.for(['none', 'zstd'] as const)('reads a stock %s v4 journal without changing source bytes', async (compression, test) => {
  const { ctx, journalRoot, workspaceRoot, agent } = await setup(test, compression)
  agent.session.append('user/message', createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'synthetic payload' }],
  }), { surfaceOp: 'append' })
  await ctx.sessions.flush(agent.session)
  const bucket = (await readdir(journalRoot)).find(name => name.startsWith('--'))!
  const file = join(journalRoot, bucket, agent.session.id, compression === 'none' ? 'session.v4.jsonl' : 'session.v4.jsonl.zstd')
  const hash = async () => createHash('sha256').update(await readFile(file)).digest('hex')
  const before = await hash()
  const storage = await Acmi.openDshJournal(journalRoot, workspaceRoot, compression)
  const snapshots = await storage.list(new AbortController().signal)
  expect(snapshots).toHaveLength(1)
  const parsed = await storage.read(snapshots[0]!, new AbortController().signal)
  expect(parsed.events.some(event => event.type === 'user/message')).toBe(true)
  expect(await hash()).toBe(before)
  const unresolved = await ctx.acmiHistory.query(agent.session, { unresolved: true, limit: 20 })
  expect(unresolved.rows).toMatchObject([{ attribution: { kind: 'unresolved', reason: 'no-turn' } }])
  const html = await ctx.acmiHistory.render(agent.session, { unresolved: true, limit: 20 })
  expect(html).toContain('No proved Task attribution')
  expect(html).not.toContain('synthetic payload')
  await mkdir(join(journalRoot, 'foreign-partition'))
  await expect(storage.list(new AbortController().signal)).rejects.toThrow('ACMI_JOURNAL_SCOPE')
})

it('rejects an unsupported or malformed current generation instead of recovering or migrating', async test => {
  const { ctx, journalRoot, workspaceRoot, agent } = await setup(test)
  await ctx.sessions.flush(agent.session)
  const bucket = (await readdir(journalRoot)).find(name => name.startsWith('--'))!
  const parent = join(journalRoot, bucket, agent.session.id)
  const storage = await Acmi.openDshJournal(journalRoot, workspaceRoot, 'none')
  const signal = new AbortController().signal
  await writeFile(join(parent, 'session.v5.jsonl'), '{}\n')
  await expect(storage.list(signal)).rejects.toThrow('ACMI_JOURNAL_UNSUPPORTED')
  await rm(join(parent, 'session.v5.jsonl'))
  await writeFile(join(parent, 'session.v4.jsonl'), '{}\n')
  await expect(storage.list(signal)).rejects.toThrow('ACMI_JOURNAL_CORRUPT')
})
