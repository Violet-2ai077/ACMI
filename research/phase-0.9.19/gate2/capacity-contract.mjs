import assert from 'node:assert/strict'

const integer = n => { assert.ok(Number.isSafeInteger(n) && n >= 0, 'expected nonnegative safe integer'); return n }
const sum = values => values.some(v => v === null) ? null : integer(values.reduce((a, b) => a + b, 0))
const product = (...values) => values.some(v => v === null) ? null : integer(values.reduce((a, b) => a * b, 1))

export function encodedPayloadBytes(groups) {
  return sum(groups.map(({ count, bytes }) => product(integer(count), 4, Math.ceil(integer(bytes) / 3))))
}

// This evaluates declared premises. A reference/hash is provenance, not proof authentication.
export function assessCapacityContract({ domain, limits, deliveryProof, recordBounds, resourceBudget }) {
  assert.ok(typeof domain === 'string' && domain.length > 0, 'declared domain required')
  const requiredBounds = [], assumptions = [], counterexamples = [], exceededBounds = []
  const proof = (v, key) => {
    if (v && v.value !== null && v.value !== undefined) integer(v.value)
    if (!v || v.value === null || v.value === undefined || !['implementation-contract', 'exact-encoding', 'derived-invariant'].includes(v.kind)
      || !v.reference || !/^[a-f0-9]{64}$/.test(v.sha256 ?? '')) { requiredBounds.push(key); return null }
    assumptions.push({ key, ...v }); return v.value
  }
  for (const key of ['admission', 'wire', 'transport', 'derived', 'capture', 'calls']) integer(limits[key])
  assert.ok(limits.calls > 0)
  assert.ok(Array.isArray(recordBounds.controls) && recordBounds.controls.length === 4, 'four controls bounds required')
  const q = proof(deliveryProof.maxReadBytes, 'max_read_bytes')
  const fetch = proof(deliveryProof.fetchBufferBytes, 'fetch_buffer_bytes')
  proof(deliveryProof.maxEmptyReads, 'empty_read_work')
  const values = Object.fromEntries(['metadataBytes', 'requestBytes', 'derivedBytes', 'derivedEvents', 'envelopeBytes',
    'contextBytes', 'nodeBaseBytes', 'heapOverheadBytes', 'auditMsPerAttempt'].map(k => [k, proof(recordBounds[k], k)]))
  const controls = recordBounds.controls.map((b, i) => proof(b, 'control_' + i))
  const reads = integer(limits.admission + 2)
  const raw = sum([limits.admission, q, q])
  const transport = sum([product(reads, values.metadataBytes), ...controls])
  const events = sum([6, product(2, reads), values.derivedEvents])
  const payload = sum([raw, transport, values.derivedBytes, values.requestBytes])
  // Four bytes per payload byte covers independent Base64 padding even for one-byte records.
  const journal = sum([product(4, payload), product(events, sum([values.envelopeBytes, 146])), 65536])
  const budget = key => {
    const v = resourceBudget[key]
    if (v === null || v === undefined) { requiredBounds.push('budget_' + key); return null }
    return integer(v)
  }
  const resources = Object.fromEntries(['frameBytes', 'rssBytes', 'diskBytes', 'auditMs', 'failureReserveBytes', 'artifactBytes'].map(k => [k, budget(k)]))
  const disk = sum([product(limits.calls, journal), resources.failureReserveBytes, resources.artifactBytes])
  const rss = sum([product(6, journal), raw, fetch, values.contextBytes, values.nodeBaseBytes, values.heapOverheadBytes])
  const audit = product(limits.calls, values.auditMsPerAttempt)
  const check = (name, need, available) => { if (need !== null && available !== null && need > available) exceededBounds.push(name) }
  check('wire_budget', raw, limits.wire)
  check('transport_budget', transport, limits.transport)
  check('derived_budget', values.derivedBytes, limits.derived)
  for (const n of [q, values.metadataBytes, values.derivedBytes, ...controls]) check('capture_budget', n, limits.capture)
  check('frame_budget', journal, resources.frameBytes)
  check('rss_budget', rss, resources.rssBytes)
  check('disk_budget', disk, resources.diskBytes)
  check('audit_budget', audit, resources.auditMs)
  for (const witness of recordBounds.witnesses ?? []) {
    assert.ok(['wire', 'transport'].includes(witness.channel) && witness.reference
      && /^[a-f0-9]{64}$/.test(witness.sha256 ?? ''), 'invalid concrete witness')
    integer(witness.bytes)
    if (witness.channel === 'wire') {
      assert.ok(witness.kind === 'raw-delivery' && integer(witness.admitted_bytes) <= limits.admission
        && integer(witness.delivered_bytes) > 0 && (q === null || witness.delivered_bytes <= q)
        && sum([witness.admitted_bytes, witness.delivered_bytes]) === witness.bytes, 'witness outside delivery domain')
    } else {
      assert.ok(witness.kind === 'fragmented-metadata' && integer(witness.raw_bytes) <= limits.admission
        && integer(witness.reads) > 0 && witness.reads <= witness.raw_bytes, 'witness outside fragmentation domain')
    }
    if (witness.bytes > limits[witness.channel]) counterexamples.push(witness)
  }
  return { version: 'capacity-contract-v1', domain,
    status: counterexamples.length ? 'INFEASIBLE' : requiredBounds.length || exceededBounds.length ? 'INCOMPLETE' : 'CLOSED_WITHIN_DECLARED_DOMAIN',
    runtime_authorized: false, assumptions, requiredBounds, counterexamples, exceededBounds: [...new Set(exceededBounds)],
    budgets: { raw_bytes: raw, nonempty_reads: reads, transport_bytes: transport, logical_events: events,
      journal_attempt_bytes: journal, frame_conservative_bytes: journal, run_disk_bytes: disk, rss_bytes: rss, full_audit_ms: audit },
    qualification: 'Conditional conservative arithmetic, not authenticated runtime proof or live capacity approval. Heap/runtime and audit premises must cover the declared domain.' }
}
