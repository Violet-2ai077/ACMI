import test from 'node:test'
import assert from 'node:assert/strict'
import { hash } from '../protocol/contracts.mjs'
import { operationTable, fixedResourceProof } from '../execution/fixed-workload-contract.mjs'
import { runSyntheticBridge, superviseSynthetic } from '../execution/offline-measurement-bridge.mjs'
import { createLedgerAdapter } from '../execution/guarded-comparator-adapter.mjs'

function events() {
  const capture = (channel, bytes) => ({ kind: 'capture', value: { attemptId: 'a', channel,
    bytes_base64: bytes.toString('base64'), sha256: hash(bytes), elapsedMs: 0 } })
  const raw = Buffer.from('x')
  return [{ kind: 'reserve', value: { attemptId: 'a' } },
    capture('transport', Buffer.from(JSON.stringify({ kind: 'wire_delivery', index: 0, byte_length: 1, sha256: hash(raw) }))),
    capture('wire', raw), capture('model', raw),
    { kind: 'settle', value: { attemptId: 'a', outcome: 'success' } }]
}
test('tables retain raw-first groups, complete audit operations and read denominator', () => {
  const t = operationTable(events(), 'P-H')
  assert.equal(t.reads, 1); assert.equal(t.events, 5)
  assert.deepEqual(t.operations.filter(o => o.read_id).map(o => o.event_indices), [[1, 2], [3]])
  assert.ok(t.operations.some(o => o.kind === 'materialize'))
  assert.ok(t.operations.some(o => o.kind === 'persist'))
  assert.equal(t.denominator, 'nonempty-original-deliveries')
  assert.equal(t.original_v4_nominal_append_scans, 2)
  assert.ok(t.original_v4_nominal_append_scan_bytes < t.original_v4_append_scan_bytes_upper)
  const bad = events(); bad[2].value.sha256 = 'f'.repeat(64)
  assert.throws(() => operationTable(bad, 'P-L'), /payload|delivery/)
  const missing = events(); missing.splice(1, 1)
  assert.throws(() => operationTable(missing, 'P-L'), /unpaired/)
})
test('fixed disk arithmetic is not a heap or time proof and does not claim live closure', () => {
  const x = fixedResourceProof([{ id: 'P-L', journal_bytes: 100, operation_bytes: 10, result_bytes: 20 },
    { id: 'P-H', journal_bytes: 200, operation_bytes: 10, result_bytes: 20 },
    { id: 'P-G', journal_bytes: 300, operation_bytes: 10, result_bytes: 20 }],
  { disk_bytes: 100000, shared_bytes: 100, failure_reserve_bytes: 1000, heap_proof: null, time_proof: null })
  assert.equal(x.fixed_disk_sufficient, true)
  assert.equal(x.status, 'BLOCKED'); assert.equal(x.capacity_closed, false)
  assert.ok(x.blockers.includes('runtime_heap_bound_unproved'))
})
test('synthetic bridge refuses missing operations, failed durability and real clocks', async () => {
  const operations = [{ id: 0, kind: 'compile', read_id: null }, { id: 1, kind: 'capture', read_id: 'r1' },
    { id: 2, kind: 'audit', read_id: null }, { id: 3, kind: 'materialize', read_id: null }, { id: 4, kind: 'persist', read_id: null }]
  let now = 0
  const clock = { kind: 'synthetic', now: () => now }
  const expected_operations_hash = hash(operations)
  const execute = async op => { now += 2; return { operation_id: op.id, completed: true, durable: op.kind === 'persist',
    output_hash: hash(op), scans: ['audit', 'materialize'].includes(op.kind) ? 1 : 0, scan_bytes: ['audit', 'materialize'].includes(op.kind) ? 10 : 0 } }
  const r = await runSyntheticBridge({ operations, expected_operations_hash, clock, execute })
  assert.equal(r.wall_ms, 10); assert.equal(r.compile_ms, 2); assert.equal(r.materialize_ms, 2)
  assert.equal(r.full_scans, 2); assert.deepEqual(r.read_ms, [2])
  await assert.rejects(runSyntheticBridge({ operations, expected_operations_hash, clock: { ...clock, kind: 'real' }, execute }), /synthetic/)
  await assert.rejects(runSyntheticBridge({ operations, expected_operations_hash, clock, execute: async op => ({ ...await execute(op), operation_id: 9 }) }), /operation/)
  await assert.rejects(runSyntheticBridge({ operations, expected_operations_hash, clock, execute: async op => ({ ...await execute(op), durable: false }) }), /durable/)
})
const policy = { disk_bytes: 100, rss_bytes: 100, child_ms: 100, cleanup_ms: 5 }
const e = (kind, rest = {}) => ({ kind, ...rest })
test('original v4 adapter scatters batches without deleting durable captures or disguising failure', () => {
  const calls = [], seen = []
  const factory = options => {
    assert.equal(options.storageProtocol, undefined)
    return { path: 'synthetic', capture(x) { seen.push(x); if (x.fail) throw Error('write failed'); return 'id' },
      diagnostics: () => ({ full_replays: seen.length }) }
  }
  const a = createLedgerAdapter(factory, { storageProtocol: 'raw-first-transaction-v1' }, { originalV4: true, calls })
  a.captureBatch([{ n: 1 }, { n: 2 }]); assert.deepEqual(seen, [{ n: 1 }, { n: 2 }])
  assert.throws(() => a.captureBatch([{ fail: true }, { n: 4 }]), /write failed/)
  assert.equal(seen.length, 3); assert.equal(calls.at(-1).completed, false)
})
test('supervisor simulation retains failures, never retries or mistakes early exit for speed', () => {
  const success = [e('start'), e('sample', { disk: 10, rss: 10, elapsed: 10 }), e('result', { complete: true, durable: true }), e('exit', { code: 0 })]
  assert.equal(superviseSynthetic(success, policy).status, 'COMPLETE')
  for (const fault of ['disk', 'rss', 'elapsed']) {
    const sample = { disk: 10, rss: 10, elapsed: 10 }; sample[fault] = 101
    const r = superviseSynthetic([e('start'), e('sample', sample), e('exit', { code: 0 })], policy)
    assert.equal(r.status, 'RESOURCE_FAILED'); assert.equal(r.retry_allowed, false)
  }
  for (const reason of ['ENOSPC', 'partial_write', 'corrupt_journal', 'missing_scan', 'result_flush_failed']) {
    const r = superviseSynthetic([e('start'), e('fault', { reason }), e('exit', { code: 0 })], policy)
    assert.equal(r.status, 'EVIDENCE_FAILED')
  }
  assert.equal(superviseSynthetic([e('start'), e('exit', { code: 0 })], policy).status, 'INCOMPLETE')
  assert.equal(superviseSynthetic([e('start'), e('fault', { reason: 'disk' }), e('cleanup_expired')], policy).status, 'CLEANUP_UNCONFIRMED')
  assert.throws(() => superviseSynthetic([e('start'), e('exit', { code: 1 }), e('start')], policy), /sealed/)
})
test('supervisor rejects missing, nonfinite and regressing observations', () => {
  for (const sample of [{ disk: 1, rss: 1 }, { disk: NaN, rss: 1, elapsed: 1 }])
    assert.throws(() => superviseSynthetic([e('start'), e('sample', sample)], policy), /sample/)
  assert.throws(() => superviseSynthetic([e('start'), e('sample', { disk: 1, rss: 1, elapsed: 2 }),
    e('sample', { disk: 1, rss: 1, elapsed: 1 })], policy), /regressed/)
})

test('bridge binds the approved operation list and cannot omit an audit scan', async () => {
  const operations = [{ id: 0, kind: 'audit', read_id: null }, { id: 1, kind: 'persist', read_id: null }]
  const clock = { kind: 'synthetic', now: () => 0 }
  const execute = async op => ({ operation_id: op.id, completed: true, durable: true, output_hash: hash(op), scans: 0, scan_bytes: 0 })
  await assert.rejects(runSyntheticBridge({ operations, expected_operations_hash: 'f'.repeat(64), clock, execute }), /operation.*hash/)
  await assert.rejects(runSyntheticBridge({ operations, expected_operations_hash: hash(operations), clock, execute }), /scan/)
})
