import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { createScopeAuthority, runtimeFactId } from '@acmi/core'

const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const workspaceId = 'phase-091-task-lifecycle'
const session = { adapterId: 'dsh', instanceId: workspaceId, sessionId: 'synthetic', incarnation: '7' }
const otherTask = '09100000-0000-4000-8000-000000000001'
const absentTask = '09100000-0000-4000-8000-000000000002'
const sha = value => createHash('sha256').update(value).digest('hex')
const create = { kind: 'create', operationId: 'create-1', objective: 'Verify release readiness', criteria: ['Report blockers'] }
const select = taskId => ({ kind: 'switch', operationId: 'switch-1', taskId })
const bind = (taskId, expectedRevision, operationId = 'bind-1') => ({ kind: 'bind', operationId, taskId, expectedRevision })
const unbind = { kind: 'unbind', operationId: 'unbind-1', expectedRevision: 1 }
const empty = { selectedTaskId: null, binding: { revision: 0, taskId: null } }

function fixture(t, enabled = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-091-lifecycle-')))
  const read = createScopeAuthority(), write = createScopeAuthority(), operatorAuthority = createScopeAuthority()
  const scope = read.grant(workspaceId), writer = write.grant(workspaceId), operator = operatorAuthority.grant(workspaceId)
  let current = { session, nextSourceSeq: 0 }
  acmi.provisionGraphRoot(root, workspaceId)
  const options = { root, workspaceId, read, write,
    ...(enabled ? { taskLifecycle: { operatorAuthority, currentSession: () => current } } : {}) }
  let store = acmi.openGraphStore(options)
  t.onTestFinished(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const source = { session: { ...session, adapterId: 'fixture' }, localSeq: 0, sourceRevision: 'fixture' }
  return {
    root, scope, writer, operator, operatorAuthority, options, get store() { return store },
    current(value) { current = value },
    reopen(useLifecycle = enabled) {
      store.close()
      store = acmi.openGraphStore(useLifecycle ? options : { root, workspaceId, read, write })
    },
    host() { return store.taskLifecycle(writer, operator) },
    append(taskId, change, key = change.kind) { return store.append(writer, taskId, { change, key, source }) },
    ingest(localSeq, detail, assignment) {
      const fact = { version: 'runtime-fact-v1', workspaceId, source: { session, localSeq, sourceRevision: 'epoch' },
        eventId: runtimeFactId(session, localSeq, sha), adapterVersion: 'fixture', runtimeVersion: 'fixture', provenance: 'runtime_observed', detail }
      return store.ingest(writer, fact, 0, assignment).attribution
    },
  }
}
const execute = (host, command, target = session) => host.execute(host.confirm(target, command))

test('task lifecycle is disabled unless the Host explicitly opts in', t => {
  const f = fixture(t, false)
  expect(() => f.host()).toThrow(/unavailable/)
})

test('writer, separate operator, live incarnation and opaque Host confirmation are all required', t => {
  const f = fixture(t)
  expect(() => f.store.taskLifecycle(f.scope, f.operator)).toThrow(/unavailable/)
  expect(() => f.store.taskLifecycle(f.writer, f.writer)).toThrow(/unavailable/)
  const host = f.host()
  expect(() => host.execute(create)).toThrow(/unavailable/)
  expect(() => host.confirm({ ...session, instanceId: 'foreign-workspace' }, create)).toThrow(/unavailable/)
  expect(() => host.confirm({ ...session, incarnation: '6' }, create)).toThrow(/unavailable/)
  expect(() => host.confirm(session, { ...create, taskId: absentTask })).toThrow(/invalid/)
  const approval = host.confirm(session, create)
  expect(() => f.host().execute(approval)).toThrow(/unavailable/)
  f.current({ session: { ...session, incarnation: '8' }, nextSourceSeq: 0 })
  expect(() => host.execute(approval)).toThrow(/unavailable/)
  f.current({ session, nextSourceSeq: 0 })
  f.operatorAuthority.revoke(f.operator)
  expect(() => host.execute(approval)).toThrow(/unavailable/)
})

test('changing the caller-owned configuration object does not replace the mounted Session authority', t => {
  const f = fixture(t)
  const newer = { ...session, incarnation: '8' }
  f.options.taskLifecycle.currentSession = () => ({ session: newer, nextSourceSeq: 0 })
  expect(() => f.host().confirm(newer, create)).toThrow(/unavailable/)
})

test('Create commits a Host-generated graph UUID without selecting or binding it and retries across restart', t => {
  const f = fixture(t)
  const host = f.host()
  const receipt = execute(host, create)
  expect(receipt.taskId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u)
  expect(f.store.read(f.scope, receipt.taskId)).toMatchObject({ revision: receipt.graphRevision,
    snapshot: { task: { objective: create.objective, criteria: create.criteria } } })
  expect(host.state(session)).toEqual(empty)
  expect(host.history(session)).toEqual([receipt])
  f.reopen()
  expect(execute(f.host(), create)).toEqual(receipt)
  expect(f.store.events(f.scope, receipt.taskId)).toHaveLength(1)
  expect(() => execute(f.host(), { ...create, objective: 'Changed on retry' })).toThrow(/conflict/)
})

test('Switch selects an existing open task without mutating Binding, and missing or closed tasks are denied', t => {
  const f = fixture(t)
  const host = f.host()
  expect(() => execute(host, select(absentTask))).toThrow(/unavailable/)
  expect(() => execute(host, bind(absentTask, 0))).toThrow(/unavailable/)
  f.append(otherTask, { kind: 'task-opened', objective: 'Existing task', criteria: ['Pass'] })
  const before = f.store.read(f.scope, otherTask)
  expect(execute(host, select(otherTask))).toMatchObject({ kind: 'switch', taskId: otherTask })
  expect(host.state(session)).toEqual({ ...empty, selectedTaskId: otherTask })
  expect(f.store.read(f.scope, otherTask)).toEqual(before)
  f.append(otherTask, { kind: 'node-added', nodeId: 'main', title: 'Main', role: 'work' })
  f.append(otherTask, { kind: 'mainline-advanced', nodeId: 'main' })
  for (const state of ['ready', 'running', 'completed']) {
    f.append(otherTask, { kind: 'work-transitioned', nodeId: 'main', state }, state)
  }
  f.append(otherTask, { kind: 'task-closed' })
  expect(() => execute(host, { ...select(otherTask), operationId: 'closed' })).toThrow(/unavailable/)
  expect(() => execute(host, bind(otherTask, 0))).toThrow(/unavailable/)
  expect(host.history(session)).toHaveLength(1)
})

test('Binding CAS is append-only and returns durable receipts for exact retries', t => {
  const f = fixture(t)
  const host = f.host()
  const taskId = execute(host, create).taskId
  const bound = execute(host, bind(taskId, 0))
  expect(bound).toMatchObject({ kind: 'bind', before: empty,
    after: { selectedTaskId: null, binding: { revision: 1, taskId } } })
  expect(() => execute(host, bind(taskId, 0, 'stale'))).toThrow(/revision/)
  expect(execute(host, select(taskId)).after.binding).toEqual({ revision: 1, taskId })
  const unbound = execute(host, unbind)
  expect(unbound).toMatchObject({ kind: 'unbind', after: { selectedTaskId: taskId, binding: { revision: 2, taskId: null } } })
  expect(execute(host, bind(taskId, 0))).toEqual(bound)
  expect(() => execute(host, { ...bind(taskId, 0), expectedRevision: 2 })).toThrow(/conflict/)
  expect(host.state(session)).toEqual(unbound.after)
  expect(host.history(session, 1, 2).map(r => [r.ordinal, r.kind])).toEqual([[2, 'bind'], [3, 'switch']])
  f.reopen()
  expect(f.host().state(session)).toEqual(unbound.after)
  expect(execute(f.host(), unbind)).toEqual(unbound)
})

test('Binding applies only from the approved native sequence and preserves original turn and tool attribution', t => {
  const f = fixture(t)
  const host = f.host()
  f.append(otherTask, { kind: 'task-opened', objective: 'Existing task', criteria: ['Pass'] })
  const assignment = { taskId: otherTask, nodeId: 'main' }
  const taskId = execute(host, create).taskId
  expect(f.ingest(0, { kind: 'turn-open', turn: 'old' }, assignment)).toMatchObject({ taskId: otherTask })
  expect(f.ingest(1, { kind: 'step-open', turn: 'old', step: '1' }, assignment)).toMatchObject({ taskId: otherTask })
  f.current({ session, nextSourceSeq: 2 })
  expect(execute(host, bind(taskId, 0)).effectiveFrom).toBe(2)
  expect(f.ingest(2, { kind: 'step-close', turn: 'old', step: '1' })).toEqual({ kind: 'assigned', taskId: otherTask, via: 'original-turn' })
  expect(f.ingest(3, { kind: 'turn-open', turn: 'new' })).toEqual({ kind: 'assigned', taskId, via: 'explicit-binding' })
  expect(f.ingest(4, { kind: 'tool-call', turn: 'new', step: '1', callId: 'call' })).toMatchObject({ taskId })
  f.current({ session, nextSourceSeq: 5 })
  expect(execute(host, unbind).effectiveFrom).toBe(5)
  f.reopen()
  expect(f.ingest(5, { kind: 'tool-result', turn: 'new', step: '1', callId: 'call', callSeq: 4 })).toEqual({ kind: 'assigned', taskId, via: 'original-call' })
  expect(f.ingest(6, { kind: 'turn-complete', turn: 'new' })).toEqual({ kind: 'assigned', taskId, via: 'original-turn' })
  expect(f.ingest(7, { kind: 'turn-open', turn: 'later' }, assignment)).toEqual({ kind: 'unassigned', reason: 'unbound' })
  expect(f.store.cursor(f.scope, session)).toMatchObject({ next: 8, bindingRevision: 0 })
  expect(() => f.ingest(8, { kind: 'binding', taskId: otherTask, revision: 1 })).toThrow(/conflict/)
})

test('Approval cannot backdate Binding over already-ingested facts or mix with a native binding', t => {
  const f = fixture(t)
  const host = f.host()
  const taskId = execute(host, create).taskId
  const approval = host.confirm(session, bind(taskId, 0))
  f.ingest(0, { kind: 'unmapped' })
  f.current({ session, nextSourceSeq: 1 })
  expect(() => host.execute(approval)).toThrow(/revision/)
  f.ingest(1, { kind: 'binding', taskId, revision: 1 })
  f.current({ session, nextSourceSeq: 2 })
  expect(() => execute(host, bind(taskId, 0))).toThrow(/conflict/)
  expect(host.state(session)).toEqual(empty)
})

test('first Host binding requires a fully drained Session, so queued native Binding cannot deadlock ingestion', t => {
  const f = fixture(t)
  const host = f.host()
  const taskId = execute(host, create).taskId
  f.current({ session, nextSourceSeq: 2 })
  expect(() => execute(host, bind(taskId, 0))).toThrow(/revision/)
  f.ingest(0, { kind: 'unmapped' })
  f.ingest(1, { kind: 'binding', taskId, revision: 1 })
  expect(f.store.cursor(f.scope, session)).toMatchObject({ next: 2, bindingRevision: 1 })
  expect(() => execute(host, bind(taskId, 0))).toThrow(/conflict/)
  expect(host.state(session)).toEqual(empty)
})

test('Binding is partitioned by incarnation and remains authoritative when reopened without a Host writer', t => {
  const f = fixture(t)
  const host = f.host()
  const taskId = execute(host, create).taskId
  execute(host, bind(taskId, 0))
  const newer = { ...session, incarnation: '8' }
  f.current({ session: newer, nextSourceSeq: 0 })
  expect(host.state(newer)).toEqual(empty)
  expect(host.history(newer)).toEqual([])
  expect(() => host.state(session)).toThrow(/unavailable/)
  f.reopen(false)
  expect(() => f.host()).toThrow(/unavailable/)
  expect(f.ingest(0, { kind: 'turn-open', turn: 'retained' })).toEqual({ kind: 'assigned', taskId, via: 'explicit-binding' })
  expect(() => f.ingest(1, { kind: 'binding', taskId, revision: 1 })).toThrow(/conflict/)
})

test('SQLite failure after Task append rolls back both creation and its receipt', t => {
  const f = fixture(t)
  f.store.close()
  const db = new DatabaseSync(join(f.root, 'graph.sqlite'))
  try {
    db.exec(`CREATE TRIGGER fail_task_lifecycle BEFORE INSERT ON task_lifecycle_receipt
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`)
  } finally { db.close() }
  f.reopen()
  expect(() => execute(f.host(), create)).toThrow(/io/)
  expect(f.host().history(session)).toEqual([])
  f.store.close()
  const inspection = new DatabaseSync(join(f.root, 'graph.sqlite'))
  try {
    expect(inspection.prepare('SELECT count(*) AS n FROM graph_event').get().n).toBe(0)
    inspection.exec('DROP TRIGGER fail_task_lifecycle')
  } finally { inspection.close() }
  f.reopen()
  expect(execute(f.host(), create)).toMatchObject({ kind: 'create', ordinal: 1 })
})
