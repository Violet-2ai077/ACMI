import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { preparePerformanceManifest, evaluatePerformance, digest, V4_SHA } from '../execution/prepare-transaction-performance.mjs'
import { measureOfflineTrace, runPerformanceSeries } from '../execution/measure-transaction-performance.mjs'

function input() {
  return { candidate: { version: 'v6', sources: [{ path: 'candidate', sha256: 'b'.repeat(64) }] },
    baseline: { version: 'v4', sha256: V4_SHA, sources: [{ path: 'baseline', sha256: V4_SHA }] },
    workloads: ['P-L', 'P-H', 'P-G'].map(id => ({ id, sha256: 'c'.repeat(64), operations: ['capture', 'audit', 'materialize', 'persist'],
      reads: 2, compatibility: 'verified', compatibility_sha256: 'd'.repeat(64), budget_proven: true })),
    environment: { node: 'v24.16.0', host: 'synthetic', filesystem: 'synthetic', cache: 'unchanged', serial: true,
      free_memory_bytes: 4096, free_disk_bytes: 4096 },
    budget: { disk_bytes: 1024, rss_bytes: 1024, required_free_memory_bytes: 2048,
      series_ms: 100000, per_profile_ms: { 'P-L': 100, 'P-H': 100, 'P-G': 100 } } }
}
function records(manifest) {
  return manifest.schedule.map(s => ({ ...s, manifest_hash: manifest.digest,
    workload_hash: manifest.workloads.find(w => w.id === s.profile).sha256,
    source_hash: digest(s.arm === 'v4' ? manifest.baseline : manifest.candidate),
    operations: ['capture', 'audit', 'materialize', 'persist'], raw_reads: 2,
    output_hash: 'e'.repeat(64), correct: true, complete: true, resource_failed: false, synthetic: true,
    metrics: { capture_ms: s.arm === 'v4' ? 100 : 70, read_ms: s.arm === 'v4' ? [30, 70] : [20, 50],
      audit_ms: 100, materialize_ms: 20, peak_rss_bytes: 100, append_calls: s.arm === 'v4' ? 10 : 6,
      flush_requests: s.arm === 'v4' ? 10 : 6, persist_ms: 10, wall_ms: 1000 } }))
}

test('preparation is deterministic, pins thirty fixed runs and never authorizes dispatch', () => {
  const a = preparePerformanceManifest(input()), b = preparePerformanceManifest(input())
  assert.deepEqual(a, b); assert.equal(a.status, 'PERFORMANCE_READY_FOR_OWNER_REVIEW')
  assert.equal(a.execution_authorized, false); assert.equal(a.schedule.length, 30)
  assert.equal(a.schedule[0].arm, 'v4'); assert.equal(a.schedule[2].arm, 'v6')
  assert.throws(() => runPerformanceSeries(a, { approved: true }), /NOT_AUTHORIZED/)
})

test('missing capacity, incompatible guarded reference, changed baseline and weak gates are refused', () => {
  for (const change of [x => { x.workloads[2].compatibility = 'unproven' }, x => { x.workloads[1].budget_proven = false },
    x => { x.budget.rss_bytes = null }]) {
    const x = input(); change(x); assert.equal(preparePerformanceManifest(x).status, 'BLOCKED')
  }
  const x = input(); x.baseline.version = 'v5'; assert.throws(() => preparePerformanceManifest(x), /v4/)
  x.baseline.version = 'v4'; x.baseline.sha256 = 'f'.repeat(64)
  assert.throws(() => preparePerformanceManifest(x), /baseline/)
  const y = input(); y.thresholds = { audit: 2 }; assert.throws(() => preparePerformanceManifest(y), /unknown/)
})

test('all unchanged gates apply, no best-repeat or average-audit substitution', () => {
  const m = preparePerformanceManifest(input()), rows = records(m)
  assert.equal(evaluatePerformance(rows, m).status, 'FIXED_WORKLOAD_PERFORMANCE_PASS')
  rows[1].metrics.audit_ms = 200
  assert.equal(evaluatePerformance(rows, m).status, 'FIXED_WORKLOAD_PERFORMANCE_FAIL')
  for (const mutate of [r => { r.metrics.flush_requests = 9 }, r => { r.metrics.peak_rss_bytes = 126 },
    r => { r.metrics.read_ms = [10, 100]; r.metrics.capture_ms = 110 }, r => { r.metrics.materialize_ms = 100 },
    r => { r.correct = false }, r => { r.resource_failed = true }]) {
    const r = records(m); mutate(r[1]); assert.equal(evaluatePerformance(r, m).status, 'FIXED_WORKLOAD_PERFORMANCE_FAIL')
  }
  const slow = records(m); for (const r of slow.filter(r => r.arm === 'v6')) r.metrics.capture_ms = 90
  assert.equal(evaluatePerformance(slow, m).status, 'FIXED_WORKLOAD_PERFORMANCE_FAIL')
})

test('timing omissions and fractional call counts cannot manufacture faster results', () => {
  const m = preparePerformanceManifest(input())
  for (const mutate of [r => { r.metrics.capture_ms = 1 }, r => { r.metrics.wall_ms = 1 },
    r => { delete r.metrics.persist_ms }, r => { r.metrics.append_calls = 1.5 }, r => { delete r.synthetic }]) {
    const r = records(m); mutate(r[1]); assert.equal(evaluatePerformance(r, m).status, 'INVALID_EVIDENCE')
  }
  assert.equal(evaluatePerformance(records(m), m).synthetic, true)
})

test('insufficient or unobserved host headroom blocks readiness, not a runtime stop rule', () => {
  for (const field of ['free_memory_bytes', 'free_disk_bytes']) {
    const x = input(); x.environment[field] = 1
    assert.equal(preparePerformanceManifest(x).status, 'BLOCKED')
    delete x.environment[field]
    assert.equal(preparePerformanceManifest(x).status, 'BLOCKED')
  }
})

test('unknown read denominator is retained as unknown and blocks scoring', () => {
  const x = input(); x.workloads[2].reads = null
  const m = preparePerformanceManifest(x)
  assert.equal(m.workloads[2].reads, null)
  assert.equal(m.status, 'BLOCKED')
  assert.ok(m.blockers.includes('P-G:read_denominator_unproved'))
  assert.equal(evaluatePerformance(records(m), m).status, 'INVALID_EVIDENCE')
})

test('incomplete, reordered, mutated, mismatched and nonfinite evidence cannot be scored as pass', () => {
  const m = preparePerformanceManifest(input())
  for (const change of [r => r.pop(), r => r.reverse(), r => { r[1].raw_reads = 1 },
    r => { r[1].source_hash = 'f'.repeat(64) }, r => { r[1].output_hash = 'f'.repeat(64) },
    r => { r[1].operations.pop() }, r => { r[1].metrics.capture_ms = NaN }]) {
    const r = records(m); change(r); assert.equal(evaluatePerformance(r, m).status, 'INVALID_EVIDENCE')
  }
  const altered = structuredClone(m); altered.candidate.sources[0].sha256 = 'f'.repeat(64)
  assert.throws(() => evaluatePerformance(records(m), altered), /manifest/)
})

test('fake-clock trace includes materialization and durable output, preserves read denominator', async () => {
  let now = 0
  const clock = { kind: 'synthetic', now: () => now }
  const actions = [
    { kind: 'capture', read_id: 'r1', run: async () => { now += 2 } },
    { kind: 'capture', read_id: 'r1', run: async () => { now += 3 } },
    { kind: 'audit', run: async () => { now += 7 } },
    { kind: 'materialize', run: async () => { now += 11 } },
    { kind: 'persist', run: async () => { now += 13 } }
  ]
  const r = await measureOfflineTrace({ clock, actions })
  assert.deepEqual(r.read_ms, [5]); assert.equal(r.capture_ms, 5)
  assert.equal(r.audit_ms, 7); assert.equal(r.materialize_ms, 11); assert.equal(r.wall_ms, 36)
  assert.equal(r.persist_ms, 13); assert.equal(r.synthetic, true)
  await assert.rejects(measureOfflineTrace({ clock: { kind: 'real', now: () => 0 }, actions }), /synthetic/)
  await assert.rejects(measureOfflineTrace({ clock, actions: [...actions, actions[0]] }), /read/)
  await assert.rejects(measureOfflineTrace({ clock, actions: [{ kind: 'audit', run: () => { throw Error('disk') } }] }), /disk/)
})

test('CLI cannot dispatch a real series even with a purported approval argument', () => {
  const script = fileURLToPath(new URL('../execution/measure-transaction-performance.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [script, '--approved', '--manifest', 'not-read.json'], { encoding: 'utf8' })
  assert.equal(r.status, 2); assert.match(r.stderr, /PERFORMANCE_EXECUTION_NOT_AUTHORIZED/)
  assert.equal(r.stdout, '')
})
