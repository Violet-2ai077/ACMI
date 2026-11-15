import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const V4_SHA = '71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb'
export const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0
const positive = v => finite(v) && v > 0
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const profiles = ['P-L', 'P-H', 'P-G']
const gates = () => ({ append_reduction: .30, flush_reduction: .30, capture_median: .80, read_p99: 1.25, audit: 1.25, rss: 1.25 })

export function preparePerformanceManifest(input) {
  assert.ok(Object.keys(input).every(k => ['candidate', 'baseline', 'workloads', 'environment', 'budget'].includes(k)), 'unknown preparation field')
  const { candidate, baseline, workloads, environment, budget } = structuredClone(input)
  assert.equal(baseline.version, 'v4', 'original v4 required')
  assert.equal(baseline.sha256, V4_SHA, 'original baseline hash required')
  assert.equal(candidate.version, 'v6', 'one v6 candidate required')
  for (const s of [candidate, baseline]) {
    assert.ok(Array.isArray(s.sources) && s.sources.length > 0, 'source closure required')
    assert.equal(new Set(s.sources.map(f => f.path)).size, s.sources.length, 'duplicate source')
    for (const f of s.sources) assert.ok(f.path && sha(f.sha256), 'invalid source pin')
  }
  assert.ok(same(workloads.map(w => w.id), profiles), 'three ordered profiles required')
  const blockers = []
  for (const w of workloads) {
    assert.ok(sha(w.sha256) && (w.reads === null || Number.isSafeInteger(w.reads) && w.reads > 0), 'invalid workload')
    if (w.reads === null) blockers.push(w.id + ':read_denominator_unproved')
    assert.ok(Array.isArray(w.operations) && ['audit', 'materialize', 'persist'].every(k => w.operations.includes(k)), 'complete operations required')
    if (w.compatibility !== 'verified' || !sha(w.compatibility_sha256)) blockers.push(w.id + ':equivalence_unproved')
    if (w.budget_proven !== true) blockers.push(w.id + ':resource_feasibility_unproved')
  }
  assert.ok(environment.node && environment.host && environment.filesystem && environment.cache === 'unchanged' && environment.serial === true, 'fixed serial environment required')
  for (const k of ['disk_bytes', 'rss_bytes', 'required_free_memory_bytes', 'series_ms']) if (!positive(budget[k])) blockers.push('budget:' + k)
  if (!positive(environment.free_memory_bytes) || !positive(budget.required_free_memory_bytes)
    || environment.free_memory_bytes < budget.required_free_memory_bytes) blockers.push('host:memory_headroom')
  if (!positive(environment.free_disk_bytes) || !positive(budget.disk_bytes)
    || environment.free_disk_bytes < budget.disk_bytes) blockers.push('host:disk_headroom')
  if (positive(budget.rss_bytes) && positive(budget.required_free_memory_bytes)
    && budget.required_free_memory_bytes <= budget.rss_bytes) blockers.push('host:no_parent_memory_allowance')
  for (const p of profiles) if (!positive(budget.per_profile_ms?.[p])) blockers.push('budget:' + p)
  if (profiles.every(p => positive(budget.per_profile_ms?.[p])) && positive(budget.series_ms)
    && profiles.reduce((n, p) => n + 10 * budget.per_profile_ms[p], 0) > budget.series_ms) blockers.push('budget:series_too_small')
  const schedule = profiles.flatMap(profile => Array.from({ length: 5 }, (_, i) =>
    (i % 2 ? ['v6', 'v4'] : ['v4', 'v6']).map(arm => ({ profile, pair: i + 1, arm }))).flat())
  const body = { version: 'performance-preparation-v1', candidate, baseline, workloads, environment, budget,
    thresholds: gates(), schedule, blockers, status: blockers.length ? 'BLOCKED' : 'PERFORMANCE_READY_FOR_OWNER_REVIEW',
    execution_authorized: false, model_calls: 0 }
  return { ...body, digest: digest(body) }
}

function verifyManifest(manifest) {
  const { digest: pin, ...body } = manifest
  assert.equal(digest(body), pin, 'manifest digest mismatch')
  const regenerated = preparePerformanceManifest(Object.fromEntries(['candidate', 'baseline', 'workloads', 'environment', 'budget'].map(k => [k, body[k]])))
  assert.equal(regenerated.digest, pin, 'manifest policy mismatch')
}

export function evaluatePerformance(records, manifest) {
  verifyManifest(manifest)
  const invalid = reason => ({ status: 'INVALID_EVIDENCE', reason, live_ready: false })
  if (manifest.status !== 'PERFORMANCE_READY_FOR_OWNER_REVIEW') return invalid('blocked manifest')
  if (records.length !== manifest.schedule.length) return invalid('missing or extra run')
  const results = [], ratios = Object.fromEntries(profiles.map(p => [p, []]))
  for (let i = 0; i < records.length; i++) {
    const r = records[i], s = manifest.schedule[i], w = manifest.workloads.find(w => w.id === s.profile)
    if (!same({ profile: r.profile, pair: r.pair, arm: r.arm }, s) || r.manifest_hash !== manifest.digest
      || r.workload_hash !== w.sha256 || r.source_hash !== digest(r.arm === 'v4' ? manifest.baseline : manifest.candidate)
      || !same(r.operations, w.operations) || r.raw_reads !== w.reads || !sha(r.output_hash)) return invalid('identity, order or workload mismatch')
    const m = r.metrics
    if (!m || !['capture_ms', 'audit_ms', 'materialize_ms', 'persist_ms', 'peak_rss_bytes', 'append_calls', 'flush_requests', 'wall_ms'].every(k => finite(m[k]))
      || !Array.isArray(m.read_ms) || m.read_ms.length !== w.reads || !m.read_ms.every(finite)) return invalid('invalid metrics or read denominator')
    if (!['append_calls', 'flush_requests', 'peak_rss_bytes'].every(k => Number.isSafeInteger(m[k]))) return invalid('fractional count')
    const epsilon = 1e-7 * Math.max(1, m.wall_ms)
    if (m.capture_ms + epsilon < m.read_ms.reduce((a, b) => a + b, 0)
      || m.wall_ms + epsilon < m.capture_ms + m.audit_ms + m.materialize_ms + m.persist_ms) return invalid('omitted or overlapping timing')
    if (!['correct', 'complete', 'resource_failed', 'synthetic'].every(k => typeof r[k] === 'boolean')
      || r.synthetic !== records[0].synthetic) return invalid('missing or mixed provenance')
  }
  for (let i = 0; i < records.length; i += 2) {
    const pair = records.slice(i, i + 2), a = pair.find(r => r.arm === 'v4'), b = pair.find(r => r.arm === 'v6')
    if (a.output_hash !== b.output_hash) return invalid('nonequivalent result')
    const ratio = (n, d) => d > 0 ? n / d : null
    const p99 = r => [...r.metrics.read_ms].sort((a, b) => a - b)[Math.ceil(r.raw_reads * .99) - 1]
    const v = { capture: ratio(b.metrics.capture_ms, a.metrics.capture_ms), read_p99: ratio(p99(b), p99(a)),
      audit: ratio(b.metrics.audit_ms + b.metrics.materialize_ms, a.metrics.audit_ms + a.metrics.materialize_ms),
      rss: ratio(b.metrics.peak_rss_bytes, a.metrics.peak_rss_bytes),
      append_reduction: a.metrics.append_calls > 0 ? 1 - b.metrics.append_calls / a.metrics.append_calls : null,
      flush_reduction: a.metrics.flush_requests > 0 ? 1 - b.metrics.flush_requests / a.metrics.flush_requests : null }
    if (Object.values(v).some(v => v === null)) return invalid('zero baseline denominator')
    ratios[a.profile].push(v.capture)
    const passed = pair.every(r => r.correct && r.complete && !r.resource_failed)
      && v.read_p99 <= 1.25 && v.audit <= 1.25 && v.rss <= 1.25 && v.append_reduction >= .30 && v.flush_reduction >= .30
    results.push({ profile: a.profile, pair: a.pair, ratios: v, passed })
  }
  const medians = Object.fromEntries(profiles.map(p => [p, ratios[p].sort((a, b) => a - b)[2]]))
  return { status: results.every(r => r.passed) && Object.values(medians).every(v => v <= .80)
    ? 'FIXED_WORKLOAD_PERFORMANCE_PASS' : 'FIXED_WORKLOAD_PERFORMANCE_FAIL',
  results, capture_medians: medians, synthetic: records[0].synthetic, live_ready: false, capacity_claim: false }
}
