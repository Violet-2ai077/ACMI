import assert from 'node:assert/strict'
import { createReadStream, readFileSync, writeFileSync, openSync, closeSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { hash } from '../protocol/contracts.mjs'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { BINARY_STORAGE, scanTransactions } from '../gate2/transaction-frame.mjs'

globalThis.fetch = () => { throw Error('Network prohibited: correctness-only verification') }
const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-re-ra-rc-20261115'
const source = join(root, '../live-20261115-r4/development')
const m = JSON.parse(readFileSync(join(source, 'manifest.json')))
const events = [], expected = []
let previous = hash(readFileSync(join(source, 'manifest.json'))), seq = 0
for await (const line of createInterface({ input: createReadStream(join(source, 'events.jsonl')), crlfDelay: Infinity })) {
  const e = JSON.parse(line), { digest, ...body } = e
  assert.equal(e.seq, ++seq); assert.equal(e.previous, previous); assert.equal(hash(body), digest)
  previous = digest; events.push(e)
  if (e.kind === 'reserve') expected.push({ ...e.value, chunks: [], settlement: null })
  else if (e.kind === 'capture') expected.at(-1).chunks.push({ ...e.value })
  else expected.at(-1).settlement = { ...e.value }
}
assert.equal(seq, 99985)
assert.equal(previous, 'f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924')
const options = { root, runId: 'all35-binary-correctness', freezeHash: m.freezeHash, limits: m.limits,
  revision: m.revision, evidenceKind: 'offline-boundary-test', storageProtocol: BINARY_STORAGE }
const l = openRunLedger(options)
const decode = e => Buffer.from(e.value.bytes_base64, 'base64')
const capture = es => l.captureBatch(es.map(e => ({ attemptId: e.value.attemptId, channel: e.value.channel, bytes: decode(e), elapsedMs: e.value.elapsedMs })))
let reads = 0, attempts = 0
for (let i = 0; i < events.length; i++) {
  const e = events[i], v = e.value
  if (e.kind === 'reserve') l.reserve({ coordinate: v.coordinate, requestBytes: Buffer.from(v.request_base64, 'base64'), maxCostMicros: v.maxCostMicros, answerHash: v.answer_sha256 })
  else if (e.kind === 'settle') {
    l.settle(v)
    const summary = l.auditSummary(), selected = l.readAuditedAttempt(summary, [v.attemptId])
    assert.deepEqual(selected, [expected[attempts++]])
    assert.ok(summary.attempts.every(a => a.compacted && a.chunks.length === 0))
    if (attempts % 5 === 0) console.log(JSON.stringify({ verified_attempts: attempts, performance_evaluation: false }))
  } else if (v.channel === 'transport' && JSON.parse(decode(e)).kind === 'wire_delivery') {
    const raw = events[++i]; assert.equal(raw.value.channel, 'wire')
    assert.equal(JSON.parse(decode(e)).sha256, raw.value.sha256)
    capture([e, raw]); reads++
    const derived = []
    while (['model', 'reasoning'].includes(events[i + 1]?.value.channel)) derived.push(events[++i])
    if (derived.length) capture(derived)
  } else capture([e])
}
const reopened = openRunLedger({ ...options, resume: true })
assert.deepEqual(reopened.snapshot().attempts, expected)
const summary = reopened.auditSummary()
assert.equal(summary.halted, true); assert.equal(summary.attempts.length, 35)
let compared = 0
const path = join(l.path, 'transactions.bin'), fd = openSync(path, 'r')
try {
  scanTransactions(fd, { initialDigest: hash(readFileSync(join(l.path, 'manifest.json'))), onEvent(e) {
    const old = events[compared++]
    assert.deepEqual({ kind: e.kind, value: e.value }, { kind: old.kind, value: old.value })
  } })
} finally { closeSync(fd) }
assert.equal(compared, events.length)
const result = { version: 'transaction-audit-correctness-v1', model_calls: 0, performance_evaluation: false,
  evaluator_calls_on_real_output: 0, source_head: previous, logical_events_equal: compared,
  attempts_equal: attempts, original_read_boundaries: reads, source_times_and_payload_hashes_equal: true,
  selective_audited_attempts_equal: true, reopened_full_state_equal: true, final_halted: summary.halted,
  binary_bytes: statSync(path).size, logical_head: summary.digest, physical_head: summary.physical_digest,
  note: 'No timing/RSS comparison, performance gate, model continuation, rescore or new research freeze.' }
writeFileSync(join(root, 'all35-correctness.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', flush: true })
console.log(JSON.stringify(result))
