import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { openLedger, EVIDENCE_ROOT } from '../ledger/store.mjs'
import { makeFakeTransport } from '../runner/fake.mjs'
import { runTurn, runDiagnosticPair } from '../runner/run.mjs'

function setup(arm = 'A') {
  const f = getFixture(), p = buildInput(f.publicScenario, [], { condition: 'C1', arm, turnId: 't1' })
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const ledger = openLedger({ root: mkdtempSync(join(EVIDENCE_ROOT, 'runner-')), runId: 'run', scope: { condition: 'C1', arm } })
  return { inputPacket: p, ledger, f, policy: { transport: 'fake', maxCalls: arm === 'D' ? 2 : 1, diagnostic: arm === 'D' } }
}
test('one generation is persisted, cannot repeat after restart, no live transport', async () => {
  const s = setup()
  const transport = makeFakeTransport([{ raw: JSON.stringify(predictionFor(s.f, s.inputPacket)), chunkSize: 31 }])
  const a = await runTurn({ ...s, transport })
  assert.equal(a.valid, true)
  assert.equal(transport.calls(), 1)
  assert.equal(s.ledger.restore().attempts.length, 1)
  await assert.rejects(runTurn({ ...s, policy: { transport: 'fake', maxCalls: 9 }, transport }), /duplicate/)
  await assert.rejects(runTurn({ ...setup(), transport: { kind: 'live', generate() {} } }), /fake/)
})
test('timeout/truncation preserve raw and never retry', async () => {
  const s = setup()
  const transport = makeFakeTransport([{ raw: '{"answer":', finish_reason: 'length' }])
  const r = await runTurn({ ...s, transport })
  assert.equal(r.valid, false)
  assert.equal(transport.calls(), 1)
  assert.equal(s.policy.halted, true)
  assert.equal(s.ledger.restore().proposals.length, 0)
  const slow = setup()
  const t = makeFakeTransport([{ raw: 'slow', delayMs: 1000 }])
  const timeout = await runTurn({ ...slow, policy: { transport: 'fake', maxCalls: 1, timeoutMs: 5 }, transport: t })
  assert.equal(timeout.finish_reason, 'error')
  assert.match(timeout.error, /deadline/)
})
test('D uses own answer, sums usage and cannot enter validation or proposal ledger', async () => {
  const s = setup('D'), v = predictionFor(s.f, s.inputPacket)
  const marker = { work_state: v.work_state, answer_ranges: [{ ...v.answer[0], start: 0, end: 3 }] }
  delete marker.answer_ranges[0].text
  const t = makeFakeTransport([{ raw: '300', usage: { input: 10, output: 1 } }, { raw: JSON.stringify(marker), usage: { input: 20, output: 5 } }])
  const result = await runDiagnosticPair({ ...s, transport: t })
  assert.equal(result.valid, true)
  assert.equal(result.usage.input, 30)
  assert.equal(t.requests()[1].answerText, '300')
  assert.equal(s.ledger.restore().proposals.length, 0)
  const bad = setup('D')
  bad.inputPacket.split = 'validation'
  await assert.rejects(runDiagnosticPair({ ...bad, transport: makeFakeTransport([]) }), /dev/)
})
test('D1 failure cannot spend saved calls on D2; ranges are validated', async () => {
  const s = setup('D'), t = makeFakeTransport([{ raw: 'partial', finish_reason: 'length' }])
  const r = await runDiagnosticPair({ ...s, transport: t })
  assert.equal(r.valid, false)
  assert.equal(t.calls(), 1)
  const other = setup('D'), v = predictionFor(other.f, other.inputPacket)
  const a = { ...v.answer[0], start: 0, end: 99 }; delete a.text
  const bad = await runDiagnosticPair({ ...other, transport: makeFakeTransport([{ raw: '300' }, { raw: JSON.stringify({ work_state: v.work_state, answer_ranges: [a] }) }]) })
  assert.equal(bad.valid, false)
})

test('ordinary closed-loop schema failure keeps raw and continues without adopting invalid state', async () => {
  const s = setup()
  s.policy.maxCalls = 2
  const t = makeFakeTransport([{ raw: '{}' }, { raw: 'unused' }])
  const first = await runTurn({ ...s, transport: t })
  assert.equal(first.valid, false)
  assert.notEqual(s.policy.halted, true)
  assert.equal(first.workState, null)
  const history = [{ role: 'assistant', source_id: 'a1', turn_id: 't1', content: first.raw.toString(), metadata_valid: first.valid, projection: first.workState }]
  const next = buildInput(s.f.publicScenario, history, { condition: 'C1', arm: 'A', turnId: 't2' })
  assert.equal(next.metadata_invalid, true)
  const second = await runTurn({ ...s, inputPacket: next, transport: makeFakeTransport([{ raw: JSON.stringify(predictionFor(s.f, next)) }]) })
  assert.equal(second.valid, true)
  assert.equal(s.ledger.restore().attempts.length, 2)
  assert.equal(s.ledger.restore().proposals.length, 1)
})
