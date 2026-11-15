import assert from 'node:assert/strict'
import { hash } from '../protocol/contracts.mjs'

export async function runSyntheticBridge({ operations, expected_operations_hash, clock, execute }) {
  assert.equal(clock?.kind, 'synthetic', 'synthetic clock only')
  assert.ok(Array.isArray(operations) && operations.length > 0, 'operations required')
  assert.equal(hash(operations), expected_operations_hash, 'operation list hash mismatch')
  const start = clock.now(), rows = [], totals = {}, reads = new Map(), closed = new Set()
  assert.ok(Number.isFinite(start), 'clock invalid')
  let currentRead = null, last = start, scans = 0, scanBytes = 0
  for (const [i, op] of operations.entries()) {
    assert.equal(op.id, i, 'operation order'); assert.ok(typeof op.kind === 'string' && op.kind.length, 'operation kind')
    if (op.read_id !== currentRead) {
      if (currentRead !== null) closed.add(currentRead)
      assert.ok(!closed.has(op.read_id), 'noncontiguous read'); currentRead = op.read_id
    }
    const before = clock.now(); assert.ok(Number.isFinite(before) && before >= last, 'clock regressed')
    const ack = await execute(structuredClone(op))
    assert.ok(ack?.operation_id === i && ack.completed === true && /^[a-f0-9]{64}$/.test(ack.output_hash), 'operation incomplete or mismatched')
    if (op.kind === 'persist') assert.equal(ack.durable, true, 'durable result required')
    for (const key of ['scans', 'scan_bytes']) assert.ok(Number.isSafeInteger(ack[key]) && ack[key] >= 0, 'scan count required')
    if (['audit', 'materialize'].includes(op.kind)) assert.ok(ack.scans >= (op.required_scans ?? 1), 'required full scan omitted')
    const after = clock.now(); assert.ok(Number.isFinite(after) && after >= before, 'clock regressed')
    const cost = after - before
    totals[op.kind + '_ms'] = (totals[op.kind + '_ms'] ?? 0) + cost
    if (op.read_id != null) reads.set(op.read_id, (reads.get(op.read_id) ?? 0) + cost)
    scans += ack.scans; scanBytes += ack.scan_bytes
    assert.ok(Number.isSafeInteger(scans) && Number.isSafeInteger(scanBytes), 'scan precision')
    rows.push({ operation: op, ack, exclusive_ms: cost }); last = after
  }
  assert.ok(operations.some(op => op.kind === 'persist'), 'durable report operation missing')
  return { synthetic: true, performance_evaluation: false, operations_hash: hash(operations), rows, ...totals,
    raw_reads: reads.size, read_ms: [...reads.values()], wall_ms: last - start, full_scans: scans, scan_bytes: scanBytes }
}

// Pure event simulation, not an OS process manager or live stop policy.
export function superviseSynthetic(events, policy) {
  for (const k of ['disk_bytes', 'rss_bytes', 'child_ms', 'cleanup_ms']) assert.ok(Number.isSafeInteger(policy[k]) && policy[k] > 0, 'policy invalid')
  let state = 'READY', failure = null, complete = false, elapsed = 0
  const journal = []
  for (const e of events) {
    assert.notEqual(state, 'SEALED', 'sealed run cannot restart')
    if (e.kind === 'start') { assert.equal(state, 'READY'); state = 'RUNNING' }
    else {
      assert.ok(state === 'RUNNING' || state === 'STOPPING', 'no owned child')
      if (e.kind === 'sample') {
        assert.ok(['disk', 'rss', 'elapsed'].every(k => Number.isSafeInteger(e[k]) && e[k] >= 0), 'invalid sample')
        assert.ok(e.elapsed >= elapsed, 'elapsed regressed'); elapsed = e.elapsed
        if (e.disk > policy.disk_bytes || e.rss > policy.rss_bytes || e.elapsed > policy.child_ms) {
          failure ??= 'RESOURCE_FAILED'; state = 'STOPPING'
        }
      } else if (e.kind === 'fault') { assert.ok(e.reason); failure ??= 'EVIDENCE_FAILED'; state = 'STOPPING' }
      else if (e.kind === 'result') {
        assert.ok(typeof e.complete === 'boolean' && typeof e.durable === 'boolean', 'invalid result')
        if (complete) throw Error('duplicate result')
        complete = e.complete && e.durable
        if (!complete) { failure ??= 'EVIDENCE_FAILED'; state = 'STOPPING' }
      } else if (e.kind === 'exit') {
        assert.ok(Number.isInteger(e.code), 'exit code required')
        failure ??= e.code === 0 && complete ? null : 'INCOMPLETE'; state = 'SEALED'
      } else if (e.kind === 'cleanup_expired') {
        assert.equal(state, 'STOPPING'); failure = 'CLEANUP_UNCONFIRMED'; state = 'SEALED'
      } else throw Error('unknown supervisor event')
    }
    journal.push(structuredClone(e))
  }
  return { synthetic: true, native_process_control_verified: false, performance_evaluation: false,
    status: state !== 'SEALED' ? 'INCOMPLETE' : failure ?? 'COMPLETE', state,
    retry_allowed: false, evidence_retained: true, journal }
}
