import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openRunLedger, GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs'
import { hash } from '../protocol/contracts.mjs'
let proof
test('capacity proof module records structural bounds and unknowns without granting capacity', async () => {
  const api = await import('../gate2/capacity-proof.mjs').catch(() => ({}))
  assert.equal(typeof api.capacityProof, 'function'); proof = api.capacityProof()
  assert.equal(proof.live_admission_bytes, 1048576)
  assert.equal(proof.closed_capacity, false)
  assert.equal(proof.new_runtime_limits, false)
})
test('per-record padding and valid envelope lengths are explicitly bounded', () => {
  assert.equal(proof.base64_counterexample.two_one_byte_records, 8)
  assert.equal(proof.base64_counterexample.two_bytes_coalesced, 4)
  assert.ok(proof.structural_bounds.sampled_max_envelope_bytes < 1024)
  assert.equal(proof.structural_bounds.max_capture_events_per_attempt, 4 * 4194304)
  assert.ok(proof.structural_bounds.max_frame_payload_bytes > 4 * 1024 ** 3)
  assert.equal(proof.structural_bounds.is_process_memory_guarantee, false)
})
test('raw overshoot and metadata counterexamples veto capacity, independent of candidate speed', () => {
  assert.equal(proof.counterexamples.raw_total_after_delivery, 4194305)
  assert.equal(proof.counterexamples.existing_channel_bytes, 4194304)
  assert.equal(proof.counterexamples.fragmented_metadata_bytes, 180292538)
  assert.ok(proof.unproved.includes('maximum_delivered_read_bytes'))
  assert.equal(proof.performance_evaluation, false)
})

test('actual offline transport cannot claim prefix integrity for a delivered read exceeding existing storage headroom', async () => {
  const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'capacity-transport-'))
  const l = openRunLedger({ root, runId: 'overshoot', freezeHash: 'a'.repeat(64), evidenceKind: 'offline-boundary-test', storageProtocol: 'gate2-transaction-binary-v1',
    limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline' } })
  const id = l.reserve({ coordinate: { family_id: 'capacity', condition: 'C1', arm: 'B', track: 'FROZEN-REPLAY', turn_id: 't1', stage: 'single' }, requestBytes: '{}', maxCostMicros: null })
  const convert = e => ({ attemptId: id, channel: ({ wire: 'wire', content: 'model', reasoning: 'reasoning' })[e.kind] ?? 'transport',
    bytes: ['wire', 'content', 'reasoning'].includes(e.kind) ? e.bytes : JSON.stringify(e), elapsedMs: e.elapsed_ms })
  const first = Buffer.alloc(1048576, 32); first[0] = 58
  const parts = [first, Buffer.alloc(3 * 1048576 + 1, 32)]
  const r = await performDeadlineCompletion({ request: { bytes: Buffer.from('{}'), sha256: hash('{}'), endpoint: 'https://offline.invalid/' }, credential: 'SYNTHETIC',
    timeoutMs: 180000, maxResponseBytes: 1048576, clock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} },
    record: e => l.capture(convert(e)), recordBatch: es => l.captureBatch(es.map(convert)), accounting: true,
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: async () => parts.length ? { done: false, value: parts.shift() } : { done: true }, cancel: async () => {} }) } }) })
  assert.equal(r.error_code, 'evidence_write_failed'); assert.equal(r.termination.prefix_integrity, false)
  assert.equal(r.evidence_complete, false); assert.equal(r.wire_bytes, 4194305)
  assert.equal(r.accounting.raw_bytes_committed, 1048576)
  l.settle({ attemptId: id, outcome: 'error', actualCostMicros: null })
  assert.equal(l.auditSummary().halted, true)
  writeFileSync(join(root, 'observed-failure.json'), JSON.stringify({ model_calls: 0, synthetic: true, performance_evaluation: false, result: r }, null, 2), { flag: 'wx', flush: true })
  console.log('CAPACITY_TRANSPORT_EVIDENCE ' + root)
})
