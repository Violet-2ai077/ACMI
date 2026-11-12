import assert from 'node:assert/strict'
import test from 'node:test'
import { compareRoles, decide } from './score.mjs'

test('Host fallback is not credited as raw abstention, and no_task is not abstention', () => {
  const expected = { user: 'unresolved', assistant: 'unresolved' }
  const host = { user: 'unresolved', assistant: 'unresolved', issues: ['USER_UNRESOLVED'] }
  assert.deepEqual(compareRoles({ user: null, assistant: { kind: 'no_task' } }, host, expected),
    { userExact: false, assistantExact: false, hostUserExact: true, hostAssistantExact: true, hostRejected: true })
  assert.equal(compareRoles({ user: { kind: 'unresolved' } }, host, expected).userExact, true)
})

test('new proposal needs a matching named goal and existing proposal needs the exact work scope', () => {
  const existing = { taskId: 'same', workId: 'phase' }
  const expected = { user: 'new_task_proposal', assistant: existing, newGoal: 'Alder Rain Log' }
  assert.equal(compareRoles({ user: { kind: 'propose_new', goal: 'A different goal' } }, null, expected).userExact, false)
  assert.equal(compareRoles({ user: { kind: 'propose_new', goal: 'Draft an Alder Rain Log' } }, null, expected).userExact, true)
  assert.equal(compareRoles({ assistant: { kind: 'refer_existing', assignment: { ...existing, workId: null } } }, null, expected).assistantExact, false)
})

test('scoped pass requires incremental raw gain, all safety gates and targeted cases', () => {
  const A = { userExact: 9, assistantExact: 9, answerPassed: 10 }
  const B = { userExact: 10, assistantExact: 10, answerPassed: 10, targetedBoth: 4, relativeContinuedBoth: 2,
    wrongAnchorInheritance: 0, wrongExisting: 0 }
  assert.equal(decide(true, { A, B }), 'PASS_SCOPED_MODEL')
  assert.equal(decide(true, { A, B: { ...B, targetedBoth: 3 } }), 'PASS_HOST_MODEL_GATE_NOT_MET')
  assert.equal(decide(true, { A: B, B }), 'PASS_HOST_MODEL_GATE_NOT_MET')
  assert.equal(decide(true, { A, B: { ...B, wrongExisting: 1 } }), 'PASS_HOST_MODEL_GATE_NOT_MET')
  assert.equal(decide(true, { A: { ...A, answerPassed: 11 }, B }), 'PASS_HOST_MODEL_GATE_NOT_MET')
  assert.equal(decide(false, { A, B }), 'HOST_GATE_NOT_MET')
  assert.equal(decide(false, { A, B }, 'STOPPED'), 'INCONCLUSIVE_STOPPED')
})
