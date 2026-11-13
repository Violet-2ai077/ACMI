import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createScopeAuthority } from '@acmi/core'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { expect, test } from 'vitest'

const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-catalog-')))
  const ctx = new Context()
  let store, lease
  t.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally {
      store?.close()
      lease?.close()
      await rm(base, { recursive: true, force: true })
    }
  })
  const continuation = {
    workspaceRoot: join(base, 'workspace'), journalRoot: join(base, 'journal'), graphRoot: join(base, 'graph'), compression: 'none',
  }
  await Promise.all([continuation.workspaceRoot, continuation.journalRoot, continuation.graphRoot].map(path => mkdir(path)))
  await acmi.provisionContinuationRoots(continuation)
  lease = await acmi.acquireContinuationRoots(continuation)
  const { workspaceId } = lease
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Jsonl, { root: continuation.journalRoot, compression: continuation.compression })
  const harness = await mountAgentLoopTestHarness(ctx)
  const { session: native } = await harness.create(SessionId('catalog-test'), {}, { cwd: continuation.workspaceRoot })
  const session = acmi.dshRuntimeIdentity(native.header, workspaceId)
  const read = createScopeAuthority(), write = createScopeAuthority(), operatorAuthority = createScopeAuthority()
  const reader = read.grant(workspaceId), writer = write.grant(workspaceId), operator = operatorAuthority.grant(workspaceId)
  let live = { session, nextSourceSeq: native.seq }
  const options = { root: continuation.graphRoot, workspaceId, read, write, continuation }
  store = acmi.openGraphStore({ ...options, taskLifecycle: { operatorAuthority, currentSession: () => live } })
  return {
    session, native, reader, writer, read, write, get store() { return store },
    flush: () => ctx.sessions.flush(native),
    register: (ref = session, signal) => store.registerContinuationSession(writer, ref, signal),
    live: value => { live = value },
    create: operationId => {
      const host = store.taskLifecycle(writer, operator)
      return host.execute(host.confirm(session, { kind: 'create', operationId, objective: 'Duplicate title', criteria: ['Check result'] }))
    },
    reopen(change) {
      store.close()
      if (change) {
        const db = new DatabaseSync(join(continuation.graphRoot, 'graph.sqlite'))
        try { db.exec(change) } finally { db.close() }
      }
      store = acmi.openGraphStore(options)
    },
  }
}

test('requires the exact live, checkpointed native incarnation; retry keeps the first registration', async t => {
  const f = await fixture(t)
  await expect(f.register()).rejects.toMatchObject({ code: 'unavailable' })
  expect(() => f.create('unregistered')).toThrow(/unavailable/)
  expect(await f.flush()).toBeTruthy()
  await expect(f.register({ ...f.session, instanceId: 'foreign' })).rejects.toMatchObject({ code: 'unavailable' })
  await expect(f.register({ ...f.session, incarnation: '0' })).rejects.toMatchObject({ code: 'unavailable' })
  const wrong = { ...f.session, incarnation: '0' }
  f.live({ session: wrong, nextSourceSeq: f.native.seq })
  await expect(f.register(wrong)).rejects.toMatchObject({ code: 'unavailable' })
  f.live({ session: f.session, nextSourceSeq: f.native.seq + 1 })
  await expect(f.register()).rejects.toMatchObject({ code: 'revision' })
  f.live({ session: f.session, nextSourceSeq: f.native.seq })
  const first = await f.register()
  expect(first).toMatchObject({ session: f.session, checkpointNext: f.native.seq })
  expect(await f.register()).toEqual(first)
  f.reopen()
  expect(f.store.continuationSessions(f.reader)).toEqual([first])
})

test.for(['revocation', 'sequence drift'])('registration rejects %s during asynchronous Journal validation', async (mode, t) => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  const pending = f.register()
  if (mode === 'revocation') f.write.revoke(f.writer)
  else f.live({ session: f.session, nextSourceSeq: f.native.seq + 1 })
  await expect(pending).rejects.toMatchObject({ code: mode === 'revocation' ? 'unavailable' : 'revision' })
  expect(f.store.continuationSessions(f.reader)).toEqual([])
})

test('old receipts require a current read grant and exact registration, not a live Session or writer', async t => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  await f.register()
  const first = f.create('create-one'), second = f.create('create-two')
  f.reopen()
  f.write.revoke(f.writer)
  expect(f.store.continuationReceipts(f.reader, f.session, 0, 1)).toEqual([first])
  expect(f.store.continuationReceipts(f.reader, f.session, 1, 1)).toEqual([second])
  expect(() => f.store.continuationReceipts(f.reader, { ...f.session, incarnation: '0' })).toThrow(/unavailable/)
  expect(() => f.store.continuationReceipts(f.reader, f.session, 10)).toThrow(/corrupt/)
  f.read.revoke(f.reader)
  expect(() => f.store.continuationSessions(f.reader)).toThrow(/unavailable/)
  expect(() => f.store.continuationReceipts(f.reader, f.session)).toThrow(/unavailable/)
})

test('receipt and registration corruption fail closed instead of returning empty history', async t => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  await f.register()
  f.create('create-one')
  f.reopen("UPDATE task_lifecycle_receipt SET hash = 'invalid'")
  expect(() => f.store.continuationReceipts(f.reader, f.session)).toThrow(/corrupt/)
  f.reopen("UPDATE continuation_session SET hash = 'invalid'")
  expect(() => f.store.continuationReceipts(f.reader, f.session)).toThrow(/corrupt/)
  expect(() => f.store.continuationSessions(f.reader)).toThrow(/corrupt/)
})

test('directory rejects missing records when a durable lifecycle receipt still references them', async t => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  await f.register()
  f.create('create-one')
  f.reopen('DELETE FROM graph_event')
  expect(() => f.store.continuationTasks(f.reader)).toThrow(/corrupt/)
  f.reopen('DELETE FROM continuation_session')
  expect(() => f.store.continuationSessions(f.reader)).toThrow(/corrupt/)
})

test('a missing create receipt is not mistaken for the end of history', async t => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  await f.register()
  f.create('first')
  f.create('second')
  f.reopen('DELETE FROM task_lifecycle_receipt WHERE ordinal=2')
  expect(() => f.store.continuationReceipts(f.reader, f.session, 1)).toThrow(/corrupt/)
  expect(() => f.store.continuationTasks(f.reader)).toThrow(/corrupt/)
})

test('task catalog is ordered by UUID, keeps same-title identities separate and rejects stale or revoked pages', async t => {
  const f = await fixture(t)
  expect(await f.flush()).toBeTruthy()
  await f.register()
  const ids = [f.create('first').taskId, f.create('second').taskId].sort()
  const page = f.store.continuationTasks(f.reader, 1)
  expect(page.items).toEqual([{ taskId: ids[0], objective: 'Duplicate title', status: 'open' }])
  expect(f.store.continuationTasks(f.reader, 1, page.next)).toMatchObject({ items: [{ taskId: ids[1] }], next: null })
  f.create('third')
  expect(() => f.store.continuationTasks(f.reader, 1, page.next)).toThrow(/revision/)
  const fresh = f.store.continuationTasks(f.reader, 1)
  f.reopen()
  expect(f.store.continuationTasks(f.reader, 1, fresh.next).items).toHaveLength(1)
  expect(() => f.store.continuationTasks(f.reader, 1, { ...page.next, workspaceId: 'foreign' })).toThrow(/invalid/)
  f.reopen("UPDATE graph_event SET hash = 'invalid'")
  expect(() => f.store.continuationTasks(f.reader, 1)).toThrow(/corrupt/)
  f.read.revoke(f.reader)
  expect(() => f.store.continuationTasks(f.reader, 1, page.next)).toThrow(/unavailable/)
})
