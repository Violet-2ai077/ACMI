import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { BINARY_STORAGE } from '../gate2/transaction-frame.mjs'
import { hash } from '../protocol/contracts.mjs'
import { operationTable } from './fixed-workload-contract.mjs'
import { inventoryJournal } from './capacity-workload-inventory.mjs'
import { V4_SHA } from './prepare-transaction-performance.mjs'

const gate = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2'
const root = join(gate, 'offline-workload-bridge-prep-20261115/writer-verification')
const live = join(gate, 'live-20261115-r4/development')
const original = join(gate, 'offline-capacity-performance-prep-20261115/review-final/baseline-source/gate2/run-ledger.mjs')
const save = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx', flush: true })
assert.equal(hash(readFileSync(original)), V4_SHA)
globalThis.fetch = () => { throw Error('no network in correctness pass') }
mkdirSync(root)
await inventoryJournal(live, 'f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924')
const { openRunLedger: originalV4 } = await import(pathToFileURL(original))
const all = readFileSync(join(live, 'events.jsonl'), 'utf8').trimEnd().split('\n').map(JSON.parse)
const manifest = JSON.parse(readFileSync(join(live, 'manifest.json'))), results = []
for (const profile of ['P-L', 'P-H']) {
  const events = profile === 'P-L' ? all.slice(all.findLastIndex(e => e.kind === 'reserve')) : all
  const table = operationTable(events, profile)
  save(join(root, profile + '-operations.json'), table)
  const expected = []
  for (const e of events) {
    if (e.kind === 'reserve') expected.push({ ...e.value, chunks: [], settlement: null })
    else if (e.kind === 'capture') expected.at(-1).chunks.push(e.value)
    else expected.at(-1).settlement = e.value
  }
  for (const arm of ['v4', 'v6']) {
    const factory = arm === 'v4' ? originalV4 : openRunLedger, calls = []
    const options = { root, runId: profile + '-' + arm, freezeHash: manifest.freezeHash, limits: manifest.limits,
      revision: manifest.revision, evidenceKind: 'offline-boundary-test', ...(arm === 'v6' ? { storageProtocol: BINARY_STORAGE } : {}) }
    let ledger, audited, full, totalScans = 0, totalAppends = 0, totalFlushes = 0, totalCacheHits = 0
    for (const op of table.operations) {
      const before = ledger?.diagnostics() ?? { full_replays: 0, append_calls: 0, flush_requests: 0, capture_cache_hits: 0 }
      const es = op.event_indices.map(i => events[i])
      if (op.kind === 'open' || op.kind === 'reopen') ledger = factory({ ...options, resume: op.kind === 'reopen' })
      else if (op.kind === 'reserve') {
        const v = es[0].value
        ledger.reserve({ coordinate: v.coordinate, requestBytes: Buffer.from(v.request_base64, 'base64'),
          maxCostMicros: v.maxCostMicros, answerHash: v.answer_sha256 })
      } else if (op.kind === 'capture') {
        const captures = es.map(e => ({ attemptId: e.value.attemptId, channel: e.value.channel,
          bytes: Buffer.from(e.value.bytes_base64, 'base64'), elapsedMs: e.value.elapsedMs }))
        if (arm === 'v4') for (const c of captures) ledger.capture(c)
        else ledger.captureBatch(captures)
      } else if (op.kind === 'settle') ledger.settle(es[0].value)
      else if (op.kind === 'audit') audited = arm === 'v4' || profile === 'P-L' ? ledger.snapshot() : ledger.auditSummary()
      else if (op.kind === 'materialize') {
        const selected = arm === 'v4' ? audited.attempts.filter(a => a.attemptId === op.attempt_id)
          : ledger.readAuditedAttempt(audited, [op.attempt_id])
        assert.deepEqual(selected, expected.filter(a => a.attemptId === op.attempt_id))
      } else if (op.kind === 'snapshot') { full = ledger.snapshot(); assert.deepEqual(full.attempts, expected) }
      else if (op.kind === 'persist') save(join(root, profile + '-' + arm + '-result.json'), {
        complete: true, state_hash: hash({ attempts: full.attempts, halted: full.halted, budget: full.budget, seq: full.seq }),
        expected_hash: hash(expected), events: table.events, reads: table.reads })
      else assert.fail('unknown operation')
      const after = ledger.diagnostics(), fresh = ['open', 'reopen'].includes(op.kind)
      const delta = key => after[key] - (fresh ? 0 : before[key])
      const row = { operation_id: op.id, kind: op.kind, read_id: op.read_id,
        full_scans: delta('full_replays'), append_calls: delta('append_calls'), flush_requests: delta('flush_requests'),
        cache_hits: delta('capture_cache_hits'), completed: true }
      totalScans += row.full_scans; totalAppends += row.append_calls; totalFlushes += row.flush_requests; totalCacheHits += row.cache_hits
      calls.push(row)
    }
    const result = { profile, arm, performance_evaluation: false, model_calls: 0, complete_writer_replay: true,
      raw_reads: table.reads, logical_events: table.events, full_scans: totalScans, append_calls: totalAppends,
      flush_requests: totalFlushes, capture_cache_hits: totalCacheHits, operation_table_hash: table.sha256,
      journal_bytes: statSync(join(ledger.path, arm === 'v4' ? 'events.jsonl' : 'transactions.bin')).size,
      result_hash: hash(JSON.parse(readFileSync(join(root, profile + '-' + arm + '-result.json')))), calls }
    save(join(root, profile + '-' + arm + '-counts.json'), result); results.push(result)
    console.log(profile + ' ' + arm + ' full writer correctness complete; no timing')
  }
  assert.equal(results.at(-1).result_hash, results.at(-2).result_hash)
}
const guardedRoot = join(gate, 'offline-workload-bridge-prep-20261115/verification')
const guarded = ['v4', 'v6'].map(arm => JSON.parse(readFileSync(join(guardedRoot, arm + '-guarded-operations.json'))))
const counts = ['P-L', 'P-H', 'P-G'].map(profile => {
  const a = profile === 'P-G' ? guarded[0] : results.find(r => r.profile === profile && r.arm === 'v4')
  const b = profile === 'P-G' ? guarded[1] : results.find(r => r.profile === profile && r.arm === 'v6')
  const append = 1 - b.append_calls / a.append_calls, flush = 1 - b.flush_requests / a.flush_requests
  return { profile, original_v4_append: a.append_calls, v6_append: b.append_calls, original_v4_flush: a.flush_requests,
    v6_flush: b.flush_requests, append_reduction: append, flush_reduction: flush,
    unchanged_count_gate: append >= .30 && flush >= .30 ? 'PASS' : 'FAIL',
    original_v4_full_scans: a.full_scans, v6_full_scans: b.full_scans }
})
save(join(root, 'summary.json'), { model_calls: 0, performance_runs: 0, original_v4_sha256: V4_SHA,
  full_writer_correctness: 'PASS', counts, timing_gates: 'NOT_RUN', capacity_closed: false,
  performance_readiness: counts.some(r => r.unchanged_count_gate === 'FAIL') ? 'BLOCKED_BY_COUNT_GATE' : 'BLOCKED_BY_RESOURCE_PROOF',
  qualification: 'Actual non-timing operation counts. No performance series or timing/RSS comparison. No workload adjustment.' })
