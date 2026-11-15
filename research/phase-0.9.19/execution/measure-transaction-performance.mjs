import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

// Only synthetic clock validation is authorized in this preparation build.
export async function measureOfflineTrace({ clock, actions }) {
  assert.equal(clock?.kind, 'synthetic', 'synthetic clock required')
  const start = clock.now(), totals = { capture_ms: 0, audit_ms: 0, materialize_ms: 0, persist_ms: 0 }
  const reads = new Map(), closed = new Set(), operations = []
  let currentRead = null, last = start
  for (const a of actions) {
    assert.ok(['capture', 'audit', 'materialize', 'persist'].includes(a.kind), 'unknown operation')
    const before = clock.now(); assert.ok(Number.isFinite(before) && before >= last, 'clock regressed')
    if (a.kind === 'capture') {
      assert.ok(typeof a.read_id === 'string' && a.read_id.length && !closed.has(a.read_id), 'invalid or noncontiguous read')
      if (currentRead && currentRead !== a.read_id) closed.add(currentRead)
      currentRead = a.read_id
    } else if (currentRead) { closed.add(currentRead); currentRead = null }
    await a.run()
    const after = clock.now(); assert.ok(Number.isFinite(after) && after >= before, 'clock regressed')
    totals[a.kind + '_ms'] += after - before
    if (a.kind === 'capture') reads.set(a.read_id, (reads.get(a.read_id) ?? 0) + after - before)
    operations.push(a.kind); last = after
  }
  return { synthetic: true, performance_evaluation: false, operations, ...totals,
    raw_reads: reads.size, read_ms: [...reads.values()], wall_ms: last - start }
}

export function runPerformanceSeries() {
  throw Error('PERFORMANCE_EXECUTION_NOT_AUTHORIZED: preparation build; no real clock, child dispatch or approval-file bypass')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write('PERFORMANCE_EXECUTION_NOT_AUTHORIZED: Task 3 requires separate approval and a reviewed dispatch implementation\n')
  process.exitCode = 2
}
