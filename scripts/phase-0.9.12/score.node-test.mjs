import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogs, frozen, hash, inputs, roleWire, truth } from './design.mjs'
import { score } from './score.mjs'

const item = inputs.find(x => x.id === 'case-08:B:base')
const wanted = truth.find(x => x.id === item.id)
const links = catalogs.get(item.id).links
const ref = (assignment) => Object.keys(links).find(k => links[k].taskId === assignment.taskId)
const answer = 'Cobalt Board is primary; Ruby Board is related.'
const raw = JSON.stringify({ answer, tag: { user_turn: { kind: 'existing', ref: ref(wanted.user) },
  assistant: { primary: { kind: 'existing', ref: ref(wanted.assistant) }, related: [ref(wanted.related[0])] },
  intent: 'describe_only' } })
const usage = { inputTokens: 10, outputTokens: 12, totalTokens: 22 }
const common = { id: item.id, ticket: 1, generation: 'g0', arm: 'B' }
const step = { ...common, requestDigest: 'req', raw, stop: 'eos', usage, sourceUserSeq: 2, actions: [],
  decoded: { answer, user: wanted.user, assistant: wanted.assistant, related: wanted.related, intent: 'describe_only', issues: [] } }
const row = { id: item.id, leaked: false, unchanged: { graph: true, binding: true, otherJournals: true }, steps: [step], arrivals: [],
  latencyMs: 80, native: { user: { seq: 2 }, session: 'stub', end: 'completed', assistant: [{ text: answer, usage }], calls: [], results: [] } }
const ledger = [{ ...common, kind: 'attempt', inputTokens: 10, requestDigest: 'req' },
  { ...common, kind: 'complete', responseDigest: hash(raw), usage, stop: 'eos', latencyMs: 70 }]

test('frozen A/B packets share same input and authorized catalog; oneOf does not expose gold', () => {
  assert.equal(frozen.inputs, '9ee177b5851e3e5663630d9cd65fdfe38377e8582a097a3798e6f59c36c7c57e')
  assert.equal(inputs.length, 22)
  for (const a of inputs.filter(x => x.arm === 'A')) {
    const b = inputs.find(x => x.arm === 'B' && x.variant === 'base' && x.probe === a.probe)
    assert.equal(a.text, b.text)
    assert.equal(a.binding, b.binding)
    assert.deepEqual(a.candidates, b.candidates)
  }
  const p = roleWire(item, null)
  assert(!JSON.stringify(p).includes(wanted.user.taskId))
  assert.equal(p.schema.properties.tag.properties.user_turn.oneOf.length, 3)
})

test('related and intent have separate scores from primary; unobserved A has no invented numerator', () => {
  const result = score(inputs, truth, [row], ledger, { provenance: 'scripted', stopped: null })
  assert.equal(result.arms.B.userExact, 1)
  assert.equal(result.arms.B.related.correct, 1)
  assert.equal(result.arms.B.intentExact, 1)
  assert.equal(result.arms.A.related, null)
  assert.equal(result.gates.semantic, false)
  assert.equal(result.sameGeneration, 1)
  const drift = { ...row, steps: [{ ...step, decoded: { ...step.decoded, related: [] } }] }
  assert.equal(score(inputs, truth, [drift], ledger, {}).arms.B.related.correct, 0)
})

test('tampered source provenance or backend receipt cannot produce a same-generation success', () => {
  const wrong = { ...row, native: { ...row.native, user: { seq: 3 } } }
  assert.equal(score(inputs, truth, [wrong], ledger, {}).sameGeneration, 0)
  assert.throws(() => score(inputs, truth, [{ ...row, steps: [{ ...step, raw: raw + ' ' }] }], ledger, {}))
  assert.throws(() => score(inputs, truth, [row], [{ ...ledger[0], arm: 'A' }, ledger[1]], {}))
})
