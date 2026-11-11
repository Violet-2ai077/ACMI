import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hash, inputs, truth } from './design.mjs'
import { score } from './score.mjs'

const item = inputs[0], gold = truth[0]
const answer = 'I will outline Balsa Mosaic later.'
const wire = JSON.stringify({ answer, tag: { intent: 'describe_only' } })
const usage = { inputTokens: 30, outputTokens: 12, totalTokens: 42 }
const meta = { id: item.id, arm: item.arm, generation: 'g', ticket: 1 }
const raw = { ...meta, raw: wire, usage, stop: 'eos' }
const ledger = [{ ...meta, kind: 'attempt', inputTokens: 30, requestDigest: 'request' },
  { ...meta, kind: 'complete', responseDigest: hash(wire), usage, stop: 'eos', latencyMs: 70 }]
const step = { ...raw, requestDigest: 'request', sourceUserSeq: 1,
  decoded: { answer, user: gold.user, assistant: gold.assistant, related: [], intent: gold.intent, issues: [] } }
const row = { id: item.id, steps: [step], native: { user: { seq: 1 }, assistant: [{ text: answer, usage }], end: 'completed', calls: [], results: [] },
  leaked: false, unchanged: { graph: true, binding: true, otherJournals: true }, latencyMs: 100 }

test('backend sidecar and native receipt must both match; a partial run is not qualified', () => {
  const s = score(inputs, truth, [row], ledger, [raw], { stopped: null })
  assert.equal(s.arms.A.userExact, 1)
  assert.equal(s.arms.A.sameGeneration, 1)
  assert.equal(s.mechanism, false)
  assert.throws(() => score(inputs, truth, [row], ledger, [], {}))
  assert.throws(() => score(inputs, truth, [row], ledger, [{ ...raw, raw: wire + ' ' }], {}))
})

test('transport evidence retained without native journal is not credited as visible output', () => {
  const s = score(inputs, truth, [], ledger, [raw], { stopped: 'journal' })
  assert.equal(s.performance.completions, 1)
  assert.equal(s.performance.raw, 1)
  assert.equal(s.performance.reconciled, 0)
  assert.equal(s.arms.A.sameGeneration, 0)
  assert.equal(s.outcome, 'INCONCLUSIVE_STOPPED')
})

test('wrong binding and correct response/intent are separate observations', () => {
  const bad = { ...row, steps: [{ ...step, decoded: { ...step.decoded, user: gold.binding } }] }
  const s = score(inputs, truth, [bad], ledger, [raw], {})
  assert.equal(s.arms.A.userExact, 0)
  assert.equal(s.arms.A.userWrongWasBinding, 1)
  assert.equal(s.arms.A.assistantExact, 1)
  assert.equal(s.arms.A.intentExact, 1)
})
