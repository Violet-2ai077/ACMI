import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReport, zeroErrorUpperBound } from '../report/build.mjs'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt, aggregate } from '../evaluator/score.mjs'

function metric(condition, stale = false) {
  const f = getFixture(), p = buildInput(f.publicScenario, [], { condition, arm: 'A', turnId: 't1' })
  const v = predictionFor(f, p)
  if (stale) v.work_state.task_memory[0].work_items = []
  const row = scoreAttempt({ inputPacket: p, oracle: f.oracle[condition].t1, attempt: { arm: 'A', finish_reason: 'stop' },
    rawPrediction: readRaw(Buffer.from(JSON.stringify(v)), { arm: 'A', inputPacket: p }) })
  return aggregate([row], { condition, arm: 'A', track: 'CLOSED-LOOP', split: 'dev' })
}
test('reports separate conditions, all 18 cells, state and unverified live claims', () => {
  const result = buildReport([metric('C1'), metric('C3', true)], [], { transport: 'fake' })
  assert.deepEqual(Object.keys(result.json.conditions), ['C1', 'C2', 'C3'])
  assert.equal(result.json.conditions.C1[0].cells.length, 18)
  assert.equal(result.json.conditions.C3[0].engineering.state_maintenance, false)
  assert.equal('overall_f1' in result.json, false)
  assert.equal(result.json.decision, 'OFFLINE_ONLY_NOT_RESEARCH_GO')
  assert.equal(result.json.conditions.C2.length, 0)
  assert.equal(result.json.conditions.C1[0].streaming_completion, null)
  assert.equal(JSON.stringify(result), JSON.stringify(buildReport([metric('C1'), metric('C3', true)], [], { transport: 'fake' })))
})
test('risk upper bound is not observed engineering error rate', () => {
  assert.ok(Math.abs(zeroErrorUpperBound(6) - 0.393037768997083) < 1e-12)
  assert.equal(zeroErrorUpperBound(0), null)
  assert.ok(zeroErrorUpperBound(298) > 0.01)
  assert.ok(zeroErrorUpperBound(299) < 0.01)
})
test('D cannot enter main metrics or confirmatory report', () => {
  assert.throws(() => buildReport([{ ...metric('C1'), arm: 'D' }], [], {}), /diagnostic/)
  assert.throws(() => buildReport([], [{ split: 'validation', arm: 'D' }], {}), /dev/)
})
