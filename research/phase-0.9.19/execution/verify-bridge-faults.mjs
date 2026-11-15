import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, cpSync, mkdirSync, openSync, closeSync, fstatSync, ftruncateSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { superviseSynthetic } from './offline-measurement-bridge.mjs'

const base = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2'
const root = join(base, 'offline-workload-bridge-prep-20261115')
const source = join(root, 'verification')
const out = join(root, 'fault-validation')
globalThis.fetch = () => { throw Error('offline only') }
mkdirSync(out)
const oldPath = join(base, 'offline-capacity-performance-prep-20261115/review-final/baseline-source/gate2/run-ledger.mjs')
const { openRunLedger: originalV4 } = await import(pathToFileURL(oldPath))
const rows = []
for (const fault of ['partial_tail', 'corrupt_payload']) for (const arm of ['v4', 'v6']) {
  const name = arm === 'v4' ? 'pair-1-v4' : 'candidate'
  const from = join(source, 'pl', name), target = join(out, fault + '-' + arm, name)
  assert.ok(resolve(target).startsWith(resolve(out) + '\\'), 'fault target escape')
  mkdirSync(join(out, fault + '-' + arm))
  cpSync(from, target, { recursive: true, errorOnExist: true, force: false })
  const file = join(target, arm === 'v4' ? 'events.jsonl' : 'transactions.bin')
  const before = hash(readFileSync(file)), fd = openSync(file, 'r+')
  try {
    if (fault === 'partial_tail') ftruncateSync(fd, fstatSync(fd).size - 1)
    else writeSync(fd, Buffer.from([0]), 0, 1, arm === 'v4' ? 200 : 120)
  } finally { closeSync(fd) }
  const m = JSON.parse(readFileSync(join(target, 'manifest.json')))
  let error = null
  try {
    const l = (arm === 'v4' ? originalV4 : openRunLedger)({ root: join(out, fault + '-' + arm), runId: name,
      resume: true, freezeHash: m.freezeHash, limits: m.limits, revision: m.revision,
      evidenceKind: m.evidenceKind, storageProtocol: m.storageProtocol })
    l.snapshot()
  } catch (e) { error = e.message }
  assert.ok(error, 'damaged evidence accepted')
  rows.push({ arm, fault, before_sha256: before, after_sha256: hash(readFileSync(file)), error, accepted: false,
    original_source_unchanged: hash(readFileSync(join(from, arm === 'v4' ? 'events.jsonl' : 'transactions.bin'))) === before })
}
const policy = { disk_bytes: 16 * 1024 ** 3, rss_bytes: 8 * 1024 ** 3, child_ms: 3600000, cleanup_ms: 30000 }
assert.ok(rows.every(r => r.original_source_unchanged), 'fault source changed')
const simulations = ['ENOSPC', 'partial_write', 'missing_scan', 'result_flush_failed', 'child_crash'].map(reason =>
  ({ reason, result: superviseSynthetic([{ kind: 'start' }, { kind: 'fault', reason }, { kind: 'exit', code: 1 }], policy) }))
const result = { performance_evaluation: false, model_calls: 0, actual_file_faults: rows,
  supervisor_simulations: simulations, native_disk_exhaustion_or_job_object_executed: false,
  qualification: 'Actual derived-file corruption plus pure supervisor fault simulation, not native process-control certification.' }
writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', flush: true })
console.log(JSON.stringify({ actual_file_faults_rejected: rows.length, simulated_faults: simulations.length, model_calls: 0 }))
