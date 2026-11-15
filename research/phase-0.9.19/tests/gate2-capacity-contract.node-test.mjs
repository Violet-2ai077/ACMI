import test from 'node:test'
import assert from 'node:assert/strict'
import { assessCapacityContract, encodedPayloadBytes } from '../gate2/capacity-contract.mjs'

const bound = value => ({ value, kind: 'implementation-contract', reference: 'synthetic proof', sha256: 'a'.repeat(64) })
function fixture() {
  return { domain: 'synthetic', limits: { admission: 2, wire: 100, transport: 10000, derived: 100, capture: 100, calls: 2 },
    deliveryProof: { maxReadBytes: bound(4), fetchBufferBytes: bound(8), maxEmptyReads: bound(0) },
    recordBounds: { metadataBytes: bound(8), controls: [bound(4), bound(4), bound(4), bound(4)],
      requestBytes: bound(4), derivedBytes: bound(8), derivedEvents: bound(8),
      envelopeBytes: bound(1024), contextBytes: bound(16), nodeBaseBytes: bound(100), heapOverheadBytes: bound(1024), auditMsPerAttempt: bound(10) },
    resourceBudget: { frameBytes: 1000000, rssBytes: 10000000, diskBytes: 10000000,
      auditMs: 100, failureReserveBytes: 1024, artifactBytes: 1024 } }
}

test('capacity arithmetic is conditional on premises, never runtime authorization', () => {
  const input = fixture(), before = structuredClone(input), r = assessCapacityContract(input)
  assert.equal(r.status, 'CLOSED_WITHIN_DECLARED_DOMAIN')
  assert.equal(r.runtime_authorized, false)
  assert.equal(r.budgets.raw_bytes, 10)
  assert.equal(r.budgets.nonempty_reads, 4)
  assert.equal(r.budgets.transport_bytes, 48)
  assert.deepEqual(input, before)
})

test('unknown and observed read/buffer limits cannot establish capacity closure', () => {
  for (const key of ['maxReadBytes', 'fetchBufferBytes', 'maxEmptyReads']) {
    const input = fixture(); delete input.deliveryProof[key]
    assert.notEqual(assessCapacityContract(input).status, 'CLOSED_WITHIN_DECLARED_DOMAIN')
    input.deliveryProof[key] = { ...bound(4), kind: 'observed-maximum' }
    assert.notEqual(assessCapacityContract(input).status, 'CLOSED_WITHIN_DECLARED_DOMAIN')
  }
})

test('overshoot and joint metadata/control budgets cannot be hidden', () => {
  const a = fixture(); a.limits.wire = 9
  assert.ok(assessCapacityContract(a).exceededBounds.includes('wire_budget'))
  const b = fixture(); b.limits.transport = 40
  assert.equal(assessCapacityContract(b).status, 'INCOMPLETE')
  assert.ok(assessCapacityContract(b).exceededBounds.includes('transport_budget'))
})

test('missing terminal, frame, memory or absolute audit premises block closure', () => {
  for (const key of ['derivedEvents', 'requestBytes', 'contextBytes', 'nodeBaseBytes', 'auditMsPerAttempt']) {
    const input = fixture(); delete input.recordBounds[key]
    assert.equal(assessCapacityContract(input).status, 'INCOMPLETE')
  }
  const input = fixture(); input.recordBounds.controls.pop()
  assert.throws(() => assessCapacityContract(input), /controls/)
  for (const key of ['frameBytes', 'rssBytes', 'diskBytes', 'auditMs']) {
    const x = fixture(); x.resourceBudget[key] = 1
    assert.equal(assessCapacityContract(x).status, 'INCOMPLETE')
  }
})

test('Base64 is per record, rejects unsafe arithmetic and malformed proofs', () => {
  assert.equal(encodedPayloadBytes([{ count: 2, bytes: 1 }]), 8)
  assert.equal(encodedPayloadBytes([{ count: 1, bytes: 2 }]), 4)
  assert.throws(() => encodedPayloadBytes([{ count: Number.MAX_SAFE_INTEGER, bytes: 2 }]), /safe/)
  const input = fixture(); input.deliveryProof.maxReadBytes.value = NaN
  assert.throws(() => assessCapacityContract(input), /safe/)
})

test('576 sparse slots cannot replace an unproved full-volume budget', () => {
  const input = fixture(); input.limits.calls = 576
  input.resourceBudget.diskBytes = 1000000
  assert.equal(assessCapacityContract(input).status, 'INCOMPLETE')
  input.resourceBudget.diskBytes = null
  input.resourceBudget.auditMs = 10000
  assert.equal(assessCapacityContract(input).status, 'INCOMPLETE')
})

test('a loose upper bound exceeding budget is not itself a constructive counterexample', () => {
  const x = fixture(); x.resourceBudget.frameBytes = 1
  const r = assessCapacityContract(x)
  assert.equal(r.status, 'INCOMPLETE')
  assert.deepEqual(r.counterexamples, [])
  x.deliveryProof.maxReadBytes = bound(200)
  x.recordBounds.witnesses = [{ kind: 'raw-delivery', channel: 'wire', bytes: 101, admitted_bytes: 2,
    delivered_bytes: 99, reference: 'synthetic concrete delivery', sha256: 'c'.repeat(64) }]
  assert.equal(assessCapacityContract(x).status, 'INFEASIBLE')
  x.recordBounds.witnesses[0].admitted_bytes = 3
  assert.throws(() => assessCapacityContract(x), /witness/)
})
