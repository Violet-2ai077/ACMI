import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { hash } from '../protocol/contracts.mjs'
import { openRunLedger, GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'

const root = fs.mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'transactions-tests-'))
let serial = 0
const coordinate = { family_id: 'transactions', condition: 'C1', arm: 'A', track: 'CLOSED-LOOP', turn_id: 't1', stage: 'single' }
function setup() {
  const options = { root, runId: 'run-' + ++serial, freezeHash: 'a'.repeat(64),
    limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline' },
    evidenceKind: 'offline-boundary-test', storageProtocol: 'raw-first-transaction-v1' }
  const ledger = openRunLedger(options)
  const attemptId = ledger.reserve({ coordinate, requestBytes: '{}', maxCostMicros: null })
  const pair = (time = 1) => [
    { attemptId, channel: 'transport', bytes: 'metadata', elapsedMs: time },
    { attemptId, channel: 'wire', bytes: 'raw', elapsedMs: time }
  ]
  return { options, ledger, attemptId, pair, path: join(ledger.path, 'events.jsonl') }
}

test('v5 is opt-in offline only; physical and logical chains are distinct', () => {
  const x = setup()
  assert.equal(JSON.parse(fs.readFileSync(join(x.ledger.path, 'manifest.json'))).version, 'gate2-run-v5')
  x.ledger.captureBatch(x.pair())
  const state = x.ledger.snapshot()
  assert.equal(state.seq, 3)
  assert.equal(state.physical_seq, 2)
  assert.equal(state.attempts[0].chunks.length, 2)
  assert.equal(x.ledger.diagnostics().append_calls, 2)
  assert.deepEqual(openRunLedger({ ...x.options, resume: true }).snapshot(), state)
  assert.throws(() => openRunLedger({ ...x.options, runId: 'forbidden', evidenceKind: 'development-model-run' }), /offline/)
})

test('invalid batch cannot commit its valid prefix or poison cache', () => {
  const x = setup(), before = fs.readFileSync(x.path)
  assert.throws(() => x.ledger.captureBatch([...x.pair(), { ...x.pair()[0], elapsedMs: -1 }]), /monotonic/)
  assert.deepEqual(fs.readFileSync(x.path), before)
  x.ledger.captureBatch(x.pair(2))
  assert.equal(x.ledger.snapshot().attempts[0].chunks.length, 2)
  assert.throws(() => x.ledger.captureBatch([]), /batch/)
  assert.throws(() => x.ledger.captureBatch([x.pair()[0], { ...x.pair()[1], attemptId: 'other' }]), /attempt/)
})

test('partial frame, full write then flush error, disk full: preserve evidence and poison writer', () => {
  for (const mode of ['partial', 'full', 'none']) {
    const x = setup(), original = fs.appendFileSync
    try {
      fs.appendFileSync = (path, data, options) => {
        if (path !== x.path) return original(path, data, options)
        if (mode !== 'none') original(path, mode === 'full' ? data : data.slice(0, 30), options)
        throw Object.assign(Error('injected disk/flush failure'), { code: mode === 'none' ? 'ENOSPC' : 'EIO' })
      }
      syncBuiltinESMExports()
      assert.throws(() => x.ledger.captureBatch(x.pair()), /failure/)
    } finally { fs.appendFileSync = original; syncBuiltinESMExports() }
    assert.throws(() => x.ledger.captureBatch(x.pair(2)), /poison/)
    if (mode === 'partial') assert.throws(() => openRunLedger({ ...x.options, resume: true }), /partial/)
    else {
      const reopened = openRunLedger({ ...x.options, resume: true })
      assert.equal(reopened.snapshot().attempts[0].settlement, null)
      assert.throws(() => reopened.reserve({ coordinate: { ...coordinate, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null }), /in.flight/)
    }
  }
})

test('raw-only crash, stale lock, foreign append, rollback and same-length tamper fail closed', () => {
  const x = setup()
  x.ledger.captureBatch(x.pair())
  const prefix = fs.readFileSync(x.path)
  const code = `import {openRunLedger} from ${JSON.stringify(new URL('../gate2/run-ledger.mjs', import.meta.url).href)}; const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })});l.capture(${JSON.stringify({ attemptId: x.attemptId, channel: 'model', bytes: 'peer', elapsedMs: 2 })});`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(x.ledger.snapshot().attempts[0].chunks.length, 3)
  assert.throws(() => x.ledger.reserve({ coordinate: { ...coordinate, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null }), /in.flight/)
  const lock = join(x.ledger.path, 'writer.lock')
  fs.writeFileSync(lock, 'crashed')
  assert.throws(() => x.ledger.captureBatch(x.pair(3)), /lock/)
  fs.unlinkSync(lock)
  fs.writeFileSync(x.path, prefix)
  assert.throws(() => x.ledger.snapshot(), /rollback/)
  const y = setup(); y.ledger.captureBatch(y.pair())
  fs.writeFileSync(y.path, fs.readFileSync(y.path, 'utf8').replace('metadata', 'metadatz'))
  // Base64 payload tampering, not a decoded-text substitution.
  fs.writeFileSync(y.path, fs.readFileSync(y.path, 'utf8').replace('bWV0YWRhdGE=', 'bWV0YWRhdGQ='))
  assert.throws(() => y.ledger.snapshot(), /digest/)
})

test('known physical head rejects repacking the identical logical chain into fewer frames', () => {
  const x = setup()
  x.ledger.capture(x.pair()[0]); x.ledger.capture(x.pair()[1])
  const frames = fs.readFileSync(x.path, 'utf8').trim().split('\n').map(JSON.parse)
  const { digest, ...body } = frames[1]
  body.events.push(...frames[2].events); body.last = frames[2].last
  fs.writeFileSync(x.path, JSON.stringify(frames[0]) + '\n' + JSON.stringify({ ...body, digest: hash(body) }) + '\n')
  assert.throws(() => x.ledger.snapshot(), /physical.*rollback/)
})

test('OS-process exit during append leaves both torn frame and stale lock untouched', () => {
  const x = setup(), moduleUrl = new URL('../gate2/run-ledger.mjs', import.meta.url).href
  const code = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {openRunLedger} from ${JSON.stringify(moduleUrl)};
    const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })});const original=fs.appendFileSync;
    fs.appendFileSync=(path,data,options)=>{original(path,data.slice(0,37),options);process.exit(17)};syncBuiltinESMExports();
    l.captureBatch(${JSON.stringify(x.pair())});`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(child.status, 17, child.stderr)
  const before = fs.readFileSync(x.path)
  assert.equal(before.at(-1) === 10, false)
  assert.throws(() => openRunLedger({ ...x.options, resume: true }), /lock/)
  assert.deepEqual(fs.readFileSync(x.path), before)
  // Explicit test-only forensic removal exposes the second failure, never repairs it.
  fs.unlinkSync(join(x.ledger.path, 'writer.lock'))
  assert.throws(() => openRunLedger({ ...x.options, resume: true }), /partial/)
  assert.deepEqual(fs.readFileSync(x.path), before)
})
