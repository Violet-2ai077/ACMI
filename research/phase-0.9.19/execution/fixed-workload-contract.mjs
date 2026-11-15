import assert from 'node:assert/strict'
import { hash } from '../protocol/contracts.mjs'

const safe = n => { assert.ok(Number.isSafeInteger(n) && n >= 0, 'unsafe resource arithmetic'); return n }
const bytes = e => {
  const v = e.value, b = Buffer.from(v.bytes_base64, 'base64')
  assert.ok(b.toString('base64') === v.bytes_base64 && hash(b) === v.sha256, 'payload integrity')
  return b
}
const kind = e => e?.kind === 'capture' && e.value.channel === 'transport' ? JSON.parse(bytes(e)).kind : null

export function operationTable(events, profile) {
  assert.ok(['P-L', 'P-H'].includes(profile) && events.length, 'invalid profile')
  const operations = [], reads = [], source = events.map(e => ({ kind: e.kind, value: e.value }))
  const add = (kind, indices = [], read_id = null, extra = {}) => operations.push({ id: operations.length,
    kind, event_indices: indices, read_id, input_hash: hash(indices.map(i => source[i])), ...extra })
  add('open')
  let attempt = null, index = 0, attempts = 0, settled = true
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'reserve') {
      assert.ok(settled, 'overlapping attempt'); attempt = e.value.attemptId; index = 0; attempts++; settled = false
      add('reserve', [i]); continue
    }
    assert.ok(!settled && e.value.attemptId === attempt, 'attempt boundary')
    if (e.kind === 'settle') {
      add('settle', [i], null, { cost_group: 'legacy_audit' }); add('audit', [], null, { attempt_id: attempt })
      if (profile === 'P-H') add('materialize', [], null, { attempt_id: attempt, candidate_extra_full_scan: true })
      settled = true; continue
    }
    assert.equal(e.kind, 'capture'); bytes(e)
    if (kind(e) === 'wire_delivery') {
      const m = JSON.parse(bytes(e)), raw = events[i + 1]
      assert.equal(m.index, index++)
      assert.ok(raw?.kind === 'capture' && raw.value.channel === 'wire' && raw.value.attemptId === attempt, 'delivery/raw missing')
      const b = bytes(raw)
      assert.ok(m.byte_length === b.length && m.sha256 === raw.value.sha256 && b.length > 0, 'delivery mismatch')
      const id = attempt + '/' + m.index
      reads.push({ id, byte_length: b.length, sha256: m.sha256, source_elapsed_ms: raw.value.elapsedMs })
      add('capture', [i, ++i], id, { batch: 'raw-first' })
      const derived = []
      while (['model', 'reasoning'].includes(events[i + 1]?.value.channel)) {
        const next = events[++i]; assert.equal(next.value.attemptId, attempt); bytes(next); derived.push(i)
      }
      if (derived.length) add('capture', derived, id, { batch: 'derived' })
    } else {
      assert.notEqual(e.value.channel, 'wire', 'unpaired raw delivery'); add('capture', [i])
    }
  }
  assert.ok(settled, 'incomplete input attempt')
  add('reopen'); add('snapshot'); add('persist')
  // The original source sequence widths upper-bound a rebased last-attempt sequence.
  const encoded = events.map(e => Buffer.byteLength(JSON.stringify(e)) + 1)
  let prefix = 0, appendScans = 0, nominalBytes = 0, nominalScans = 0
  for (const [i, n] of encoded.entries()) {
    appendScans = safe(appendScans + prefix)
    if (events[i].kind !== 'capture') { nominalBytes = safe(nominalBytes + prefix); nominalScans++ }
    prefix = safe(prefix + n)
  }
  const result = { version: 'fixed-operation-table-v1', profile, events: events.length, attempts,
    reads: reads.length, denominator: 'nonempty-original-deliveries', deliveries: reads,
    input_hash: hash(source), operations, raw_source_bytes: prefix,
    original_v4_append_scan_bytes_upper: appendScans,
    original_v4_nominal_append_scans: nominalScans, original_v4_nominal_append_scan_bytes: nominalBytes,
    scan_model: 'Nominal fixed workload has capture cache hits. All-append scan sum is a counterfactual cache-miss upper bound, not expected cost.',
    correctness_scope: 'Operation specification; not an executed writer or a runtime resource proof.' }
  return { ...result, sha256: hash(result) }
}

export function fixedResourceProof(profiles, budget) {
  assert.deepEqual(profiles.map(p => p.id), ['P-L', 'P-H', 'P-G'])
  let output = 0
  for (const p of profiles) output = safe(output + 10 * safe(safe(p.journal_bytes) + safe(p.operation_bytes) + safe(p.result_bytes)))
  const disk = safe(output + safe(budget.shared_bytes) + safe(budget.failure_reserve_bytes))
  const blockers = []
  if (disk > safe(budget.disk_bytes)) blockers.push('fixed_disk_budget_insufficient')
  // Runtime proofs require a separately reviewed verifier; caller-supplied truthy objects do not suffice.
  blockers.push('runtime_heap_bound_unproved', 'absolute_time_feasibility_unproved', 'native_supervisor_unverified')
  return { version: 'fixed-resource-proof-v1', status: 'BLOCKED', capacity_closed: false,
    fixed_disk_sufficient: disk <= budget.disk_bytes, required_disk_bytes: disk,
    per_profile: profiles, budget, blockers,
    qualification: 'Disk bound conditional on listed output schemas and fixed inputs; no runtime heap/time guarantee.' }
}
