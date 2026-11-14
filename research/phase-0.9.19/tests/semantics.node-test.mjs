import test from 'node:test'
import assert from 'node:assert/strict'
import { getFixture, predictionFor, A, B, C } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt } from '../evaluator/score.mjs'
import { createWireParser, encodeInline } from '../protocol/wire.mjs'

function setup() {
  const f = getFixture()
  const p = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'A', turnId: 't1' })
  const v = predictionFor(f, p)
  const score = x => scoreAttempt({ inputPacket: p, oracle: f.oracle.C1.t1, attempt: { finish_reason: 'stop' },
    rawPrediction: readRaw(Buffer.from(JSON.stringify(x)), { arm: 'A', inputPacket: p }) })
  return { f, p, v, score }
}
test('all six operations have valid protocol witnesses without semantic auto-correction', () => {
  const { p, v } = setup()
  const examples = [
    [{ op: 'CONTINUE', task_ids: [A] }, [A]],
    [{ op: 'SWITCH', from_task_ids: [A], to_task_ids: [B] }, [B]],
    [{ op: 'CREATE', task_id: p.slots[0], objective: 'New goal', acceptance: ['Done'] }, [p.slots[0]]],
    [{ op: 'BRANCH', parent_task_id: A, task_id: p.slots[0], objective: 'Child goal', acceptance: ['Done'] }, [p.slots[0]]],
    [{ op: 'MERGE', source_task_ids: [B, C], target_task_id: A }, [A]],
    [{ op: 'UNRESOLVED' }, []]
  ]
  for (const [action, targets] of examples) {
    const x = structuredClone(v), d = x.work_state.decisions[0]
    d.actions = [action]; d.task_ids = targets
    if (action.op === 'UNRESOLVED') {
      d.unresolved = { reason: 'ambiguous_reference', candidate_task_ids: [], missing_evidence: 'target' }
      d.unresolved_scope_quotes = d.resolved_scope_quotes; d.resolved_scope_quotes = []
    }
    x.work_state.proposed_active_task_ids = targets; x.work_state.focus_task_id = targets[0] ?? null
    x.answer[0].task_ids = targets; x.answer[0].unresolved_reason = d.unresolved?.reason ?? null
    for (const arm of ['A', 'B']) {
      const bytes = Buffer.from(arm === 'A' ? JSON.stringify(x) : encodeInline(x))
      const parser = createWireParser({ arm, inputPacket: p })
      parser.push(bytes)
      assert.equal(parser.finish().valid, true, action.op)
      assert.equal(readRaw(bytes, { arm, inputPacket: p }).valid, true, action.op)
    }
  }
})
test('false lifecycle completion counts even when no work-item claims completion', () => {
  const { v, score } = setup()
  v.work_state.task_memory[0].lifecycle_status = 'completed'
  assert.equal(score(v).state.false_actual_completions, 1)
})
test('extra task memories cannot produce a perfect snapshot metric', () => {
  const { v, score } = setup()
  v.work_state.task_memory.push({ ...structuredClone(v.work_state.task_memory[0]), task_id: C })
  const result = score(v)
  assert.equal(result.state.snapshot_exact, false)
  assert.equal(result.state.per_task.every(t => t.exact), false)
})
test('wrong known target contributes contamination as well as attribution FP', () => {
  const { f, p, v } = setup()
  const gold = f.oracle.C1.t1
  gold.known_tasks.push(B)
  v.work_state.decisions[0].actions = [{ op: 'SWITCH', from_task_ids: [A], to_task_ids: [B] }]
  v.work_state.decisions[0].task_ids = [B]
  v.work_state.proposed_active_task_ids = [B]; v.work_state.focus_task_id = B
  v.answer[0].task_ids = [B]
  const r = scoreAttempt({ inputPacket: p, oracle: gold, attempt: {},
    rawPrediction: readRaw(Buffer.from(JSON.stringify(v)), { arm: 'A', inputPacket: p }) })
  assert.equal(r.contamination.wrong_known, 1)
  assert.equal(r.user.fp, 1)
})

test('ordered operations cannot be swapped while keeping the same targets', () => {
  const { f, p, v } = setup()
  const actions = [{ op: 'CONTINUE', task_ids: [A] }, { op: 'SWITCH', from_task_ids: [A], to_task_ids: [B] }]
  f.oracle.C1.t1.decisions[0].actions = actions
  f.oracle.C1.t1.decisions[0].task_ids = [A, B]
  v.work_state.decisions[0].actions = [...actions].reverse()
  v.work_state.decisions[0].task_ids = [A, B]
  v.work_state.proposed_active_task_ids = [A, B]
  const r = scoreAttempt({ inputPacket: p, oracle: f.oracle.C1.t1, attempt: {},
    rawPrediction: readRaw(Buffer.from(JSON.stringify(v)), { arm: 'A', inputPacket: p }) })
  assert.equal(r.actions_exact, false)
})
