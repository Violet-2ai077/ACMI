import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { hash } from '../protocol/contracts.mjs'
import { GATE2_EVIDENCE_ROOT, openRunLedger } from '../gate2/run-ledger.mjs'
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs'

const revision = { version: 'gate2-protocol-revision-v1', diagnostic_policy: 'D-180-LOCAL-v1', inline_profile: 'B-inline-v1-ws1', owner_authorization: 'owner-2026-11-15-offline-revision' }
mkdirSync(GATE2_EVIDENCE_ROOT, { recursive: true })
const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'revision-ledger-'))
let serial = 0
const coordinate = { family_id: 'synthetic', condition: 'C3', arm: 'D', track: 'FROZEN-REPLAY', turn_id: 't1', stage: 'answer' }
const limits = { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'owner-test' }
function setup(rev = revision, target = { ...coordinate, stage: 'marker' }) {
  const options = { root, runId: 'run-' + (++serial), freezeHash: 'a'.repeat(64), limits, evidenceKind: 'offline-boundary-test', ...(rev ? { revision: rev } : {}) }
  const ledger = openRunLedger(options)
  const first = ledger.reserve({ coordinate, requestBytes: '{}', maxCostMicros: null })
  ledger.capture({ attemptId: first, channel: 'model', bytes: 'answer', elapsedMs: 1 })
  ledger.settle({ attemptId: first, outcome: 'success', actualCostMicros: null })
  const c = target
  const id = ledger.reserve({ coordinate: c, requestBytes: '{}', maxCostMicros: null, answerHash: c.arm === 'D' && c.stage === 'marker' ? hash('answer') : null })
  ledger.capture({ attemptId: id, channel: 'transport', bytes: JSON.stringify({ kind: 'pre_send', freeze_hash: options.freezeHash, coordinate: c, input_packet: { split: 'dev' } }), elapsedMs: 0 })
  return { options, ledger, id }
}
async function capture(x, mutate = e => e) {
  let now = 0, trigger, release
  const sse = delta => Buffer.from('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n')
  const parts = [sse({ reasoning_content: 'synthetic prefix' })]
  const clock = { now: () => now, setTimeout: fn => { trigger = fn; return 1 }, clearTimeout() {} }
  const promise = performDeadlineCompletion({ request: { bytes: Buffer.from('{}'), sha256: hash('{}'), endpoint: 'https://synthetic.invalid/' }, credential: 'SYNTHETIC',
    timeoutMs: 180000, maxResponseBytes: 1048576, clock,
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: () => parts.length ? Promise.resolve({ value: parts.shift(), done: false }) : new Promise(r => { release = r }),
      cancel: () => { release({ value: sse({ content: 'cleanup-only' }), done: false }); return Promise.resolve() }
    }) } }),
    record(e) { e = mutate(e); if (!e) return
      const channel = { wire: 'wire', content: 'model', reasoning: 'reasoning' }[e.kind]
      const v = e.kind === 'request' ? { kind: 'request', sha256: e.sha256, elapsed_ms: e.elapsed_ms } : e
      x.ledger.capture({ attemptId: x.id, channel: channel ?? 'transport', bytes: channel ? e.bytes : JSON.stringify(v), elapsedMs: e.elapsed_ms })
    } })
  for (let i = 0; i < 30; i++) await Promise.resolve()
  now = 180000; trigger()
  return promise
}
test('v4 persists a failed diagnostic censor, resumes next coordinate and never repeats D2', async () => {
  const x = setup(); await capture(x)
  x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null })
  const manifest = JSON.parse(readFileSync(join(x.ledger.path, 'manifest.json')))
  assert.equal(manifest.version, 'gate2-run-v4')
  const recovered = openRunLedger({ ...x.options, resume: true }).snapshot()
  assert.equal(recovered.halted, false)
  assert.equal(recovered.budget.unknownCostCalls, 2)
  assert.equal(recovered.budget.chargedMicros, null)
  assert.throws(() => x.ledger.reserve({ coordinate: { ...coordinate, stage: 'marker' }, requestBytes: '{}', maxCostMicros: null, answerHash: hash('answer') }), /duplicate/)
  x.ledger.reserve({ coordinate: { ...coordinate, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null })
})
test('v3 remains global-stop and cannot acquire v4 meaning on reopen', async () => {
  const x = setup(null); await capture(x)
  assert.throws(() => x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }))
  x.ledger.settle({ attemptId: x.id, outcome: 'error', actualCostMicros: null })
  assert.equal(x.ledger.snapshot().halted, true)
  assert.throws(() => openRunLedger({ ...x.options, revision, resume: true }), /manifest/)
})
test('censor requires immutable terminal evidence, closure, prefix integrity and no earlier errors', async () => {
  for (const mutate of [
    e => e.kind === 'terminal' ? null : e,
    e => { if (e.kind === 'terminal') e.result.termination.local_pipeline_closed = false; return e },
    e => { if (e.kind === 'terminal') e.result.termination.errors = ['invalid_utf8']; return e },
    e => { if (e.kind === 'terminal') e.result.termination.wire_sha256 = '0'.repeat(64); return e },
    e => { if (e.kind === 'terminal') e.result.finish_reason = 'length'; return e },
    e => { if (e.kind === 'wire_delivery') e.phase = 'generation'; return e },
    e => e.kind === 'wire_delivery' ? null : e
  ]) {
    const x = setup(); await capture(x, mutate)
    assert.throws(() => x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }))
    assert.equal(x.ledger.snapshot().attempts.at(-1).settlement, null)
  }
})
test('in-flight restart, stale lock and D1 binding still block further sends', async () => {
  const x = setup(); await capture(x)
  const resumed = openRunLedger({ ...x.options, resume: true })
  assert.throws(() => resumed.reserve({ coordinate: { ...coordinate, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null }), /in.flight/)
  writeFileSync(join(x.ledger.path, 'writer.lock'), 'synthetic-other-writer')
  assert.throws(() => resumed.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }), /lock/)
})

test('identical timeout facts cannot exempt D1, A, B or C0; bounded/unknown policies are rejected', async () => {
  for (const target of [{ ...coordinate, turn_id: 't2' }, ...['A', 'B', 'C0'].map(arm => ({ ...coordinate, arm, track: 'CLOSED-LOOP', stage: 'single' }))]) {
    const x = setup(revision, target); await capture(x)
    assert.throws(() => x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }), /censor/)
    x.ledger.settle({ attemptId: x.id, outcome: 'error', actualCostMicros: null })
    assert.equal(x.ledger.snapshot().halted, true)
  }
  assert.throws(() => openRunLedger({ root, runId: 'bounded', freezeHash: 'a'.repeat(64), limits: { maxCalls: 10, maxCostMicros: 100, currency: 'USD' }, revision }), /uncapped/)
  assert.throws(() => setup({ ...revision, diagnostic_policy: 'allow-all' }), /revision/)
  const x = setup()
  assert.throws(() => openRunLedger({ ...x.options, resume: true, revision: { ...revision, inline_profile: null } }), /manifest/)
})

test('two OS processes cannot both settle the same censored generation', async () => {
  const x = setup(); await capture(x)
  const moduleUrl = new URL('../gate2/run-ledger.mjs', import.meta.url).href
  const source = `import {openRunLedger} from ${JSON.stringify(moduleUrl)}; try { const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })}); l.settle(${JSON.stringify({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null })}); process.stdout.write('settled'); } catch { process.stdout.write('rejected'); }`
  const child = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', source], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''; p.stdout.on('data', b => { out += b }); p.stderr.on('data', b => { err += b })
    p.on('error', reject); p.on('close', code => code ? reject(Error(err)) : resolve(out))
  })
  const outcomes = await Promise.all([child(), child()])
  assert.deepEqual(outcomes.sort(), ['rejected', 'settled'])
  const state = x.ledger.snapshot()
  assert.equal(state.halted, false)
  assert.equal(state.attempts.filter(a => a.settlement?.outcome === 'diagnostic_censored').length, 1)
})
