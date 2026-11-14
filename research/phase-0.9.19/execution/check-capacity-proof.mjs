import assert from 'node:assert/strict'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { BINARY_STORAGE } from '../gate2/transaction-frame.mjs'
import { capacityProof } from '../gate2/capacity-proof.mjs'
import { hash } from '../protocol/contracts.mjs'

globalThis.fetch = () => { throw Error('No networking in capacity proof') }
const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-re-ra-rc-20261115'
const options = (runId, storageProtocol) => ({ root, runId, freezeHash: 'a'.repeat(64), storageProtocol, evidenceKind: 'offline-boundary-test',
  limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline-proof' } })
const coordinate = n => ({ family_id: 'capacity', condition: 'C1', arm: 'A', track: 'CLOSED-LOOP', turn_id: 't' + n, stage: 'single' })
const proof = capacityProof(), opt = options('overshoot-current-1mib', BINARY_STORAGE), l = openRunLedger(opt)
const id = l.reserve({ coordinate: coordinate(1), requestBytes: '{}', maxCostMicros: null })
l.captureBatch([{ attemptId: id, channel: 'wire', bytes: Buffer.alloc(1048576, 32), elapsedMs: 1 }])
const path = join(l.path, 'transactions.bin'), before = hash(readFileSync(path))
assert.throws(() => l.captureBatch([{ attemptId: id, channel: 'wire', bytes: Buffer.alloc(3 * 1048576 + 1, 32), elapsedMs: 2 }]), /channel byte budget/)
assert.equal(hash(readFileSync(path)), before)
l.settle({ attemptId: id, outcome: 'error', actualCostMicros: null })
assert.equal(openRunLedger({ ...opt, resume: true }).auditSummary().halted, true)
const histories = []
for (const n of [0, 35, 576]) {
  const oldOptions = options('history-' + n + '-legacy', undefined), newOptions = options('history-' + n + '-binary', BINARY_STORAGE)
  const old = openRunLedger(oldOptions), candidate = openRunLedger(newOptions)
  for (let i = 0; i < n; i++) {
    for (const ledger of [old, candidate]) {
      const attemptId = ledger.reserve({ coordinate: coordinate(i), requestBytes: '{}', maxCostMicros: null })
      ledger.capture({ attemptId, channel: 'wire', bytes: 'synthetic raw', elapsedMs: 1 })
      ledger.capture({ attemptId, channel: 'model', bytes: 'synthetic answer', elapsedMs: 2 })
      ledger.settle({ attemptId, outcome: 'success', actualCostMicros: null })
    }
  }
  const a = openRunLedger({ ...oldOptions, resume: true }).snapshot(), b = openRunLedger({ ...newOptions, resume: true }).snapshot()
  assert.deepEqual(b.attempts, a.attempts); assert.deepEqual(b.budget, a.budget)
  const summary = candidate.auditSummary()
  assert.ok(summary.attempts.every(a => a.compacted && !a.chunks.length))
  histories.push({ slots: n, sparse_only: true, reopened_full_state_equal: true, summary_releases_settled_chunks: true })
}
const result = { ...proof, actual_overshoot_probe: { prefix_preserved: true, unarchivable_delivery_rejected: true,
  halted_on_storage_error: true, missing_overshoot_not_declared_complete: true },
  sparse_history_checks: histories, saturation_proven: false, model_calls: 0,
  note: 'No performance measurements or new policy limits. Synthetic raw is storage-only, not a fabricated provider continuation.' }
writeFileSync(join(root, 'capacity-proof.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', flush: true })
console.log(JSON.stringify({ closed_capacity: result.closed_capacity, live_admission_bytes: result.live_admission_bytes,
  history_slots: histories.map(x => x.slots), new_runtime_limits: false, performance_evaluation: false }))
