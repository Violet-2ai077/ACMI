import test from 'node:test'
import assert from 'node:assert/strict'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt } from '../evaluator/score.mjs'

function score(change = () => {}) {
  const f = getFixture()
  const p = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'A', turnId: 't1' })
  const v = predictionFor(f, p)
  change(v)
  return scoreAttempt({ inputPacket: p, oracle: f.oracle.C1.t1, attempt: { finish_reason: 'stop' },
    rawPrediction: readRaw(Buffer.from(JSON.stringify(v)), { arm: 'A', inputPacket: p }) })
}
test('complete state is exact, empty updates do not substitute for memory', () => {
  assert.equal(score().state.snapshot_exact, true)
  assert.equal(score(v => { v.work_state.task_memory = [] }).state.snapshot_exact, false)
})
test('correct UUID with stale acceptance fails independently', () => {
  const r = score(v => { v.work_state.task_memory[0].criteria[0].state = 'satisfied' })
  assert.equal(r.user.f1, 1)
  assert.equal(r.state.snapshot_exact, false)
  assert.ok(r.state.by_field.criteria.fp > 0)
})
test('plan completion and missing unfinished work fail', () => {
  const r = score(v => { v.work_state.task_memory[0].work_items[0].state = 'completed' })
  assert.equal(r.state.false_actual_completions, 1)
  assert.equal(score(v => { v.work_state.task_memory[0].work_items = [] }).state.snapshot_exact, false)
})
test('decision changes and wrong identity cannot be hidden by state contents', () => {
  assert.equal(score(v => { v.work_state.task_memory[0].decisions[0].state = 'disputed' }).state.snapshot_exact, false)
  const r = score(v => { v.work_state.task_memory[0].task_id = '44444444-4444-4444-8444-444444444444' })
  assert.equal(r.state.snapshot_exact, false)
  assert.ok(r.state.by_field.lifecycle.fp > 0)
})
