import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { expect, test, vi } from 'vitest'

const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const scopedRead = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/scoped-read.js') : await import('../src/scoped-read.ts')
const create = { kind: 'create', objective: 'Duplicate title', criteria: ['Validate identity'] }
const resume = taskId => ({ kind: 'continue', taskId })
const unavailable = { code: 'unavailable' }
const revision = { code: 'revision' }

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-host-')))
  const roots = { workspaceRoot: join(base, 'workspace'), journalRoot: join(base, 'journal'),
    graphRoot: join(base, 'graph'), compression: 'none' }
  const hosts = new Set(), contexts = new Set(), stores = new Set(), leases = new Set()
  const state = { native: null, sessions: [], count: 0, idle: true }
  t.onTestFinished(async () => {
    for (const host of hosts) await host.close()
    for (const ctx of contexts) await ctx.fiber.dispose()
    for (const store of stores) store.close()
    for (const lease of leases) lease.close()
    await rm(base, { recursive: true, force: true })
  })
  for (const path of [roots.workspaceRoot, roots.journalRoot, roots.graphRoot]) await mkdir(path)
  await acmi.provisionContinuationRoots(roots)

  const grant = id => {
    const read = createScopeAuthority(), write = createScopeAuthority(), operatorAuthority = createScopeAuthority()
    state.access = { read, write, operatorAuthority, reader: read.grant(id), writer: write.grant(id), operator: operatorAuthority.grant(id) }
    state.workspaceId = id
    return state.access
  }
  const openRuntime = async () => {
    const ctx = new Context()
    state.ctx = ctx
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Jsonl, { root: roots.journalRoot, compression: roots.compression })
    await mountAgentLoopTestHarness(ctx)
    const agents = new Map()
    return {
      ctx,
      async createSession(signal) {
        const handle = state.resumeSessionId
          ? await ctx.agents.resume({ resumeSessionId: SessionId(state.resumeSessionId), signal })
          : await ctx.agents.create({ sessionId: SessionId('continuation-' + ++state.count), meta: { cwd: roots.workspaceRoot }, signal })
        const { agent } = handle
        state.sessions.push(agent.session)
        state.native = agent.session
        agents.set(agent.session, handle)
        if (state.onCreate) await state.onCreate(agent.session)
        return agent.session
      },
      isIdle: () => state.idle,
      async closeSession(session) {
        if (state.onClose) await state.onClose()
        await agents.get(session).dispose()
        agents.delete(session)
      },
      async runSample(session, signal) {
        signal.throwIfAborted()
        const turn = 1 + session.snapshotEvents().filter(event => event.type === 'turn/start').length
        session.append('turn/start', { turn })
        session.append('user/message', createUserMessage({ source: { kind: 'user' },
          content: [{ type: 'text', text: state.sampleText ?? 'PRIVATE-SYNTHETIC-TEST-INPUT' }] }), { surfaceOp: 'append' })
        session.append('turn/end', { turn, reason: { kind: 'completed' } })
      },
      async runModel(session, request, signal) {
        state.lastAuthorize = request.authorize
        if (state.beforeModel) await state.beforeModel()
        request.authorize()
        signal.throwIfAborted()
        state.modelCalls = (state.modelCalls ?? 0) + 1
        state.context = request.context
        session.append('turn/start', { turn: 1 })
        session.append('user/message', createUserMessage({ source: { kind: 'user' },
          content: [{ type: 'text', text: request.prompt }] }), { surfaceOp: 'append' })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
        return 'fixture answer'
      },
      async dispose() {
        if (state.onDispose) await state.onDispose()
        await ctx.fiber.dispose()
        contexts.delete(ctx)
      },
    }
  }
  const open = async (extra = {}) => {
    const host = await acmi.openContinuationHost({ roots, synthetic: true, runtimeVersion: acmi.DSH_VERSION,
      authorize: grant, openRuntime, ...extra })
    hosts.add(host)
    return host
  }
  const ref = s => acmi.dshRuntimeIdentity(s.header, state.workspaceId)
  async function lowLevel() {
    const lease = await acmi.acquireContinuationRoots(roots)
    leases.add(lease)
    const access = grant(lease.workspaceId)
    const runtime = await openRuntime()
    const { ctx } = runtime
    const store = acmi.openGraphStore({ ...access, root: roots.graphRoot, workspaceId: lease.workspaceId, continuation: roots,
      taskLifecycle: { operatorAuthority: access.operatorAuthority, currentSession: id => {
        const session = ctx.sessions.get(SessionId(id))
        return session ? { session: ref(session), nextSourceSeq: session.seq } : null
      } } })
    stores.add(store)
    return { lease, runtime, store, ...access, opts: { ...roots, store, scope: access.reader, writer: access.writer,
      enabled: true, synthetic: true, runtimeVersion: acmi.DSH_VERSION } }
  }
  return { roots, state, open, ref, lowLevel }
}

const approve = async (host, command) => host.confirm((await host.preview(command)).token, true)
const start = (s, turn) => s.append('turn/start', { turn })
const end = (s, turn) => s.append('turn/end', { turn, reason: { kind: 'completed' } })

test('model requests are default-off and require an explicit binding and fresh Session', async t => {
  const f = await fixture(t)
  const disabled = await f.open()
  await expect(disabled.modelTurn('next')).rejects.toMatchObject(unavailable)
  await disabled.close()
  const host = await f.open({ modelEnabled: true })
  await expect(host.modelTurn('next')).rejects.toMatchObject(unavailable)
  const a = await approve(host, create)
  await approve(host, resume(a.taskId))
  expect(await host.modelTurn('next')).toMatchObject({ answer: 'fixture answer' })
  await expect(host.modelTurn('again')).rejects.toMatchObject({ code: 'conflict' })
  expect(f.state.modelCalls).toBe(1)
  expect(() => f.state.lastAuthorize()).toThrow()
})

test('model context survives reopen and includes only the explicitly selected task history', async t => {
  const f = await fixture(t)
  const first = await f.open()
  const a = await approve(first, create), b = await approve(first, create)
  await approve(first, resume(a.taskId))
  f.state.sampleText = 'A-ONLY-CEDAR-47'
  await first.sample()
  await approve(first, resume(b.taskId))
  f.state.sampleText = 'B-ONLY-PLUM-92'
  await first.sample()
  await first.close()
  const next = await f.open({ modelEnabled: true })
  await approve(next, resume(a.taskId))
  const result = await next.modelTurn('Continue from the saved value.')
  expect(result.context.text).toContain('A-ONLY-CEDAR-47')
  expect(result.context.text).not.toContain('B-ONLY-PLUM-92')
  expect(result.context.bytes).toBe(Buffer.byteLength(result.context.text))
  expect(result.context.sha256).toMatch(/^[a-f0-9]{64}$/u)
  expect(result.context.sources).toHaveLength(1)
  expect(result.context.window).toBe('latest-64-facts')
  expect((await next.status()).pending).toBe(0)
})

test('oversize context and pre-aborted requests never execute the model', async t => {
  const f = await fixture(t)
  const host = await f.open({ modelEnabled: true })
  const a = await approve(host, create)
  await approve(host, resume(a.taskId))
  await expect(host.modelTurn('next', { maxContextBytes: 16 })).rejects.toMatchObject({ code: 'limit' })
  await expect(host.modelTurn('next', {}, AbortSignal.abort())).rejects.toThrow()
  expect(f.state.modelCalls ?? 0).toBe(0)
})

test('large historical text fails the byte budget without dropping evidence or consuming the fresh Session', async t => {
  const f = await fixture(t)
  const host = await f.open({ modelEnabled: true })
  const a = await approve(host, create)
  await approve(host, resume(a.taskId))
  f.state.sampleText = 'x'.repeat(18000)
  await host.sample()
  await host.newSession()
  await approve(host, resume(a.taskId))
  await expect(host.modelTurn('next')).rejects.toMatchObject({ code: 'limit' })
  expect(f.state.modelCalls ?? 0).toBe(0)
  expect((await host.status()).recovery).toBe('ready')
  const result = await host.modelTurn('next', { maxContextBytes: 32768 })
  expect(result.context.text).toContain(f.state.sampleText)
})

for (const authority of ['read', 'write', 'operatorAuthority']) {
  test(`revoked ${authority} prevents dispatch after context preparation`, async t => {
    const f = await fixture(t)
    const host = await f.open({ modelEnabled: true })
    const a = await approve(host, create)
    await approve(host, resume(a.taskId))
    const grant = { read: 'reader', write: 'writer', operatorAuthority: 'operator' }[authority]
    f.state.beforeModel = () => f.state.access[authority].revoke(f.state.access[grant])
    await expect(host.modelTurn('next')).rejects.toMatchObject(unavailable)
    expect(f.state.modelCalls ?? 0).toBe(0)
  })
}

test('model read rechecks authorization after inspect and never reads revoked content', async t => {
  const f = await fixture(t)
  const first = await f.open()
  const a = await approve(first, create)
  await approve(first, resume(a.taskId))
  await first.sample()
  await first.close()
  const next = await f.open({ modelEnabled: true })
  await approve(next, resume(a.taskId))
  const original = scopedRead.openDshJournal
  let reads = 0
  const spy = vi.spyOn(scopedRead, 'openDshJournal').mockImplementation(async (...args) => {
    const journal = await original(...args)
    return { ...journal,
      async inspect(...params) {
        const value = await journal.inspect(...params)
        f.state.access.read.revoke(f.state.access.reader)
        return value
      },
      async read(...params) { reads++; return journal.read(...params) },
    }
  })
  try {
    await expect(next.modelTurn('continue')).rejects.toMatchObject(unavailable)
    expect(reads).toBe(0)
    expect(f.state.modelCalls ?? 0).toBe(0)
  } finally { spy.mockRestore() }
})

test('cancel, EOF, expiry and fabricated tokens cannot create, execute or bind', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const { session } = await host.status()
  for (const answer of [false, undefined, '', 'yes']) {
    const p = await host.preview(create)
    expect(await host.confirm(p.token, answer)).toBeNull()
    await expect(host.confirm(p.token, true)).rejects.toMatchObject(unavailable)
  }
  const real = await host.preview(create)
  await expect(host.confirm(JSON.parse(JSON.stringify(real.token)), true)).rejects.toMatchObject(unavailable)
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  try {
    const p = await host.preview(create)
    await expect(host.confirm(real.token, true)).rejects.toMatchObject(unavailable)
    now.mockReturnValue(120_000)
    await expect(host.confirm(p.token, true)).rejects.toMatchObject(unavailable)
  } finally { now.mockRestore() }
  expect((await host.tasks()).items).toEqual([])
  expect(await host.receipts(session)).toEqual([])
  expect((await host.status()).binding).toEqual({ taskId: null, revision: 0 })
})

test('create is unbound; restarting only reuses the Task UUID and leaves the old receipt offline', async t => {
  const f = await fixture(t)
  const first = await f.open()
  const created = await approve(first, create)
  expect(created.after.binding).toEqual({ taskId: null, revision: 0 })
  const initial = await approve(first, resume(created.taskId))
  await first.sample()
  await first.close()
  const second = await f.open()
  const status = await second.status()
  expect(status.session).not.toEqual(initial.session)
  expect(status.binding).toEqual({ taskId: null, revision: 0 })
  expect(f.state.ctx.sessions.get(SessionId(initial.session.sessionId))).toBeUndefined()
  expect((await second.tasks()).items).toHaveLength(1)
  expect(await second.receipts(initial.session, 0, 1)).toEqual([created])
  expect(await second.receipts(initial.session, 1, 1)).toEqual([initial])
  await expect(second.receipts({ ...initial.session, incarnation: '0' })).rejects.toMatchObject(unavailable)
  await expect(second.receipts({ ...initial.session, instanceId: 'foreign' })).rejects.toMatchObject(unavailable)
  await expect(second.preview(resume(created.taskId), initial.operationId)).rejects.toMatchObject(unavailable)
  const rebound = await approve(second, resume(created.taskId))
  expect(rebound).toMatchObject({ taskId: created.taskId, after: { binding: { revision: 1 } } })
  expect(rebound.operationId).not.toBe(initial.operationId)
  const history = await second.history(created.taskId)
  expect(history).toMatchObject({ history: 'history_ready', objective: create.objective, criteria: create.criteria,
    events: expect.arrayContaining([expect.objectContaining({ kind: 'user', session: initial.session })]) })
  expect(JSON.stringify(history)).not.toContain('PRIVATE-SYNTHETIC-TEST-INPUT')
})

test('confirmed operation retries preserve the first receipt and reject changed parameters', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const first = await approve(host, create)
  const replay = await host.preview(create, first.operationId)
  expect(await host.confirm(replay.token, true)).toEqual(first)
  await expect(host.preview({ ...create, objective: 'Different' }, first.operationId)).rejects.toMatchObject({ code: 'conflict' })
  const bound = await approve(host, resume(first.taskId))
  const bindingRetry = await host.preview(resume(first.taskId), bound.operationId)
  expect(await host.confirm(bindingRetry.token, true)).toEqual(bound)
  expect(await host.receipts(first.session)).toEqual([first, bound])
})

test('a runtime returning a previously registered Session cannot reactivate its old binding', async t => {
  const f = await fixture(t)
  const first = await f.open()
  const created = await approve(first, create)
  const bound = await approve(first, resume(created.taskId))
  await first.close()
  f.state.resumeSessionId = bound.session.sessionId
  const reopened = await f.open()
  expect(await reopened.status()).toMatchObject({ session: null, recovery: 'recovery_blocked', reason: 'conflict' })
  expect(f.state.ctx.sessions.get(SessionId(bound.session.sessionId))).toBeUndefined()
  expect(await reopened.receipts(bound.session)).toEqual([created, bound])
})

test('losing the response after receipt commit does not execute create again on restart', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const original = acmi.LocalGraphStore.prototype.taskLifecycle
  const failure = new Error('transport lost the committed receipt')
  const wrap = vi.spyOn(acmi.LocalGraphStore.prototype, 'taskLifecycle').mockImplementation(function (...args) {
    const lifecycle = original.apply(this, args)
    return { ...lifecycle, execute(token) { lifecycle.execute(token); throw failure } }
  })
  const preview = await host.preview(create)
  try { await expect(host.confirm(preview.token, true)).rejects.toBe(failure) } finally { wrap.mockRestore() }
  await host.close()
  const reopened = await f.open()
  const [receipt] = await reopened.receipts(preview.session)
  expect(receipt).toMatchObject({ operationId: preview.operationId, kind: 'create' })
  expect((await reopened.tasks()).items.map(task => task.taskId)).toEqual([receipt.taskId])
  expect((await reopened.status()).binding).toEqual({ taskId: null, revision: 0 })
})

test('read or operator revocation invalidates approval and read pages reauthorize', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const first = await approve(host, create)
  const p = await host.preview(resume(first.taskId))
  f.state.access.operatorAuthority.revoke(f.state.access.operator)
  await expect(host.confirm(p.token, true)).rejects.toMatchObject(unavailable)
  expect(await host.receipts(first.session)).toEqual([first])
  f.state.access.read.revoke(f.state.access.reader)
  await expect(host.receipts(first.session)).rejects.toMatchObject(unavailable)
  await expect(host.tasks()).rejects.toMatchObject(unavailable)
})

test('does not confirm after source sequence drift or at a flushed but unreconciled cut', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const first = await approve(host, create)
  const p = await host.preview(resume(first.taskId))
  start(f.state.native, 1)
  end(f.state.native, 1)
  expect(await f.state.ctx.sessions.flush(f.state.native)).toBe(true)
  await expect(host.confirm(p.token, true)).rejects.toMatchObject(revision)
  await expect(host.preview(resume(first.taskId))).rejects.toMatchObject({ code: 'gap' })
  expect((await host.status()).pending).toBe(2)
  expect(await host.receipts(first.session)).toEqual([first])
})

test('task or binding revision drift prevents executing the previous preview', async t => {
  const f = await fixture(t)
  const method = acmi.LocalGraphStore.prototype.taskLifecycle
  let store
  const observe = vi.spyOn(acmi.LocalGraphStore.prototype, 'taskLifecycle').mockImplementation(function (...args) {
    store = this
    return method.apply(this, args)
  })
  let host
  try { host = await f.open() } finally { observe.mockRestore() }
  const first = await approve(host, create)
  const { reader, writer, operator } = f.state.access
  const p = await host.preview(resume(first.taskId))
  store.append(writer, first.taskId, { change: { kind: 'task-reframed', objective: 'A new objective', criteria: ['Check'] },
    key: 'external-change', source: { session: { ...first.session, adapterId: 'test-host' }, localSeq: 0, sourceRevision: 'test' } },
  store.read(reader, first.taskId).revision)
  await expect(host.confirm(p.token, true)).rejects.toMatchObject(revision)
  const q = await host.preview(resume(first.taskId))
  const other = store.taskLifecycle(writer, operator)
  other.execute(other.confirm(first.session, { kind: 'bind', operationId: 'external-bind', taskId: first.taskId, expectedRevision: 0 }))
  await expect(host.confirm(q.token, true)).rejects.toMatchObject(revision)
  expect((await host.receipts(first.session)).map(r => r.operationId)).toEqual([first.operationId, 'external-bind'])
})

test('session new waits for idle and invalidates the old Session preview', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const first = await approve(host, create)
  await approve(host, resume(first.taskId))
  const old = await host.preview({ kind: 'leave' })
  f.state.idle = false
  await expect(host.newSession()).rejects.toMatchObject({ code: 'busy' })
  expect((await host.status()).session).toEqual(first.session)
  f.state.idle = true
  const fresh = await host.newSession()
  expect(fresh).not.toEqual(first.session)
  expect((await host.status()).binding).toEqual({ taskId: null, revision: 0 })
  await expect(host.confirm(old.token, true)).rejects.toMatchObject(unavailable)
  expect((await approve(host, resume(first.taskId))).after.binding.revision).toBe(1)
  expect((await approve(host, { kind: 'leave' })).after.binding).toEqual({ taskId: null, revision: 2 })
})

test('a rotation failure preserves the old Session and starts no replacement', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const before = await host.status()
  f.state.onClose = () => { throw Error('close failed') }
  await expect(host.newSession()).rejects.toThrow()
  expect(await host.status()).toMatchObject({ session: before.session, recovery: 'recovery_blocked' })
  expect(f.state.sessions).toHaveLength(1)
  await expect(host.preview(create)).rejects.toMatchObject(unavailable)
})

test('exact registration gates attach, offline reconciliation and receipts; drain rechecks the current grant', async t => {
  const f = await fixture(t)
  const { store, opts, runtime, reader, writer, read, write } = await f.lowLevel()
  const native = await runtime.createSession()
  const ref = f.ref(native)
  const orphan = await runtime.createSession()
  const orphanRef = f.ref(orphan)
  const ingestion = await acmi.registerDshRuntimeIngestion(runtime.ctx, opts)
  expect(() => ingestion.attach(native)).toThrow(/unavailable/)
  await runtime.ctx.sessions.flush(orphan)
  await runtime.closeSession(orphan)
  await expect(acmi.reconcileKnownDshSession(runtime.ctx, opts, orphanRef)).rejects.toMatchObject(unavailable)
  await runtime.ctx.sessions.flush(native)
  await store.registerContinuationSession(writer, ref)
  ingestion.attach(native)
  await ingestion.reconcile(native)
  start(native, 1)
  end(native, 1)
  await runtime.ctx.sessions.flush(native)
  const drain = ingestion.drain(native)
  write.revoke(writer)
  await expect(drain).rejects.toMatchObject(unavailable)
  expect(store.continuationReceipts(reader, ref)).toEqual([])
  expect(() => store.continuationReceipts(reader, { ...ref, incarnation: '0' })).toThrow(/unavailable/)
  await runtime.closeSession(native)
  const nextWriter = write.grant(ref.instanceId)
  await expect(acmi.reconcileKnownDshSession(runtime.ctx, { ...opts, writer: nextWriter },
    { ...ref, incarnation: '0' })).rejects.toMatchObject(unavailable)
  await expect(acmi.reconcileKnownDshSession(runtime.ctx, { ...opts, writer: nextWriter }, ref)).resolves.toMatchObject({ committed: 2 })
  read.revoke(reader)
  expect(() => store.continuationReceipts(reader, ref)).toThrow(/unavailable/)
})

test('live reconciliation does not start a Journal body read after revocation during inspect', async t => {
  const f = await fixture(t)
  const { store, opts, runtime, reader, writer, read } = await f.lowLevel()
  const { ctx } = runtime
  const native = await runtime.createSession()
  await ctx.sessions.flush(native)
  await store.registerContinuationSession(writer, f.ref(native))
  const open = scopedRead.openDshJournal
  const readBody = vi.fn()
  const boundary = vi.spyOn(scopedRead, 'openDshJournal').mockImplementation(async (...args) => {
    const journal = await open(...args)
    return {
      ...journal,
      async inspect(...inspectArgs) {
        const snapshot = await journal.inspect(...inspectArgs)
        read.revoke(reader)
        return snapshot
      },
      read(...readArgs) {
        readBody()
        return journal.read(...readArgs)
      },
    }
  })
  try {
    const ingestion = await acmi.registerDshRuntimeIngestion(ctx, opts)
    ingestion.attach(native)
    start(native, 1)
    end(native, 1)
    await expect(ingestion.reconcile(native)).rejects.toMatchObject(unavailable)
    expect(readBody).not.toHaveBeenCalled()
  } finally { boundary.mockRestore() }
})

test('drain does not stat a Session detached while its native flush was pending', async t => {
  const f = await fixture(t)
  const { store, opts, runtime, writer } = await f.lowLevel()
  const { ctx } = runtime
  const native = await runtime.createSession()
  await ctx.sessions.flush(native)
  await store.registerContinuationSession(writer, f.ref(native))
  const ingestion = await acmi.registerDshRuntimeIngestion(ctx, opts)
  ingestion.attach(native)
  start(native, 1)
  end(native, 1)
  const flush = ctx.sessions.flush.bind(ctx.sessions)
  const barrier = vi.spyOn(ctx.sessions, 'flush').mockImplementation(async session => {
    const flushed = await flush(session)
    ingestion.detach(native)
    return flushed
  })
  const stat = vi.spyOn(ctx.sessionPersistence, 'stat')
  try {
    await expect(ingestion.drain(native)).rejects.toMatchObject(unavailable)
    expect(stat).not.toHaveBeenCalled()
  } finally { barrier.mockRestore(); stat.mockRestore() }
})

test('the continuation Store rejects unregistered facts and native binding before the first Host binding', async t => {
  const f = await fixture(t)
  const { store, runtime, reader, writer } = await f.lowLevel()
  const native = await runtime.createSession()
  const identity = f.ref(native)
  const first = start(native, 1)
  const ingest = row => store.ingest(writer, acmi.normalizeDshRuntimeFact(native.header, row, identity.instanceId, 0), 0)
  expect(ingest.bind(null, first)).toThrow(/unavailable/)
  await runtime.ctx.sessions.flush(native)
  await store.registerContinuationSession(writer, identity)
  expect(ingest(first).status).toBe('committed')
  const binding = appendPluginRecord(native, 'plugin:acmi-probe/task-binding',
    { sessionId: native.id, taskId: '08100000-0000-4000-8000-000000000010', revision: 1 })
  expect(() => ingest(native.snapshotEvents()[binding])).toThrow(/conflict/)
  expect(store.cursor(reader, identity)).toMatchObject({ next: first.seq + 1, bindingRevision: 0 })
})

test('an unregistered durable Session is not discovered on restart', async t => {
  const f = await fixture(t)
  f.state.onCreate = async native => {
    await f.state.ctx.sessions.flush(native)
    f.state.access.write.revoke(f.state.access.writer)
  }
  const blocked = await f.open()
  const orphan = f.ref(f.state.native)
  expect(await blocked.status()).toMatchObject({ session: null, recovery: 'recovery_blocked', history: 'history_incomplete' })
  expect(await blocked.sessions()).toEqual([])
  await blocked.close()
  f.state.onCreate = null
  const reopened = await f.open()
  expect((await reopened.status()).reconciledSessions).toBe(0)
  expect((await reopened.sessions()).map(entry => entry.session)).not.toContainEqual(orphan)
  await expect(reopened.receipts(orphan)).rejects.toMatchObject(unavailable)
})

test('offline recovery rejects a cut truncated below registration, even without a Graph cursor', async t => {
  const f = await fixture(t)
  const { store, opts, runtime, writer } = await f.lowLevel()
  const native = await runtime.createSession()
  const ref = f.ref(native)
  start(native, 1)
  end(native, 1)
  await runtime.ctx.sessions.flush(native)
  const registration = await store.registerContinuationSession(writer, ref)
  expect(registration.checkpointNext).toBeGreaterThan(0)
  const file = (await runtime.ctx.sessionPersistence.stat(native.id, {})).location.path
  await runtime.closeSession(native)
  const header = (await readFile(file, 'utf8')).split('\n')[0]
  await writeFile(file, header + '\n')
  await expect(acmi.reconcileKnownDshSession(runtime.ctx, opts, ref)).rejects.toMatchObject({ code: 'conflict' })
})

test('missing registered Journal blocks startup but permits scoped receipt reads and exit', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const first = await approve(host, create)
  const file = (await f.state.ctx.sessionPersistence.stat(f.state.native.id, {})).location.path
  await host.close()
  await rm(file)
  const blocked = await f.open()
  expect(await blocked.status()).toMatchObject({ session: null, recovery: 'recovery_blocked', history: 'history_incomplete' })
  expect(await blocked.receipts(first.session)).toEqual([first])
  expect(await blocked.history(first.taskId)).toMatchObject({ history: 'history_incomplete' })
  await expect(blocked.preview(create)).rejects.toMatchObject(unavailable)
  await expect(blocked.sample()).rejects.toMatchObject(unavailable)
  await expect(blocked.modelTurn('next')).rejects.toMatchObject(unavailable)
  expect((await blocked.close()).saved).toBe(false)
})

test('A/B/A does not rewrite binding or late result attribution', async t => {
  const f = await fixture(t)
  const host = await f.open({ modelEnabled: true })
  const a = await approve(host, create), b = await approve(host, create)
  expect(a.taskId).not.toBe(b.taskId)
  const first = await approve(host, resume(a.taskId))
  const native = f.state.native
  const turn = 1, step = 1, callId = ToolCallId('late')
  start(native, turn)
  native.append('step/start', { turn, step })
  const block = { type: 'tool-call', id: callId, name: 'synthetic', arguments: '{}' }
  native.append('assistant/message', { turn, step, stream: [],
    message: createAssistantMessage({ source: { provider: 'fixture', model: 'fixture' }, content: [block] }) }, { surfaceOp: 'append' })
  const call = native.append('tool/call', { turn, step, callId, name: block.name, arguments: block.arguments })
  await host.sync()
  const second = await approve(host, resume(b.taskId))
  const late = native.append('tool/result', { turn, step,
    message: createToolResultMessage({ callId, isError: true, content: [{ type: 'text', text: 'PRIVATE-LATE' }] }) },
  { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
  native.append('step/end', { turn, step })
  end(native, turn)
  await host.sync()
  const third = await approve(host, resume(a.taskId))
  expect([first, second, third].map(receipt => receipt.after.binding.revision)).toEqual([1, 2, 3])
  expect(await host.history(a.taskId)).toMatchObject({ events: expect.arrayContaining([
    expect.objectContaining({ kind: 'tool-result', localSeq: late.seq, callSeq: call.seq, via: 'original-call' }),
  ]) })
  expect((await host.history(b.taskId)).events).not.toContainEqual(expect.objectContaining({ kind: 'tool-result' }))
  expect((await host.tasks()).items).toHaveLength(2)
  await host.newSession()
  await approve(host, resume(a.taskId))
  const restored = await host.modelTurn('next')
  expect(restored.context.text).toContain('PRIVATE-LATE')
  expect(JSON.parse(restored.context.text).evidence.find(item => item.kind === 'tool-result').isError).toBe(true)
  expect(restored.context.sources).toContainEqual(expect.objectContaining({ kind: 'tool-result', callSeq: call.seq }))
  await host.newSession()
  await approve(host, resume(b.taskId))
  expect((await host.modelTurn('next')).context.text).not.toContain('PRIVATE-LATE')
})

test('shutdown deadline retains both leases while the dsh writer is still disposing', async t => {
  const f = await fixture(t)
  const host = await f.open()
  const disposing = Promise.withResolvers(), finish = Promise.withResolvers()
  f.state.onDispose = () => { disposing.resolve(); return finish.promise }
  t.onTestFinished(() => finish.resolve())
  try {
    const closing = host.close(AbortSignal.timeout(50))
    await disposing.promise
    expect(await closing).toMatchObject({ saved: false, reason: 'timeout' })
    await expect(acmi.acquireContinuationRoots(f.roots)).rejects.toMatchObject({ code: 'busy' })
  } finally { finish.resolve() }
  await host.close()
  const lease = await acmi.acquireContinuationRoots(f.roots)
  lease.close()
})
