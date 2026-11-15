import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, cpSync, copyFileSync, readdirSync, statfsSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { totalmem, freemem, hostname } from 'node:os'
import { inventoryJournal } from './capacity-workload-inventory.mjs'
import { assessCapacityContract } from '../gate2/capacity-contract.mjs'
import { preparePerformanceManifest, digest, V4_SHA } from './prepare-transaction-performance.mjs'
import { openRunLedger, GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const walk = p => readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(p, e.name)) : [join(p, e.name)])
const save = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx', flush: true })

export async function prepareCapacityReview(output) {
  const root = resolve(output)
  assert.equal(dirname(root), join(GATE2_EVIDENCE_ROOT, 'offline-capacity-performance-prep-20261115'), 'fixed preparation parent required')
  assert.match(basename(root), /^review(?:-[a-z0-9]+)?$/, 'new review directory required')
  mkdirSync(root)
  const source = join(GATE2_EVIDENCE_ROOT, 'live-20261115-r4/development')
  const inventory = await inventoryJournal(source, 'f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924')
  assert.equal(inventory.events, 99985); assert.equal(inventory.reads, 35308); assert.equal(inventory.last.reads, 5667)
  save(join(root, 'workload-inventory.json'), inventory)
  const old = join(GATE2_EVIDENCE_ROOT, 'offline-ro-rs-20261115')
  const baselineFile = join(old, 'benchmark-run-ledger-reconstructed.mjs')
  assert.equal(hash(readFileSync(baselineFile)), V4_SHA, 'baseline pin mismatch')
  const staged = join(root, 'baseline-source')
  cpSync(join(old, 'source-final'), staged, { recursive: true, force: false, errorOnExist: true,
    filter: p => resolve(p) !== resolve(old, 'source-final/gate2/run-ledger.mjs') })
  copyFileSync(baselineFile, join(staged, 'gate2/run-ledger.mjs'))
  const { openRunLedger: legacy } = await import(pathToFileURL(join(staged, 'gate2/run-ledger.mjs')))
  const originalManifest = JSON.parse(readFileSync(join(source, 'manifest.json')))
  const common = { root, freezeHash: 'a'.repeat(64), evidenceKind: 'offline-boundary-test',
    limits: originalManifest.limits, revision: originalManifest.revision }
  const l = legacy({ ...common, runId: 'v4-small' })
  const b = openRunLedger({ ...common, runId: 'v6-small', storageProtocol: 'gate2-transaction-binary-v1' })
  const coordinate = { family_id: 'synthetic', condition: 'C1', arm: 'A', track: 'FROZEN-REPLAY', turn_id: 't1', stage: 'single' }
  for (const ledger of [l, b]) {
    const id = ledger.reserve({ coordinate, requestBytes: '{}', maxCostMicros: null })
    for (const [channel, bytes] of [['transport', 'metadata'], ['wire', 'raw'], ['model', 'answer']]) ledger.capture({ attemptId: id, channel, bytes, elapsedMs: 1 })
    ledger.settle({ attemptId: id, outcome: 'success', actualCostMicros: null })
  }
  assert.deepEqual(l.snapshot().attempts, b.snapshot().attempts)
  const summary = b.auditSummary()
  assert.deepEqual(b.readAuditedAttempt(summary, [summary.attempts[0].attemptId]), l.snapshot().attempts)
  assert.deepEqual(legacy({ ...common, runId: 'v4-small', resume: true }).snapshot().attempts,
    openRunLedger({ ...common, runId: 'v6-small', storageProtocol: 'gate2-transaction-binary-v1', resume: true }).snapshot().attempts)
  const smoke = { synthetic: true, performance_evaluation: false, original_v4_sha256: V4_SHA,
    reserve_capture_settle_reopen_full_and_selective_equal: true,
    limitation: 'One small ledger trace, not P-L/P-H all-event certification or P-G guarded equivalence.' }
  save(join(root, 'baseline-smoke.json'), smoke)
  const proofFile = join(sourceRoot, 'evidence-index/capacity-proof.json')
  const proof = JSON.parse(readFileSync(proofFile)), witnessSha = hash(readFileSync(proofFile))
  const capacityInput = { domain: 'current-live-policy', limits: { admission: 1048576, wire: 4194304, transport: 4194304,
    derived: 8388608, capture: 4194304, calls: 576 }, deliveryProof: {},
    recordBounds: { controls: [null, null, null, null],
      witnesses: [{ kind: 'raw-delivery', channel: 'wire', bytes: proof.counterexamples.raw_total_after_delivery,
        admitted_bytes: proof.counterexamples.admitted_prefix_bytes, delivered_bytes: proof.counterexamples.next_read_bytes,
        reference: 'archived actual synthetic transport counterexample', sha256: witnessSha },
      { kind: 'fragmented-metadata', channel: 'transport', bytes: proof.counterexamples.fragmented_metadata_bytes,
        raw_bytes: proof.live_admission_bytes, reads: proof.counterexamples.fragmented_reads,
        reference: 'archived exact one-byte delivery encoding sum', sha256: witnessSha }] },
    resourceBudget: { frameBytes: null, rssBytes: null, diskBytes: null, auditMs: null, failureReserveBytes: null, artifactBytes: null } }
  save(join(root, 'capacity-assessment.json'), { input: capacityInput, result: assessCapacityContract(capacityInput) })
  const GiB = 1024 ** 3, disk = statfsSync(root)
  const proposed = { disk_bytes: 16 * GiB, rss_bytes: 8 * GiB, required_free_memory_bytes: 12 * GiB, series_ms: 18 * 3600000,
    per_profile_ms: { 'P-L': 600000, 'P-H': 3600000, 'P-G': 1800000 } }
  const fixedJournals = 10 * inventory.last.conservative_journal_bytes + 10 * inventory.conservative_journal_bytes
  const resources = { version: 'offline-resource-proposal-v1', authorized: false, model_calls: 0, performance_evaluation: false,
    proposed, require_free_host_memory_bytes: 12 * GiB, serial_children: 1, maximum_measured_children: 30,
    known_P_L_P_H_journals_conservative_bytes: fixedJournals,
    disk_partition: { P_L_P_H_journals_bytes: 4 * GiB, P_G_journals_bytes: 4 * GiB, source_inputs_reports_bytes: 2 * GiB,
      failure_reserve_bytes: 2 * GiB, unallocated_headroom_bytes: 4 * GiB },
    measured_children_wall_budget_ms: 10 * Object.values(proposed.per_profile_ms).reduce((a, b) => a + b, 0),
    observed_host: { total_memory_bytes: totalmem(), free_memory_bytes: freemem(), filesystem_free_bytes: disk.bavail * disk.bsize },
    unknown: ['P-G full fixed trace size and original-v4 equivalence', 'per-process RSS proof', 'absolute time feasibility',
      'reviewed external supervisor enforcement; not implemented in Task 2'],
    qualification: 'Administrative proposal, not measured consumption or proof. Runtime limits unchanged; no measurements dispatched.' }
  assert.ok(fixedJournals < resources.disk_partition.P_L_P_H_journals_bytes, 'known journal allocation too small')
  save(join(root, 'resource-budget-proposal.json'), resources)
  const pins = dir => walk(dir).filter(p => p.endsWith('.mjs')).map(p => ({ path: p.slice(dir.length).replaceAll('\\', '/'), sha256: hash(readFileSync(p)) })).sort((a, b) => a.path.localeCompare(b.path))
  const inputs = { candidate: { version: 'v6', sources: pins(sourceRoot) },
    baseline: { version: 'v4', sha256: V4_SHA, sources: pins(staged) },
    workloads: [
      { id: 'P-L', sha256: digest(inventory.last), reads: inventory.last.reads },
      { id: 'P-H', sha256: inventory.journal_sha256, reads: inventory.reads },
      { id: 'P-G', sha256: hash(readFileSync(join(sourceRoot, 'tests/gate2-revision-boundary.node-test.mjs'))), reads: null }
    ].map(w => ({ ...w, operations: ['capture', 'audit', 'materialize', 'persist'], compatibility: 'unproven',
      compatibility_sha256: null, budget_proven: false })),
    environment: { node: process.version, host: hostname(), filesystem: 'E: Windows filesystem; verify exact volume type before execution',
      cache: 'unchanged', serial: true, free_memory_bytes: resources.observed_host.free_memory_bytes, free_disk_bytes: resources.observed_host.filesystem_free_bytes },
    budget: proposed }
  save(join(root, 'performance-manifest.json'), preparePerformanceManifest(inputs))
  return { output: root, capacity: 'INFEASIBLE', performance_readiness: 'BLOCKED', model_calls: 0, performance_runs: 0,
    source_events: inventory.events, known_journal_bytes: fixedJournals, original_v4_small_trace_equal: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, 'usage: prepare-capacity-review.mjs <new fixed review directory>')
  process.stdout.write(JSON.stringify(await prepareCapacityReview(process.argv[2]), null, 2) + '\n')
}
