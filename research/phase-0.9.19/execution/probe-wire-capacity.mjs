import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { createWireAccounting } from '../gate2/wire-accounting.mjs'

// Synthetic capacity evidence only; no provider, evaluator, or frozen package writer.
globalThis.fetch = () => { throw Error('offline only') }
const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-ro-rs-20261115'
const revision = JSON.parse(readFileSync(join(root, '../live-20261115-r4/development/manifest.json'))).revision
const options = (runId, v5 = true) => ({ root, runId, freezeHash: 'b'.repeat(64), revision, evidenceKind: 'offline-boundary-test',
  ...(v5 ? { storageProtocol: 'raw-first-transaction-v1' } : {}),
  limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline-capacity' } })
const coordinate = i => ({ family_id: 'synthetic-capacity', condition: 'C1', arm: 'A', track: 'CLOSED-LOOP', turn_id: 't' + i, stage: 'single' })
const save = (name, value) => writeFileSync(join(root, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', flush: true })
const [mode, label, countText, format] = process.argv.slice(2)

if (mode === 'history') {
  const count = Number(countText), v5 = format === 'v5'
  assert.ok([0, 35, 576].includes(count))
  const opt = options(label, v5), ledger = openRunLedger(opt), began = performance.now()
  for (let i = 0; i < count; i++) {
    const id = ledger.reserve({ coordinate: coordinate(i), requestBytes: '{}', maxCostMicros: null })
    const captures = [
      { attemptId: id, channel: 'transport', bytes: JSON.stringify({ kind: 'wire_delivery', index: 0, phase: 'generation', byte_length: 4, sha256: hash('wire') }), elapsedMs: 1 },
      { attemptId: id, channel: 'wire', bytes: 'wire', elapsedMs: 1 }
    ]
    if (v5) ledger.captureBatch(captures)
    else captures.forEach(c => ledger.capture(c))
    ledger.capture({ attemptId: id, channel: 'model', bytes: 'synthetic', elapsedMs: 2 })
    ledger.settle({ attemptId: id, outcome: 'success', actualCostMicros: null })
  }
  const audit = performance.now(), state = openRunLedger({ ...opt, resume: true }).snapshot()
  const auditMs = performance.now() - audit
  assert.equal(state.attempts.length, count)
  save(label, { model_calls: 0, synthetic: true, sparse_history_only: true, count, v5,
    elapsed_ms: performance.now() - began, reopen_snapshot_ms: auditMs, peak_rss_kib: process.resourceUsage().maxRSS,
    journal_bytes: statSync(join(ledger.path, 'events.jsonl')).size, diagnostics: ledger.diagnostics(),
    limitation: 'Three tiny captures per slot; not a proof for 576 near-limit real responses.' })
} else if (mode === 'capacity') {
  const cases = []
  for (const limit of [1048576, 4194304]) {
    const ledger = openRunLedger(options('capacity-' + limit)), id = ledger.reserve({ coordinate: coordinate(0), requestBytes: '{}', maxCostMicros: null })
    const raw = Buffer.alloc(limit, 32)
    const capture = (bytes, index) => ledger.captureBatch([
      { attemptId: id, channel: 'transport', bytes: JSON.stringify({ kind: 'wire_delivery', index, phase: 'generation', byte_length: bytes.length, sha256: hash(bytes) }), elapsedMs: index },
      { attemptId: id, channel: 'wire', bytes, elapsedMs: index }
    ])
    capture(raw, 0)
    const before = hash(readFileSync(join(ledger.path, 'events.jsonl')))
    let rejected = null
    try { capture(Buffer.from('x'), 1) } catch (error) { rejected = error.message }
    if (limit === 4194304) {
      assert.match(rejected, /channel byte budget/)
      assert.equal(hash(readFileSync(join(ledger.path, 'events.jsonl'))), before)
    } else assert.equal(rejected, null)
    cases.push({ synthetic: true, admission_candidate: limit, exact_limit_stored: true, overshoot_bytes: 1,
      overshoot_stored: rejected === null, error: rejected,
      conclusion: rejected ? 'NO_CLOSED_BUDGET: wire channel has no overshoot/cleanup headroom' : 'This particular +1 byte read fits; no universal read-size bound proved.' })
  }
  const meta = n => Buffer.byteLength(JSON.stringify({ kind: 'wire_delivery', elapsed_ms: 180000, index: n,
    phase: 'generation', byte_length: 1, sha256: '0'.repeat(64) }))
  const fragmented = [1048576, 4194304].map(n => {
    let bytes = 0
    for (let digits = 1, start = 0; start < n; digits++) {
      const end = Math.min(n, 10 ** digits)
      bytes += (end - start) * meta(start)
      start = end
    }
    return { wire_bytes: n, reads: n, transport_delivery_bytes: bytes,
      transport_channel_limit: 4194304, fits: bytes <= 4194304, method: 'Exact ASCII JSON byte sum grouped by index digit width; no physical millions-of-read replay.' }
  })
  const observer = createWireAccounting({ maxFrameBytes: 128 })
  for (let i = 0; i < 4194304; i++) observer.submit(Buffer.from('x'))
  assert.equal(observer.snapshot().unclassified_bytes, 4194304)
  save('capacity-recommendation', { model_calls: 0, live_limit_unchanged: 1048576, candidate: 4194304,
    cases, fragmentation: fragmented, bounded_observation_overflow: observer.snapshot(),
    decision: 'DO_NOT_PROMOTE_4_MIB', closed_capacity_vector_proven: false,
    reasons: ['No raw overshoot/cleanup storage headroom at 4 MiB.', 'Read-count metadata can exceed current transport channel at both admission values.',
      'Fetch maximum read size and cleanup volume are not proven bounds.', 'Sparse 576-slot probes are not a full-volume disk/RSS/audit capacity proof.'],
    required_next_decision: 'Separate explicit resource-vector/read-count/transaction limits proposal or storage architecture review; no automatic cap increase.' })
} else throw Error('history <label> 0|35|576 v4|v5, or capacity')
