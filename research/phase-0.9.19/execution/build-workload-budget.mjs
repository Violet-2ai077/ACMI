import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, statSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { freemem, totalmem } from 'node:os'
import { fixedResourceProof } from './fixed-workload-contract.mjs'

const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-workload-bridge-prep-20261115'
const read = p => JSON.parse(readFileSync(join(root, p)))
const size = p => statSync(join(root, p)).size
const old = read('verification/resource-analysis.json'), writer = read('writer-verification/summary.json')
const GiB = 1024 ** 3
const profiles = old.per_profile.map(p => ({ ...p, operation_bytes: p.id === 'P-G' ? p.operation_bytes
  : size('writer-verification/' + p.id + '-operations.json') + Math.max(...['v4', 'v6'].map(arm => size('writer-verification/' + p.id + '-' + arm + '-counts.json'))) }))
const result = fixedResourceProof(profiles, { disk_bytes: 16 * GiB, shared_bytes: 2 * GiB,
  failure_reserve_bytes: 2 * GiB, heap_proof: null, time_proof: null })
const partitions = { P_L_P_H: 6 * GiB, P_G: 2 * GiB, shared: 2 * GiB, failure: 2 * GiB, headroom: 4 * GiB }
const totalFor = rows => 10 * rows.reduce((n, p) => n + p.journal_bytes + p.operation_bytes + p.result_bytes, 0)
assert.ok(totalFor(profiles.slice(0, 2)) <= partitions.P_L_P_H)
assert.ok(totalFor(profiles.slice(2)) <= partitions.P_G)
assert.equal(Object.values(partitions).reduce((a, b) => a + b, 0), 16 * GiB)
const disk = statfsSync(root)
const scans = ['P-L', 'P-H'].map(id => {
  const table = read('writer-verification/' + id + '-operations.json')
  return { profile: id, nominal_append_scans: table.original_v4_nominal_append_scans,
    nominal_append_scan_bytes: table.original_v4_nominal_append_scan_bytes,
    note: 'Additional explicit snapshots/reopens/materialization are separately counted, not omitted.' }
})
const out = { ...result, disk_partitions: partitions, scan_model_correction: scans, count_gates: writer.counts,
  performance_readiness: writer.performance_readiness, performance_runs: 0, model_calls: 0,
  proposal: { serial_children: 1, children: 30, child_rss_bytes: 8 * GiB, host_free_memory_bytes: 12 * GiB,
    per_profile_ms: { 'P-L': 600000, 'P-H': 3600000, 'P-G': 1800000 }, series_ms: 64800000,
    offline_supervisor_cleanup_ms: 30000, execution_authorized: false },
  observed_host: { free_memory_bytes: freemem(), total_memory_bytes: totalmem(), disk_free_bytes: disk.bavail * disk.bsize },
  unresolved: ['Native process-tree supervisor and RSS boundary not verified', 'Absolute completion-time feasibility not proved',
    'Result allowance is conditional on bounded metric schema; unbounded child failure output is not proved',
    'P-G deterministic append/flush reduction below unchanged 30% threshold; do not silently revise workload or baseline'],
  revised_allocation_reason: 'Include complete operation/count reports and result allowance, not only journals; move 2 GiB from P-G to P-L/P-H within the same 16 GiB.',
  recommendation: 'Do not request performance execution for this candidate; submit deterministic count failure and residual resource premises for Owner review.' }
writeFileSync(join(root, 'revised-resource-budget.json'), JSON.stringify(out, null, 2) + '\n', { flag: 'wx', flush: true })
console.log(JSON.stringify({ required_disk_bytes: out.required_disk_bytes, fixed_disk_sufficient: out.fixed_disk_sufficient,
  count_gates: out.count_gates, performance_readiness: out.performance_readiness }))
