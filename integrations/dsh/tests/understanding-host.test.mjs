import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, vi } from 'vitest'
import { createScopeAuthority, runtimeFactId } from '@acmi/core'
const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')

const sha = value => createHash('sha256').update(value).digest('hex')
const taskId = '09000000-0000-4000-8000-000000000001'
const workspaceId = 'phase09-test'
const session = { adapterId: 'fixture', instanceId: workspaceId, sessionId: 'synthetic', incarnation: '1' }
const source = seq => ({ session, localSeq: seq, sourceRevision: 'epoch' })
const runtime = (seq, detail) => ({ version: 'runtime-fact-v1', workspaceId, source: source(seq),
  eventId: runtimeFactId(session, seq, sha), adapterVersion: 'fixture', runtimeVersion: 'fixture', provenance: 'runtime_observed', detail })
const decision = { decision: 'accept', reviewerId: 'operator', reason: 'Checked evidence and diff' }
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-09-host-')))
  const read = createScopeAuthority(), write = createScopeAuthority()
  const scope = read.grant(workspaceId), writer = write.grant(workspaceId)
  acmi.provisionGraphRoot(root, workspaceId)
  const open = () => acmi.openGraphStore({ root, workspaceId, read, write, understanding: true })
  const store = open()
  t.onTestFinished(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const append = (change, key) => store.append(writer, taskId, { change, key, source: source(0) })
  append({ kind: 'task-opened', objective: 'Create parser', criteria: ['Pass'] }, 'task')
  append({ kind: 'node-added', nodeId: 'root', title: 'Work', role: 'work' }, 'root')
  append({ kind: 'node-added', nodeId: 'child', title: 'Child', role: 'work' }, 'child')
  append({ kind: 'mainline-advanced', nodeId: 'root' }, 'active')
  const add = (seq, detail = { kind: 'user' }) => {
    const fact = runtime(seq, detail)
    store.ingest(writer, fact, 0, { taskId, nodeId: 'root' })
    return fact.eventId
  }
  const request = (id, text = 'split into: audit; verify') => ({
    synthetic: true, taskId, currentTaskId: taskId, candidates: [{ taskId, alias: 'parser' }], anchorId: id,
    evidenceIds: [id], user: { evidenceId: id, text, provenance: 'synthetic_host_excerpt' },
  })
  return { store, scope, writer, append, add, open, request, root }
}

test('persisted diff requires Host review and atomically advances the graph with an idempotent receipt', t => {
  const f = fixture(t)
  const req = f.request(f.add(0))
  const before = f.store.read(f.scope, taskId)
  const item = f.store.stageUnderstanding(f.scope, f.writer, req)
  expect(f.store.read(f.scope, taskId)).toEqual(before)
  expect(f.store.listUnderstanding(f.scope, taskId)).toEqual([item])
  expect(f.store.listUnderstanding(f.writer, taskId)).toEqual([])
  expect(() => f.store.reviewUnderstanding(f.scope, item.proposal.id, decision)).toThrow(/unavailable/)
  const receipt = f.store.reviewUnderstanding(f.writer, item.proposal.id, decision)
  expect(receipt.status).toBe('accepted')
  expect(receipt.acceptedChangeIds).toEqual(item.proposal.changes.map(x => x.id))
  expect(f.store.read(f.scope, taskId).snapshot.nodes).toHaveLength(4)
  expect(f.store.events(f.scope, taskId).slice(-4).every(x => x.proposalId === item.proposal.id)).toBe(true)
  const replay = f.store.stageUnderstanding(f.scope, f.writer, req)
  expect(replay.proposal.id).toBe(item.proposal.id)
  expect(replay.review).toEqual(receipt)
  f.store.close()
  const recovered = f.open()
  try { expect(recovered.reviewUnderstanding(f.writer, item.proposal.id, decision)).toEqual(receipt) }
  finally { recovered.close() }
})

test('stale revisions are terminal and an invalid batch never applies a valid prefix', t => {
  const f = fixture(t)
  f.append({ kind: 'edge-added', from: 'child', to: 'root', relation: 'depends_on' }, 'edge')
  const req = f.request(f.add(0), 'continue: establish a dependency')
  const before = f.store.read(f.scope, taskId)
  const batch = JSON.stringify([{ kind: 'next-action', text: 'Run checks' }, { kind: 'dependency', from: 'root', to: 'child' }])
  const item = f.store.stageUnderstanding(f.scope, f.writer, req, batch)
  expect(item.risks).toContain('edge-cycle')
  expect(f.store.reviewUnderstanding(f.writer, item.proposal.id, decision).status).toBe('conflicted')
  expect(f.store.read(f.scope, taskId)).toEqual(before)
  const good = f.store.stageUnderstanding(f.scope, f.writer, f.request(f.add(1)))
  f.add(2)
  const current = f.store.read(f.scope, taskId)
  expect(f.store.reviewUnderstanding(f.writer, good.proposal.id, decision)).toMatchObject({ status: 'conflicted', reason: 'stale-revision' })
  expect(f.store.read(f.scope, taskId)).toEqual(current)
})

test('missing evidence, unauthorized candidate and arbitrary UUID never reach the inbox', t => {
  const f = fixture(t)
  expect(() => f.store.stageUnderstanding(f.scope, f.writer, f.request(sha('not-stored')))).toThrow(/invalid/)
  const req = f.request(f.add(0))
  expect(() => f.store.stageUnderstanding(f.scope, f.writer, { ...req,
    candidates: [...req.candidates, { taskId: '09000000-0000-4000-8000-000000000002', alias: 'absent' }],
  })).toThrow(/unavailable/)
  expect(f.store.listUnderstanding(f.scope, taskId)).toEqual([])
})

test('mixed required-join/dependency cycles and branching mainline successors are rejected', t => {
  const f = fixture(t)
  f.append({ kind: 'node-added', nodeId: 'join', title: 'Gate', role: 'join' }, 'gate')
  f.append({ kind: 'edge-added', from: 'root', to: 'join', relation: 'joins_into' }, 'required')
  f.append({ kind: 'edge-added', from: 'root', to: 'join', relation: 'continues_as' }, 'mainline')
  const req = f.request(f.add(0), 'continue: revise graph')
  const stage = value => f.store.stageUnderstanding(f.scope, f.writer, req, JSON.stringify([value]))
  expect(stage({ kind: 'dependency', from: 'root', to: 'join' }).risks).toContain('gating-cycle')
  expect(stage({ kind: 'successor', from: 'root', to: 'child' }).risks).toContain('mainline-cardinality')
})

test('reviewed rejection of a previously accepted result prevents it from satisfying a join', t => {
  const f = fixture(t)
  const add = change => f.append(change, 'join-' + JSON.stringify(change))
  add({ kind: 'node-added', nodeId: 'gate', title: 'Gate', role: 'join' })
  add({ kind: 'edge-added', from: 'child', to: 'gate', relation: 'joins_into' })
  add({ kind: 'work-transitioned', nodeId: 'child', state: 'ready' })
  add({ kind: 'work-transitioned', nodeId: 'child', state: 'running' })
  add({ kind: 'execution-started', nodeId: 'child', executionId: 'run', agentId: 'fixture' })
  add({ kind: 'result-produced', nodeId: 'child', executionId: 'run', resultId: 'r', summary: 'Report', verified: true })
  add({ kind: 'execution-transitioned', executionId: 'run', state: 'completed' })
  add({ kind: 'work-transitioned', nodeId: 'child', state: 'completed' })
  for (const stage of ['available', 'inspected', 'consumed', 'accepted']) {
    add({ kind: 'result-reviewed', nodeId: 'gate', resultId: 'r', stage })
  }
  const req = f.request(f.add(0), 'continue: reject r for gate')
  const item = f.store.stageUnderstanding(f.scope, f.writer, req,
    JSON.stringify([{ kind: 'result-assessment', nodeId: 'gate', resultId: 'r', state: 'rejected', text: 'Report rejected' }]))
  expect(item.risks).toEqual([])
  expect(f.store.reviewUnderstanding(f.writer, item.proposal.id, decision).status).toBe('accepted')
  expect(f.store.read(f.scope, taskId).snapshot.reviews[0]).toMatchObject({ stage: 'accepted', disposition: 'rejected' })
  expect(() => add({ kind: 'join-satisfied', nodeId: 'gate' })).toThrow(/invalid/)
})

test('incremental worker preserves user boundaries, coalesces noise and resumes its durable cursor', async t => {
  const f = fixture(t)
  const first = f.add(0, { kind: 'unmapped' })
  const second = f.add(1)
  const third = f.add(2)
  const excerpts = new Map([[second, 'continue'], [third, 'thanks']])
  const options = {
    enabled: true, synthetic: true, store: f.store, scope: f.scope, writer: f.writer, debounceMs: 2,
    targets: [{ taskId, candidates: [{ taskId, alias: 'parser' }], currentTaskId: taskId }],
    excerpt: id => excerpts.get(id),
  }
  expect(acmi.startUnderstandingRuntime({ ...options, enabled: false })).toBeNull()
  const worker = acmi.startUnderstandingRuntime(options)
  try {
    await vi.waitFor(() => expect(f.store.listUnderstanding(f.scope, taskId)).toHaveLength(2))
    expect(worker.metrics()).toMatchObject({ analyses: 2, providerRequests: 0, active: 0 })
    const inbox = f.store.listUnderstanding(f.scope, taskId)
    expect(inbox.map(x => x.proposal.intent.kind)).toEqual(['no_task', 'continue_current'])
    expect(inbox.every(x => x.proposal.evidence.every(e => e.eventId !== first))).toBe(true)
    expect(f.store.understandingPage(f.scope, taskId).facts).toEqual([])
  } finally { await worker.stop() }
  const cursor = f.store.understandingPage(f.scope, taskId).through
  f.store.close()
  const reopened = f.open()
  const restarted = acmi.startUnderstandingRuntime({ ...options, store: reopened })
  try {
    expect(reopened.understandingPage(f.scope, taskId)).toMatchObject({ after: cursor, through: cursor, facts: [] })
    await vi.waitFor(() => expect(restarted.metrics().quanta).toBeGreaterThan(0))
    expect(restarted.metrics().analyses).toBe(0)
    expect(reopened.listUnderstanding(f.scope, taskId)).toHaveLength(2)
  } finally { await restarted.stop(); reopened.close() }
})

test('receipt insert failure rolls back the already inserted graph batch, and retry commits once', t => {
  const f = fixture(t)
  const item = f.store.stageUnderstanding(f.scope, f.writer, f.request(f.add(0)))
  const before = f.store.read(f.scope, taskId)
  f.store.close()
  const edit = sql => {
    const db = new DatabaseSync(join(f.root, 'graph.sqlite'))
    try { db.exec(sql) } finally { db.close() }
  }
  edit("CREATE TRIGGER fail_receipt BEFORE INSERT ON understanding_review BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END;")
  let store = f.open()
  try {
    expect(() => store.reviewUnderstanding(f.writer, item.proposal.id, decision)).toThrow(/io/)
    expect(store.read(f.scope, taskId)).toEqual(before)
    expect(store.listUnderstanding(f.scope, taskId)[0].review).toBeUndefined()
  } finally { store.close() }
  edit('DROP TRIGGER fail_receipt')
  store = f.open()
  try {
    const receipt = store.reviewUnderstanding(f.writer, item.proposal.id, decision)
    expect(receipt.status).toBe('accepted')
    expect(store.reviewUnderstanding(f.writer, item.proposal.id, decision)).toEqual(receipt)
    expect(store.events(f.scope, taskId).filter(row => row.proposalId === item.proposal.id)).toHaveLength(4)
  } finally { store.close() }
})

test('staged IDs are stable, superseded and expired proposals cannot apply, and explicit rejection is durable', t => {
  const f = fixture(t)
  const id = f.add(0)
  const old = f.store.stageUnderstanding(f.scope, f.writer, f.request(id, 'continue'))
  expect(f.store.stageUnderstanding(f.scope, f.writer, f.request(id, 'continue'))).toEqual(old)
  const next = f.store.stageUnderstanding(f.scope, f.writer, f.request(id))
  expect(next.proposal.id).not.toBe(old.proposal.id)
  const before = f.store.read(f.scope, taskId)
  expect(f.store.reviewUnderstanding(f.writer, old.proposal.id, decision).status).toBe('superseded')
  expect(f.store.reviewUnderstanding(f.writer, next.proposal.id, { ...decision, decision: 'reject' }).status).toBe('rejected')
  const timed = f.store.stageUnderstanding(f.scope, f.writer, { ...f.request(id, 'continue: next action: check'), ttlMs: 100 })
  const clock = vi.spyOn(Date, 'now').mockReturnValue(timed.proposal.expiresAt)
  try { expect(f.store.reviewUnderstanding(f.writer, timed.proposal.id, decision).status).toBe('expired') }
  finally { clock.mockRestore() }
  expect(f.store.read(f.scope, taskId)).toEqual(before)
})

test('analysis timeout has bounded retries and leaves its evidence cursor unadvanced', async t => {
  const f = fixture(t)
  const id = f.add(0)
  const worker = acmi.startUnderstandingRuntime({ enabled: true, synthetic: true,
    store: f.store, scope: f.scope, writer: f.writer, debounceMs: 1, attemptMs: 20, retries: 1,
    targets: [{ taskId, candidates: [{ taskId, alias: 'parser' }], currentTaskId: taskId }],
    excerpt: () => 'continue', script: [{ evidenceId: id, json: '[]', delayMs: 200 }],
  })
  try {
    await vi.waitFor(() => expect(worker.status(taskId)).toMatchObject({ degraded: true, error: 'timeout' }))
    expect(worker.metrics()).toMatchObject({ analyses: 0, mockRequests: 2, retryCount: 1, highWater: 1, providerRequests: 0 })
    expect(f.store.understandingPage(f.scope, taskId).after).toBe(0)
    expect(f.store.listUnderstanding(f.scope, taskId)).toEqual([])
  } finally { await worker.stop() }
})

test('a durable tool result is not lost behind a later turn completion in one page', async t => {
  const f = fixture(t)
  f.add(0, { kind: 'turn-open', turn: 't' })
  f.add(1, { kind: 'tool-call', turn: 't', step: 's', callId: 'c' })
  const resultId = f.add(2, { kind: 'tool-result', turn: 't', step: 's', callId: 'c', callSeq: 1 })
  f.add(3, { kind: 'turn-complete', turn: 't' })
  const worker = acmi.startUnderstandingRuntime({ enabled: true, synthetic: true, store: f.store, scope: f.scope, writer: f.writer,
    targets: [{ taskId, candidates: [] }], script: [{ evidenceId: resultId, json: '[{"kind":"next-action","text":"Review tool result"}]' }],
  })
  try {
    await vi.waitFor(() => expect(worker.metrics().analyses).toBe(2))
    const items = f.store.listUnderstanding(f.scope, taskId)
    expect(items.some(item => item.proposal.changes.some(c => c.evidenceId === resultId))).toBe(true)
    expect(f.store.understandingPage(f.scope, taskId).facts).toEqual([])
  } finally { await worker.stop() }
})
