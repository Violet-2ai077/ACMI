import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { openRunLedger, GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { encodeTransaction, scanTransactions } from '../gate2/transaction-frame.mjs'
const root = fs.mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'stream-audit-'))
let serial = 0
const c = { family_id: 'stream', condition: 'C1', arm: 'A', track: 'CLOSED-LOOP', turn_id: 't1', stage: 'single' }
function setup() {
  const options = { root, runId: 'r-' + ++serial, freezeHash: 'a'.repeat(64), evidenceKind: 'offline-boundary-test', storageProtocol: 'gate2-transaction-binary-v1',
    limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline' } }
  const l = openRunLedger(options)
  const id = l.reserve({ coordinate: c, requestBytes: '{}', maxCostMicros: null })
  const captures = (time = 1) => [{ attemptId: id, channel: 'transport', bytes: 'meta', elapsedMs: time }, { attemptId: id, channel: 'wire', bytes: 'raw', elapsedMs: time }]
  return { options, l, id, captures, file: join(l.path, 'transactions.bin') }
}
test('binary ledger snapshots equal legacy logical events and audited summaries release settled chunks', () => {
  const x = setup(); x.l.captureBatch(x.captures()); x.l.capture({ attemptId: x.id, channel: 'model', bytes: 'answer', elapsedMs: 2 })
  x.l.settle({ attemptId: x.id, outcome: 'success', actualCostMicros: null })
  const full = x.l.snapshot(), before = x.l.diagnostics().full_replays, summary = x.l.auditSummary()
  assert.equal(summary.attempts[0].compacted, true); assert.equal(summary.attempts[0].chunks.length, 0)
  assert.equal(summary.attempts[0].request_base64, undefined)
  assert.equal(summary.attempts[0].model_sha256, hash('answer'))
  assert.deepEqual(x.l.readAuditedAttempt(summary, [x.id]), full.attempts)
  assert.ok(x.l.diagnostics().full_replays >= before + 2)
  assert.deepEqual(openRunLedger({ ...x.options, resume: true }).snapshot(), full)
  assert.throws(() => x.l.readAuditedAttempt(structuredClone(summary), [x.id]), /audit token/)
  assert.throws(() => openRunLedger({ ...x.options, runId: 'live', evidenceKind: 'development-model-run' }), /offline/)
})
test('selective reads cannot use stale audit tokens after another process appends', () => {
  const x = setup(), summary = x.l.auditSummary()
  const source = `import {openRunLedger} from ${JSON.stringify(new URL('../gate2/run-ledger.mjs', import.meta.url).href)};const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })});l.captureBatch(${JSON.stringify(x.captures())});`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.throws(() => x.l.readAuditedAttempt(summary, [x.id]), /stale audit/)
  const next = x.l.auditSummary(); assert.equal(x.l.readAuditedAttempt(next, [x.id])[0].chunks.length, 2)
})
test('binary write/flush failure, partial trailer, stale lock, corruption and rollback fail closed', () => {
  for (const mode of ['none', 'partial', 'full']) {
    const x = setup(), original = fs.appendFileSync
    try {
      fs.appendFileSync = (path, data, options) => {
        if (mode !== 'none') original(path, mode === 'full' ? data : data.subarray(0, data.length - 1), options)
        throw Error('injected flush failure')
      }; syncBuiltinESMExports()
      assert.throws(() => x.l.captureBatch(x.captures()), /flush failure/)
    } finally { fs.appendFileSync = original; syncBuiltinESMExports() }
    assert.throws(() => x.l.captureBatch(x.captures(3)), /poison/)
    if (mode === 'partial') assert.throws(() => openRunLedger({ ...x.options, resume: true }), /partial/)
    else assert.throws(() => openRunLedger({ ...x.options, resume: true }).reserve({ coordinate: { ...c, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null }), /in.flight/)
  }
  const x = setup(), before = fs.readFileSync(x.file)
  x.l.captureBatch(x.captures()); fs.writeFileSync(x.file, before)
  assert.throws(() => x.l.auditSummary(), /rollback/)
  const y = setup(); y.l.captureBatch(y.captures())
  const raw = fs.readFileSync(y.file); raw[raw.length - 1] ^= 1; fs.writeFileSync(y.file, raw)
  assert.throws(() => y.l.snapshot(), /digest/)
  const z = setup(); fs.writeFileSync(join(z.l.path, 'writer.lock'), 'stale')
  assert.throws(() => z.l.auditSummary(), /lock/)
})
test('summary retains verified D1 byte hash for a later D2 reservation', () => {
  const x = setup(); x.l.settle({ attemptId: x.id, outcome: 'success', actualCostMicros: null })
  const dc = { ...c, arm: 'D', track: 'FROZEN-REPLAY', stage: 'answer' }
  const first = x.l.reserve({ coordinate: dc, requestBytes: '{}', maxCostMicros: null })
  x.l.capture({ attemptId: first, channel: 'model', bytes: 'D1 answer', elapsedMs: 1 })
  x.l.settle({ attemptId: first, outcome: 'success', actualCostMicros: null })
  assert.throws(() => x.l.reserve({ coordinate: { ...dc, stage: 'marker' }, requestBytes: '{}', maxCostMicros: null, answerHash: hash('wrong') }), /D answer digest/)
  x.l.reserve({ coordinate: { ...dc, stage: 'marker' }, requestBytes: '{}', maxCostMicros: null, answerHash: hash('D1 answer') })
  assert.equal(x.l.snapshot().attempts.length, 3)
})

test('physical re-framing rollback is rejected even when every logical event stays identical', () => {
  const x = setup(); x.l.capture(x.captures()[0]); x.l.capture(x.captures()[1])
  const events = [], fd = fs.openSync(x.file, 'r')
  const initial = hash(fs.readFileSync(join(x.l.path, 'manifest.json')))
  try { scanTransactions(fd, { initialDigest: initial, onEvent: e => events.push(e) }) } finally { fs.closeSync(fd) }
  const first = encodeTransaction({ seq: 1, previous: initial, events: events.slice(0, 1) })
  const rest = encodeTransaction({ seq: 2, previous: first.digest, events: events.slice(1) })
  fs.writeFileSync(x.file, Buffer.concat([first.bytes, rest.bytes]))
  assert.throws(() => x.l.auditSummary(), /physical.*rollback/)
})

test('a summary caller cannot forge the allowed selection of its opaque audit token', () => {
  const x = setup(), summary = x.l.auditSummary()
  summary.attempts.push({ attemptId: 'f'.repeat(64) })
  assert.throws(() => x.l.readAuditedAttempt(summary, ['f'.repeat(64)]), /selection/)
})

test('valid physical seals cannot hide an invalid logical digest', () => {
  const x = setup(); x.l.captureBatch(x.captures())
  const initial = hash(fs.readFileSync(join(x.l.path, 'manifest.json'))), events = [], fd = fs.openSync(x.file, 'r')
  try { scanTransactions(fd, { initialDigest: initial, onEvent: e => events.push(e) }) } finally { fs.closeSync(fd) }
  events[2].value.bytes_base64 = Buffer.from('changed').toString('base64')
  const first = encodeTransaction({ seq: 1, previous: initial, events: events.slice(0, 1) })
  const rest = encodeTransaction({ seq: 2, previous: first.digest, events: events.slice(1) })
  fs.writeFileSync(x.file, Buffer.concat([first.bytes, rest.bytes]))
  assert.throws(() => openRunLedger({ ...x.options, resume: true }), /journal digest/)
})

test('process exit inside binary append preserves stale lock and partial tail', () => {
  const x = setup(), moduleUrl = new URL('../gate2/run-ledger.mjs', import.meta.url).href
  const code = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {openRunLedger} from ${JSON.stringify(moduleUrl)};
    const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })});const original=fs.appendFileSync;
    fs.appendFileSync=(path,data,opts)=>{original(path,data.subarray(0,113),opts);process.exit(17)};syncBuiltinESMExports();l.captureBatch(${JSON.stringify(x.captures())});`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(child.status, 17, child.stderr)
  const bytes = fs.readFileSync(x.file)
  assert.throws(() => openRunLedger({ ...x.options, resume: true }), /lock/)
  fs.unlinkSync(join(x.l.path, 'writer.lock'))
  assert.throws(() => openRunLedger({ ...x.options, resume: true }), /partial/)
  assert.deepEqual(fs.readFileSync(x.file), bytes)
})

test('a valid foreign append during streaming audit invalidates the audit before publication', () => {
  const x = setup(); x.l.captureBatch(x.captures())
  const s = x.l.snapshot(), v = s.attempts[0].chunks.at(-1)
  const body = { seq: s.seq + 1, previous: s.digest, kind: 'capture', value: { ...v, attemptId: x.id, elapsedMs: 2 } }
  const frame = encodeTransaction({ seq: s.physical_seq + 1, previous: s.physical_digest, events: [{ ...body, digest: hash(body) }] })
  const original = fs.readSync; let injected = false
  try {
    fs.readSync = (...args) => {
      const n = original(...args)
      if (!injected) { injected = true; fs.appendFileSync(x.file, frame.bytes, { flush: true }) }
      return n
    }; syncBuiltinESMExports()
    assert.throws(() => x.l.auditSummary(), /changed during audit/)
  } finally { fs.readSync = original; syncBuiltinESMExports() }
  assert.equal(injected, true)
  assert.equal(x.l.snapshot().attempts[0].chunks.length, 3)
})
