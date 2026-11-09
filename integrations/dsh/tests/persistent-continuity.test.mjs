import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, statSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { createScopeAuthority } from '@acmi/core'
import * as Acmi from '../src/index.ts'

const taskA = '08100000-0000-4000-8000-000000000001'
const taskB = '08100000-0000-4000-8000-000000000002'
const workspaceId = 'isolated-081'
const sha = value => createHash('sha256').update(value).digest('hex')
function setup(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-081-store-')))
  const root = join(base, 'graph')
  mkdirSync(root)
  t.onTestFinished(() => rmSync(base, { recursive: true, force: true }))
  const read = createScopeAuthority()
  const write = createScopeAuthority()
  const scope = read.grant(workspaceId)
  const writer = write.grant(workspaceId)
  Acmi.provisionGraphRoot(root, workspaceId)
  const open = () => Acmi.openGraphStore({ root, workspaceId, read, write })
  return { root, scope, writer, read, write, open }
}
const session = { adapterId: 'dsh', instanceId: workspaceId, sessionId: 'one', incarnation: '1' }
const ref = (localSeq, identity = session) => ({ session: identity, sourceRevision: 'stable-epoch', localSeq })
const hostRef = n => ref(n, { ...session, adapterId: 'acmi-host' })
const fact = (seq, detail, identity = session) => ({
  version: 'runtime-fact-v1', eventId: sha(JSON.stringify([identity.adapterId, identity.instanceId, identity.sessionId, identity.incarnation, seq])),
  workspaceId, source: ref(seq, identity), runtimeVersion: '0.2.2-rc.1', adapterVersion: '0.8.1',
  provenance: 'runtime_observed', detail,
})
function seed(store, writer, taskId) {
  for (const [i, change] of [
    { kind: 'task-opened', objective: 'Task ' + taskId, criteria: ['Pass'] },
    { kind: 'node-added', nodeId: 'work', title: 'Active stage', role: 'work' },
    { kind: 'mainline-advanced', nodeId: 'work' },
    { kind: 'work-transitioned', nodeId: 'work', state: 'ready' },
    { kind: 'work-transitioned', nodeId: 'work', state: 'running' },
  ].entries()) store.append(writer, taskId, { change, source: hostRef(i), key: 'seed-' + i })
}

test('durable append, idempotency, writer isolation and checkpoint suffix restoration', t => {
  const f = setup(t)
  const store = f.open()
  try {
    seed(store, f.writer, taskA)
    expect(() => f.open()).toThrow(/busy/)
    expect(store.read(f.write.grant(workspaceId), taskA)).toBeNull()
    const head = store.read(f.scope, taskA)
    store.checkpoint(f.writer, taskA, head.revision)
    const draft = { change: { kind: 'work-progressed', nodeId: 'work', summary: 'Durable update' }, source: hostRef(5), key: 'retry' }
    const first = store.append(f.writer, taskA, draft, head.revision)
    expect(store.append(f.writer, taskA, draft, head.revision)).toEqual({ ...first, status: 'duplicate' })
    expect(() => store.append(f.writer, taskA, { ...draft, change: { ...draft.change, summary: 'Conflicting payload' } })).toThrow(/conflict/)
    expect(() => store.append(f.writer, taskA, { ...draft, key: 'stale' }, head.revision)).toThrow(/revision/)
    const expected = store.read(f.scope, taskA)
    store.close()
    const recovered = f.open()
    try {
      expect(recovered.read(f.scope, taskA)).toEqual(expected)
      expect(recovered.metrics().replayed).toBe(1)
    } finally { recovered.close() }
  } finally { store.close() }
})

test('only validated native call causality overrides a later explicit binding', t => {
  const f = setup(t)
  const store = f.open()
  try {
    seed(store, f.writer, taskA)
    seed(store, f.writer, taskB)
    const add = (seq, detail) => store.ingest(f.writer, fact(seq, detail), 0)
    expect(() => add(1, { kind: 'binding', taskId: taskA, revision: 1 })).toThrow(/gap/)
    add(0, { kind: 'binding', taskId: taskA, revision: 1 })
    add(1, { kind: 'tool-call', turn: 't1', step: 's1', callId: 'tool' })
    add(2, { kind: 'binding', taskId: taskB, revision: 2 })
    expect(add(3, { kind: 'tool-result', turn: 't1', step: 's1', callId: 'tool', callSeq: 1 }))
      .toMatchObject({ attribution: { kind: 'assigned', taskId: taskA, via: 'original-call' } })
    expect(add(3, { kind: 'tool-result', turn: 't1', step: 's1', callId: 'tool', callSeq: 1 }).status).toBe('duplicate')
    expect(add(4, { kind: 'tool-result', turn: 't1', step: 's1', callId: 'tool', callSeq: 1 }).attribution.kind).toBe('unassigned')
    add(5, { kind: 'binding', taskId: taskA, revision: 3 })
    expect(add(6, { kind: 'assistant', turn: 't1', step: 's1' }).attribution.taskId).toBe(taskA)
    expect(store.cursor(f.scope, session).next).toBe(7)
    expect(store.facts(f.scope, taskB)).toHaveLength(0)
    expect(store.facts(f.scope, taskA).map(x => x.fact.detail.kind)).toEqual(['tool-call', 'tool-result', 'assistant'])
    expect(() => store.ingest(f.writer, { ...fact(7, { kind: 'user' }), message: 'raw' }, 0)).toThrow(/invalid/)
  } finally { store.close() }
})

test('requires explicit, revision-bound review and retains rejection across restart', t => {
  const f = setup(t)
  const store = f.open()
  try {
    seed(store, f.writer, taskA)
    store.ingest(f.writer, fact(0, { kind: 'binding', taskId: taskA, revision: 1 }), 0)
    store.ingest(f.writer, fact(1, { kind: 'assistant', turn: 't1', step: 's1' }), 0)
    const snapshot = store.read(f.scope, taskA)
    expect(Acmi.analyzeTaskDelta(snapshot, store.facts(f.scope, taskA), null))
      .toMatchObject({ status: 'unresolved', reason: 'invalid-suggestion' })
    const result = Acmi.analyzeTaskDelta(snapshot, store.facts(f.scope, taskA), {
      kind: 'next-action', evidenceId: fact(1, { kind: 'assistant', turn: 't1', step: 's1' }).eventId, text: 'Verified proposal only',
    })
    expect(result.status).toBe('proposed')
    expect(Acmi.analyzeTaskDelta(snapshot, store.facts(f.scope, taskA), result.proposal.suggestion).proposal.id).toBe(result.proposal.id)
    expect(store.read(f.scope, taskA)).toEqual(snapshot)
    expect(() => store.review(f.scope, result.proposal, 'accept')).toThrow(/unavailable/)
    expect(store.review(f.writer, result.proposal, 'reject').status).toBe('rejected')
    store.close()
    const recovered = f.open()
    try {
      expect(recovered.review(f.writer, result.proposal, 'accept').status).toBe('rejected')
      expect(recovered.read(f.scope, taskA)).toEqual(snapshot)
    } finally { recovered.close() }
  } finally { store.close() }
})

test('recovers a hot rollback journal after process exit and refuses a truncated database', t => {
  const f = setup(t)
  const store = f.open()
  seed(store, f.writer, taskA)
  const baseline = store.read(f.scope, taskA)
  store.checkpoint(f.writer, taskA, baseline.revision)
  store.close()
  const file = join(f.root, 'graph.sqlite')
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/phase-081-child.mjs', import.meta.url))], {
    encoding: 'utf8', input: JSON.stringify({ mode: 'crash', file }), timeout: 8000,
  })
  expect(child.status, child.stderr).toBe(17)
  expect(child.stdout).toContain('transaction open')
  expect(statSync(file + '-journal').size).toBeGreaterThan(0)
  const recovered = f.open()
  expect(recovered.read(f.scope, taskA)).toEqual(baseline)
  recovered.close()
  truncateSync(file, 200)
  expect(() => f.open()).toThrow(/corrupt/)
})

test('bad checkpoint falls back to the event stream, while a bad committed suffix fails closed', t => {
  const f = setup(t)
  const store = f.open()
  seed(store, f.writer, taskA)
  const expected = store.read(f.scope, taskA)
  store.checkpoint(f.writer, taskA, expected.revision)
  store.close()
  const db = new DatabaseSync(join(f.root, 'graph.sqlite'))
  db.exec("UPDATE graph_checkpoint SET hash='bad'")
  db.close()
  const restored = f.open()
  expect(restored.read(f.scope, taskA)).toEqual(expected)
  expect(restored.metrics().replayed).toBe(5)
  restored.close()
  const broken = new DatabaseSync(join(f.root, 'graph.sqlite'))
  broken.exec("UPDATE graph_event SET hash='bad' WHERE seq=5")
  broken.close()
  const corrupted = f.open()
  try {
    expect(corrupted.read(f.read.grant('foreign'), taskA)).toBeNull()
    expect(() => corrupted.read(f.scope, taskA)).toThrow(/corrupt/)
  } finally { corrupted.close() }
})

test('explicit full audit detects corruption below a valid checkpoint anchor', t => {
  const f = setup(t)
  const store = f.open()
  seed(store, f.writer, taskA)
  const expected = store.read(f.scope, taskA)
  store.checkpoint(f.writer, taskA, expected.revision)
  store.close()
  const db = new DatabaseSync(join(f.root, 'graph.sqlite'))
  db.exec("UPDATE graph_event SET hash='bad' WHERE seq=2")
  db.close()
  const recovered = f.open()
  try {
    expect(recovered.read(f.scope, taskA)).toEqual(expected)
    expect(() => recovered.audit(f.scope, taskA)).toThrow(/corrupt/)
    expect(recovered.peek(f.scope, taskA)).toBeNull()
    expect(() => recovered.read(f.scope, taskA)).toThrow(/corrupt/)
  } finally { recovered.close() }
})

test('a confirmed multi-change proposal is atomic, while stale or tampered proposals cannot write', t => {
  const f = setup(t)
  const store = f.open()
  try {
    seed(store, f.writer, taskA)
    store.ingest(f.writer, fact(0, { kind: 'binding', taskId: taskA, revision: 1 }), 0)
    store.ingest(f.writer, fact(1, { kind: 'assistant', turn: 't1', step: 's1' }), 0)
    const cut = store.read(f.scope, taskA)
    const evidenceId = store.facts(f.scope, taskA).at(-1).fact.eventId
    const propose = suggestion => Acmi.analyzeTaskDelta(cut, store.facts(f.scope, taskA), { evidenceId, ...suggestion }).proposal
    const proposal = propose({ kind: 'decompose', parent: 'work', stages: [{ id: 'child', title: 'Explicit child stage' }] })
    const stale = propose({ kind: 'next-action', text: 'Stale text' })
    expect(() => store.review(f.writer, { ...proposal, changes: [{ kind: 'task-closed' }] }, 'accept')).toThrow(/invalid/)
    expect(store.read(f.scope, taskA)).toEqual(cut)
    const accepted = store.review(f.writer, proposal, 'accept')
    expect(accepted.status).toBe('accepted')
    expect(store.review(f.writer, proposal, 'accept')).toEqual(accepted)
    expect(store.read(f.scope, taskA).snapshot.nodes.map(n => n.id)).toEqual(['work', 'child'])
    expect(() => store.review(f.writer, stale, 'accept')).toThrow(/revision/)
    expect(store.events(f.scope, taskA, 6).every(e => e.proposalId === proposal.id && e.provenance === 'host_confirmed')).toBe(true)
  } finally { store.close() }
})

test('causally terminates the original turn across a binding switch and refuses foreign evidence', t => {
  const f = setup(t)
  const store = f.open()
  try {
    seed(store, f.writer, taskA)
    seed(store, f.writer, taskB)
    const ingest = (seq, detail, assignment) => store.ingest(f.writer, fact(seq, detail), 0, assignment)
    ingest(0, { kind: 'binding', taskId: taskA, revision: 1 })
    ingest(1, { kind: 'turn-open', turn: 'turn-a' }, { taskId: taskA, nodeId: 'work' })
    ingest(2, { kind: 'binding', taskId: taskB, revision: 2 })
    expect(ingest(3, { kind: 'turn-complete', turn: 'turn-a' }).attribution)
      .toEqual({ kind: 'assigned', taskId: taskA, via: 'original-turn' })
    expect(store.read(f.scope, taskA).snapshot.executions.at(-1).state).toBe('completed')
    expect(store.read(f.scope, taskB).snapshot.executions).toEqual([])
    expect(() => store.append(f.writer, taskB, { key: 'bad', source: ref(1),
      change: { kind: 'task-reframed', objective: 'Foreign objective', criteria: ['wrong scope'] } })).toThrow(/invalid/)
  } finally { store.close() }
})

test('SQLITE_FULL rolls back an unacknowledged graph append without changing the last receipt', t => {
  const f = setup(t)
  const store = Acmi.openGraphStore({ root: f.root, workspaceId, read: f.read, write: f.write, maxPages: 24 })
  let expected
  let refused = false
  try {
    seed(store, f.writer, taskA)
    for (let i = 0; i < 40; i++) {
      expected = store.read(f.scope, taskA)
      try {
        store.append(f.writer, taskA, { key: 'fill-' + i, source: hostRef(i + 20),
          change: { kind: 'evidence-recorded', content: { kind: 'constraint', text: 'x'.repeat(8000) } } })
      } catch (error) {
        expect(error.code).toBe('limit')
        refused = true
        break
      }
    }
    expect(refused).toBe(true)
    expect(store.read(f.scope, taskA)).toEqual(expected)
  } finally { store.close() }
  const restored = f.open()
  try { expect(restored.read(f.scope, taskA)).toEqual(expected) } finally { restored.close() }
})
