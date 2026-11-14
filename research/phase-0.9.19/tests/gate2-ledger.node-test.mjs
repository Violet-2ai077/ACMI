import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'

const root = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2')
mkdirSync(root, { recursive: true })
const evidence = mkdtempSync(join(root, 'ledger-tests-'))
console.log('LEDGER_EVIDENCE ' + evidence)
let serial = 0
function setup(limits = {}) {
  const options = { root: evidence, runId: `run-${++serial}`, freezeHash: 'a'.repeat(64), limits: { maxCalls: 4, maxCostMicros: 100, currency: 'USD', ...limits } }
  return { options, ledger: openRunLedger(options) }
}
const coordinate = (condition = 'C1', turn = 't1', arm = 'A', stage = 'single') => ({ family_id: 'family1', condition, arm, track: arm === 'D' ? 'FROZEN-REPLAY' : 'CLOSED-LOOP', turn_id: turn, stage })
const reserve = (ledger, c = coordinate(), cost = 60, answerHash) => ledger.reserve({ coordinate: c, requestBytes: Buffer.from('body\r\n'), maxCostMicros: cost, answerHash })
const succeed = (l, id, cost = 20) => l.settle({ attemptId: id, outcome: 'success', actualCostMicros: cost })

const uncapped = { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 2, authorizationRef: 'owner-2026-11-14' }
test('Gate 2 uncapped ledger keeps finite schedule, unknown costs and no-retry identity', () => {
  const { ledger: l, options } = setup(uncapped)
  assert.equal(JSON.parse(readFileSync(join(l.path, 'manifest.json'), 'utf8')).version, 'gate2-run-v2')
  const first = reserve(l, coordinate(), null); succeed(l, first, null)
  assert.equal(l.snapshot().halted, false)
  assert.equal(l.snapshot().budget.chargedMicros, null)
  assert.equal(l.snapshot().budget.unknownCostCalls, 1)
  assert.equal(l.snapshot().budget.availableMicros, null)
  assert.throws(() => reserve(l, coordinate(), null), /duplicate/)
  const reopened = openRunLedger({ ...options, resume: true })
  const second = reserve(reopened, coordinate('C2'), null); succeed(reopened, second, 200)
  assert.equal(reopened.snapshot().budget.knownChargedMicros, 200)
  assert.throws(() => reserve(reopened, coordinate('C3'), null), /schedule/)
  assert.throws(() => openRunLedger({ ...options, resume: true, limits: { ...uncapped, scheduledCalls: 3 } }), /manifest/)
})

test('Gate 2 uncapped does not waive transport failure, interrupted calls or malformed policies', () => {
  for (const change of [{ mode: undefined }, { authorizationRef: '' }, { scheduledCalls: null }, { maxCalls: 576 }, { maxCostMicros: 100 }]) {
    assert.throws(() => setup({ ...uncapped, ...change }), /limits/)
  }
  const { ledger: l } = setup(uncapped)
  const first = reserve(l, coordinate(), null)
  assert.throws(() => reserve(l, coordinate('C2'), null), /in.flight/)
  l.settle({ attemptId: first, outcome: 'unknown', actualCostMicros: null })
  assert.equal(l.snapshot().halted, true)
  assert.throws(() => reserve(l, coordinate('C2'), null), /halted/)
})

test('Gate 2 one global budget spans conditions and counts completed reservations forever', () => {
  const { ledger: l } = setup({ maxCalls: 2 })
  assert.equal(JSON.parse(readFileSync(join(l.path, 'manifest.json'), 'utf8')).evidenceKind, 'offline-ledger-test')
  const first = reserve(l); succeed(l, first)
  const second = reserve(l, coordinate('C3')); succeed(l, second)
  assert.deepEqual(l.snapshot().budget, { usedCalls: 2, chargedMicros: 40, reservedMicros: 0, availableMicros: 60 })
  assert.throws(() => reserve(l, coordinate('C2')), /call budget/)
})

test('Gate 2 preserves request bytes before use, releases only known actual cost and refuses duplicate calls', () => {
  const { ledger: l } = setup(), bytes = Buffer.from([0, 13, 10, 0xff])
  const id = l.reserve({ coordinate: coordinate(), requestBytes: bytes, maxCostMicros: 80 })
  bytes.fill(0)
  const a = l.snapshot().attempts[0]
  assert.equal(a.request_sha256, hash(Buffer.from([0, 13, 10, 0xff])))
  assert.deepEqual(Buffer.from(a.request_base64, 'base64'), Buffer.from([0, 13, 10, 0xff]))
  assert.throws(() => reserve(l, coordinate('C2'), 10), /in.flight/)
  succeed(l, id, 70)
  assert.throws(() => reserve(l, coordinate()), /duplicate/)
  assert.throws(() => reserve(l, coordinate('C2'), 31), /cost budget/)
  reserve(l, coordinate('C2'), 30)
})

test('Gate 2 captures original wire and model bytes independently with monotonic receive times', () => {
  const { ledger: l } = setup(), id = reserve(l)
  const bytes = Buffer.from('data: {"delta":"hi"}\r\n\r\n')
  l.capture({ attemptId: id, channel: 'wire', bytes, elapsedMs: 0.1 })
  l.capture({ attemptId: id, channel: 'model', bytes: Buffer.from('hi'), elapsedMs: 0.2 })
  assert.throws(() => l.capture({ attemptId: id, channel: 'wire', bytes, elapsedMs: 0.15 }), /monotonic/)
  const a = l.snapshot().attempts[0]
  assert.deepEqual(Buffer.from(a.chunks[0].bytes_base64, 'base64'), bytes)
  assert.equal(Buffer.from(a.chunks[1].bytes_base64, 'base64').toString(), 'hi')
  succeed(l, id)
  assert.throws(() => l.capture({ attemptId: id, channel: 'wire', bytes, elapsedMs: 1 }), /settled/)
  assert.throws(() => succeed(l, id), /settled/)
})

test('Gate 2 unknown cost, transport failure and cost overrun remain evidence and halt future calls', () => {
  for (const [outcome, actualCostMicros, charge] of [['success', null, 60], ['error', 12, 12], ['unknown', null, 60], ['success', 110, 110]]) {
    const { ledger: l } = setup(), id = reserve(l)
    l.settle({ attemptId: id, outcome, actualCostMicros })
    assert.equal(l.snapshot().halted, true)
    assert.equal(l.snapshot().budget.chargedMicros, charge)
    assert.throws(() => reserve(l, coordinate('C2')), /halted/)
  }
})

test('Gate 2 D stages are separate reservations and marker requires its own successful first stage', () => {
  const { ledger: l } = setup()
  assert.throws(() => reserve(l, coordinate('C1', 't1', 'D', 'marker')), /D answer/)
  const first = reserve(l, coordinate('C1', 't1', 'D', 'answer'))
  l.capture({ attemptId: first, channel: 'model', bytes: Buffer.from('own first answer'), elapsedMs: 1 })
  succeed(l, first)
  assert.throws(() => reserve(l, coordinate('C2', 't1', 'D', 'marker')), /D answer/)
  assert.throws(() => reserve(l, coordinate('C1', 't1', 'D', 'marker'), 60, hash('borrowed answer')), /answer.*digest/)
  reserve(l, coordinate('C1', 't1', 'D', 'marker'), 60, hash('own first answer'))
  assert.equal(l.snapshot().budget.usedCalls, 2)
})

test('Gate 2 independent process resume retains spent budget and blocks an interrupted reservation', () => {
  const { options, ledger: l } = setup(); reserve(l)
  const moduleUrl = pathToFileURL(fileURLToPath(new URL('../gate2/run-ledger.mjs', import.meta.url))).href
  const code = `import { openRunLedger } from ${JSON.stringify(moduleUrl)}; const l=openRunLedger(${JSON.stringify({ ...options, resume: true })}); console.log(JSON.stringify(l.snapshot().budget)); try { l.reserve(${JSON.stringify({ coordinate: coordinate('C2'), requestBytes: 'new body', maxCostMicros: 10 })}); process.exitCode=1 } catch(e) { if (!/in.flight/.test(e.message)) throw e }`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(JSON.parse(child.stdout).usedCalls, 1)
  assert.throws(() => openRunLedger({ ...options, resume: true, limits: { ...options.limits, maxCalls: 576 } }), /manifest/)
  assert.throws(() => openRunLedger(options), /exist/i)
})

test('Gate 2 lock contention, torn writes and hash tampering fail closed', () => {
  const locked = setup(); writeFileSync(join(locked.ledger.path, 'writer.lock'), 'other-writer', { flag: 'wx' })
  assert.throws(() => reserve(locked.ledger), /lock/)
  assert.equal(readFileSync(join(locked.ledger.path, 'writer.lock'), 'utf8'), 'other-writer')
  const torn = setup(); reserve(torn.ledger); appendFileSync(join(torn.ledger.path, 'events.jsonl'), '{')
  assert.throws(() => torn.ledger.snapshot(), /partial|journal/)
  const changed = setup(); reserve(changed.ledger)
  const path = join(changed.ledger.path, 'events.jsonl'), raw = readFileSync(path, 'utf8')
  writeFileSync(path, raw.replace('family1', 'family2'))
  assert.throws(() => changed.ledger.snapshot(), /digest/)
})

test('Gate 2 rejects Gate 1 paths, path escape, symbolic links and invalid inputs', () => {
  const { options, ledger: l } = setup()
  assert.throws(() => openRunLedger({ ...options, root: resolve(root, '../gate-1'), runId: 'forbidden' }), /outside/)
  assert.throws(() => openRunLedger({ ...options, runId: '../escape' }), /run id/)
  const link = join(evidence, 'linked-root'); symlinkSync(evidence, link, 'junction')
  assert.throws(() => openRunLedger({ ...options, root: link, runId: 'linked' }), /linked/)
  assert.throws(() => reserve(l, coordinate(), -1), /cost/)
  assert.throws(() => l.reserve({ coordinate: coordinate(), requestBytes: '', maxCostMicros: 10 }), /request/)
  assert.throws(() => reserve(l, coordinate('C9')), /coordinate/)
  assert.throws(() => reserve(l, coordinate('C1', 't1', 'D', 'single')), /coordinate/)
})

test('Gate 2 two competing processes cannot reserve two calls from a single-call budget', async () => {
  const { options, ledger: l } = setup({ maxCalls: 1 })
  const url = new URL('../gate2/run-ledger.mjs', import.meta.url).href
  const child = condition => new Promise((resolve, reject) => {
    const code = `import { openRunLedger } from ${JSON.stringify(url)}; try { const l=openRunLedger(${JSON.stringify({ ...options, resume: true })}); l.reserve(${JSON.stringify({ coordinate: coordinate(condition), requestBytes: 'synthetic', maxCostMicros: 50 })}); } catch(e) { if (!/lock|in-flight|call budget/.test(e.message)) throw e; process.exitCode=2 }`
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''; p.stderr.on('data', b => { error += b }); p.on('error', reject)
    p.on('close', status => error ? reject(new Error(error)) : resolve(status))
  })
  const statuses = await Promise.all([child('C1'), child('C2')])
  assert.deepEqual(statuses.sort(), [0, 2])
  assert.equal(l.snapshot().budget.usedCalls, 1)
})

test('Gate 2 byte caps and invalid settlements leave original reservation intact', () => {
  const { ledger: l } = setup()
  assert.throws(() => l.reserve({ coordinate: coordinate(), requestBytes: Buffer.alloc(1_048_577), maxCostMicros: 50 }), /request byte/)
  assert.equal(l.snapshot().budget.usedCalls, 0)
  const id = reserve(l)
  assert.throws(() => l.capture({ attemptId: id, channel: 'wire', bytes: Buffer.alloc(4_194_305), elapsedMs: 1 }), /byte budget/)
  assert.throws(() => l.settle({ attemptId: id, outcome: 'success', actualCostMicros: -1 }), /settlement/)
  assert.equal(l.snapshot().budget.reservedMicros, 60)
})

test('Gate 2 altered manifests and caller mutation cannot expand a running budget', () => {
  const { options, ledger: l } = setup({ maxCalls: 1 })
  options.limits.maxCalls = 5
  const id = reserve(l); succeed(l, id)
  assert.throws(() => reserve(l, coordinate('C2')), /call budget/)
  const file = join(l.path, 'manifest.json')
  writeFileSync(file, readFileSync(file, 'utf8').replace('"maxCalls":1', '"maxCalls":5'))
  assert.throws(() => l.snapshot(), /manifest/)
})
