import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { hash } from '../protocol/contracts.mjs'
import { openRunLedger, GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs'

const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'transaction-policy-'))
const revision = { version: 'gate2-protocol-revision-v1', diagnostic_policy: 'D-180-LOCAL-v1', inline_profile: 'B-inline-v1-ws1', owner_authorization: 'offline-owner' }
const base = { family_id: 'synthetic', condition: 'C1', arm: 'D', track: 'FROZEN-REPLAY', turn_id: 't1', stage: 'answer' }
let serial = 0
async function attempt({ arm = 'D', stage = 'marker', fail = null, cleanup = 0, storageProtocol = 'raw-first-transaction-v1' } = {}) {
  const options = { root, runId: 'r-' + ++serial, freezeHash: 'a'.repeat(64), evidenceKind: 'offline-boundary-test',
    storageProtocol, revision,
    limits: { mode: 'uncapped', maxCalls: null, maxCostMicros: null, currency: 'USD', scheduledCalls: 576, authorizationRef: 'offline' } }
  const ledger = openRunLedger(options)
  if (stage === 'marker') {
    const first = ledger.reserve({ coordinate: base, requestBytes: '{}', maxCostMicros: null })
    ledger.capture({ attemptId: first, channel: 'model', bytes: 'answer', elapsedMs: 0 })
    ledger.settle({ attemptId: first, outcome: 'success', actualCostMicros: null })
  }
  const coordinate = { ...base, arm, stage: arm === 'D' ? stage : 'single', track: arm === 'D' ? 'FROZEN-REPLAY' : 'CLOSED-LOOP' }
  const id = ledger.reserve({ coordinate, requestBytes: '{}', maxCostMicros: null, answerHash: arm === 'D' && stage === 'marker' ? hash('answer') : null })
  ledger.capture({ attemptId: id, channel: 'transport', bytes: JSON.stringify({ kind: 'pre_send', freeze_hash: options.freezeHash, coordinate, input_packet: { split: 'dev' } }), elapsedMs: 0 })
  let now = 0, trigger, release
  const clock = { now: () => now, setTimeout(fn, ms) { if (ms === 180000) trigger = fn; return fn }, clearTimeout() {} }
  const sse = Buffer.from('data: {"choices":[{"index":0,"delta":{"reasoning_content":"prefix"},"finish_reason":null}]}\n\n')
  const parts = [fail === 'bytes' ? Buffer.alloc(1048577, 32) : sse]
  const convert = e => ({ attemptId: id, channel: ({ wire: 'wire', content: 'model', reasoning: 'reasoning' })[e.kind] ?? 'transport',
    bytes: ['wire', 'content', 'reasoning'].includes(e.kind) ? e.bytes : JSON.stringify(e), elapsedMs: e.elapsed_ms })
  const promise = performDeadlineCompletion({ request: { bytes: Buffer.from('{}'), sha256: hash('{}'), endpoint: 'https://offline.invalid/' }, credential: 'SYNTHETIC',
    timeoutMs: 180000, maxResponseBytes: 1048576, accounting: true, clock,
    record(e) { if (fail === 'terminal' && e.kind === 'terminal') throw Error('disk'); ledger.capture(convert(e)) },
    recordBatch(es) { if (fail === 'derived' && es[0].kind === 'reasoning') throw Error('disk'); ledger.captureBatch(es.map(convert)) },
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: () => parts.length ? Promise.resolve({ value: parts.shift(), done: false }) : new Promise(r => { release = r }),
      cancel: async () => { now += cleanup; release?.({ done: true }) }
    }) } }) })
  for (let i = 0; i < 40; i++) await Promise.resolve()
  now = Math.max(now, 180000); trigger()
  return { options, ledger, id, result: await promise }
}

test('v5 permits only evidenced D2 deadline censor, not bytes/storage/cleanup or other arms', async () => {
  const valid = await attempt()
  valid.ledger.settle({ attemptId: valid.id, outcome: 'diagnostic_censored', actualCostMicros: null })
  const state = openRunLedger({ ...valid.options, resume: true }).snapshot()
  assert.equal(state.halted, false)
  assert.equal(state.attempts.at(-1).settlement.outcome, 'diagnostic_censored')
  for (const config of [{ arm: 'D', stage: 'answer' }, ...['A', 'B', 'C0'].map(arm => ({ arm, stage: 'single' })),
    { fail: 'bytes' }, { fail: 'derived' }, { fail: 'terminal' }, { cleanup: 5001 }]) {
    const x = await attempt(config)
    assert.throws(() => x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }), /censor/)
    x.ledger.settle({ attemptId: x.id, outcome: 'error', actualCostMicros: null })
    assert.equal(x.ledger.snapshot().halted, true)
    assert.throws(() => x.ledger.reserve({ coordinate: { ...base, turn_id: 't2' }, requestBytes: '{}', maxCostMicros: null }), /halted/)
  }
})

test('two OS processes cannot both settle a v5 censored attempt', async () => {
  const x = await attempt(), moduleUrl = new URL('../gate2/run-ledger.mjs', import.meta.url).href
  const code = `import {openRunLedger} from ${JSON.stringify(moduleUrl)};try{const l=openRunLedger(${JSON.stringify({ ...x.options, resume: true })});l.settle(${JSON.stringify({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null })});process.stdout.write('settled')}catch{process.stdout.write('rejected')}`
  const child = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; p.stdout.on('data', b => { out += b }); p.on('error', reject); p.on('close', c => c ? reject(Error('child exit ' + c)) : resolve(out))
  })
  const outcomes = await Promise.all([child(), child()])
  assert.deepEqual(outcomes.sort(), ['rejected', 'settled'])
  assert.equal(openRunLedger({ ...x.options, resume: true }).snapshot().attempts.at(-1).settlement.outcome, 'diagnostic_censored')
  assert.ok(readFileSync(join(x.ledger.path, 'events.jsonl')).length)
})

test('binary streaming audit retains narrow D2 censor and all resource/other-arm vetoes', async () => {
  const storageProtocol = 'gate2-transaction-binary-v1', good = await attempt({ storageProtocol })
  good.ledger.settle({ attemptId: good.id, outcome: 'diagnostic_censored', actualCostMicros: null })
  assert.equal(openRunLedger({ ...good.options, resume: true }).auditSummary().halted, false)
  for (const config of [{ arm: 'D', stage: 'answer' }, ...['A', 'B', 'C0'].map(arm => ({ arm, stage: 'single' })),
    { fail: 'bytes' }, { fail: 'derived' }, { fail: 'terminal' }, { cleanup: 5001 }]) {
    const x = await attempt({ ...config, storageProtocol })
    assert.throws(() => x.ledger.settle({ attemptId: x.id, outcome: 'diagnostic_censored', actualCostMicros: null }), /censor/)
    x.ledger.settle({ attemptId: x.id, outcome: 'error', actualCostMicros: null })
    assert.equal(openRunLedger({ ...x.options, resume: true }).auditSummary().halted, true)
  }
})
