import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getFixture, predictionFor, A, B, C } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt, scoreSets, aggregate } from '../evaluator/score.mjs'
import { encodeInline } from '../protocol/wire.mjs'

export function sample(condition = 'C1', id = 'maintenance') {
  const f = getFixture(id)
  const p = buildInput(f.publicScenario, [], { condition, arm: 'A', turnId: 't1' })
  return { f, p, value: predictionFor(f, p), gold: f.oracle[condition].t1 }
}
export function scored(s, value = s.value) {
  const rawPrediction = readRaw(Buffer.from(JSON.stringify(value)), { arm: 'A', inputPacket: s.p })
  return scoreAttempt({ inputPacket: s.p, oracle: s.gold, attempt: { finish_reason: 'stop', arm: 'A', raw_hash: 'fixture', usage: null }, rawPrediction })
}
test('multiset counts and absent denominators', () => {
  assert.deepEqual(scoreSets([A, C], [A, B]), { tp: 1, fp: 1, fn: 1, precision: 0.5, recall: 0.5, f1: 0.5 })
  assert.equal(scoreSets([A, A], [A]).fp, 1)
  assert.equal(scoreSets([], []).precision, null)
  assert.equal(scoreSets([], [A]).recall, 0)
})
test('independent raw readers agree on A/B but reject duplicate/truncated raw', () => {
  const s = sample()
  for (const arm of ['A', 'B']) {
    const raw = arm === 'A' ? JSON.stringify(s.value) : encodeInline(s.value)
    assert.equal(readRaw(Buffer.from(raw), { arm, inputPacket: s.p }).valid, true)
    assert.equal(readRaw(Buffer.from(raw.slice(0, -1)), { arm, inputPacket: s.p }).valid, false)
  }
  const raw = JSON.stringify(s.value).replace('"answer":', '"bad":1,"bad":2,"answer":')
  assert.equal(readRaw(Buffer.from(raw), { arm: 'A', inputPacket: s.p }).valid, false)
  assert.doesNotMatch(readFileSync(new URL('../evaluator/read-raw.mjs', import.meta.url), 'utf8'), /from ['"].*wire\.mjs/)
})
test('birth alpha mapping is anchored to event and does not forgive wrong operation', () => {
  const s = sample('C3')
  assert.equal(scored(s).user.f1, 1)
  const v = structuredClone(s.value)
  v.work_state.decisions[0].actions[0] = { op: 'CONTINUE', task_ids: v.work_state.decisions[0].task_ids }
  assert.equal(scored(s, v).new_tasks.recall, 0)
})
test('invisible UUID and invalid output never become correct abstention', () => {
  const s = sample('C3', 'identity-absent')
  assert.equal(scored(s).identity_recovery, null)
  assert.equal(scored(s).unresolved.f1, 1)
  const rawPrediction = readRaw(Buffer.from('{}'), { arm: 'A', inputPacket: s.p })
  const r = scoreAttempt({ inputPacket: s.p, oracle: s.gold, attempt: {}, rawPrediction })
  assert.equal(r.unresolved.recall, 0)
})
test('condition aggregation is mandatory and mixed groups are rejected', () => {
  const rows = [scored(sample()), scored(sample('C3'))]
  assert.throws(() => aggregate(rows, {}), /condition/)
  assert.throws(() => aggregate(rows, { condition: 'C1', arm: 'A', track: 'CLOSED-LOOP', split: 'dev' }), /mixed/)
})

test('frozen replay seeds birth identities only from visible original historical markers', () => {
  const f = getFixture(), history = []
  for (let i = 1; i < 8; i++) {
    const p = buildInput(f.publicScenario, history, { condition: 'C3', arm: 'A', turnId: 't' + i })
    history.push({ role: 'assistant', source_id: 'a' + i, turn_id: p.turn_id, content: JSON.stringify(predictionFor(f, p)) })
  }
  const p = buildInput(f.publicScenario, history, { condition: 'C3', arm: 'A', turnId: 't8' })
  const value = predictionFor(f, p), gold = f.oracle.C3.t8
  const rawPrediction = readRaw(Buffer.from(JSON.stringify(value)), { arm: 'A', inputPacket: p })
  const r = scoreAttempt({ inputPacket: p, oracle: gold, attempt: { track: 'FROZEN-REPLAY' }, rawPrediction })
  assert.equal(r.user.f1, 1)
  assert.equal(r.state.snapshot_exact, true)
  const bad = structuredClone(p)
  bad.messages = bad.messages.filter(m => m.source_id !== 'a1')
  assert.throws(() => scoreAttempt({ inputPacket: bad, oracle: gold, attempt: { track: 'FROZEN-REPLAY' }, rawPrediction }), /historical birth/)
})
