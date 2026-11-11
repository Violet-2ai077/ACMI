import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frozen, gold, hash, inputs, wire } from './design.mjs'
import { score } from './score.mjs'

const entry = inputs[1], expected = gold.find(x => x.id === entry.id)
const answer = 'I will check Tern Schedule.'
const ref = entry.candidates.find(x => x.task === 'Tern Schedule').ref
const raw = JSON.stringify({ answer, tag: { user_turn: ref, assistant: ref, basis: 'explicit' } })
const usage = { inputTokens: 3, outputTokens: 6, totalTokens: 9 }
const row = { id: entry.id, leaked: false, latencyMs: 70, unchanged: { graph: true, binding: true, otherJournals: true }, arrivals: [],
  native: { user: { seq: 1 }, session: 'fixture', end: 'completed', assistant: [{ text: answer, usage }], calls: [], results: [] },
  steps: [{ ticket: 1, generation: 'g1', requestDigest: 'p1', sourceUserSeq: 1, raw, stop: 'eos', usage, actions: [],
    decoded: { answer, user: expected.assignment, assistant: expected.assignment, issues: [] } }] }
const common = { ticket: 1, generation: 'g1', id: row.id }
const ledger = [{ ...common, kind: 'attempt', requestDigest: 'p1', inputTokens: 3 },
  { ...common, kind: 'complete', responseDigest: hash(raw), stop: 'eos', usage, latencyMs: 66 }]

test('frozen set separates the host-only truth and limits the wire to legal choices plus abstention', () => {
  assert.equal(inputs.length, 16)
  assert.equal(inputs.filter(i => i.variant === 'base').length, 12)
  assert.equal(inputs.filter(i => i.toolAvailable).length, 2)
  assert.equal(frozen.inputs, 'ab64b348dc1fd4209633c84f68448ece0668f1a929f0bb66f7495ac76995cca6')
  const packet = wire(entry, null)
  assert(!JSON.stringify(packet).includes(expected.assignment.taskId))
  assert.deepEqual(packet.schema.properties.tag.properties.user_turn.enum, [
    ...entry.candidates.map(x => x.ref), 'unresolved', 'no_task', 'new_task_proposal',
  ])
})

test('single receipt is not enough to pass; per-case exact, safe answer, and binding score stay separate', () => {
  const out = score(inputs, gold, [row], ledger, { provenance: 'scripted', stopped: null })
  assert.equal(out.userExact, 1)
  assert.equal(out.bindingExact, 0)
  assert.equal(out.sameGeneration, 1)
  assert.equal(out.assertionPassed, 1)
  assert.equal(out.performance.p95GenerationMs, 66)
  assert.deepEqual(out.gates, { protocol: false, semantic: false, tools: false })
})

test('tampering with raw receipt or relabeling user source cannot yield a same-generation proof', () => {
  const drift = { ...row, steps: [{ ...row.steps[0], raw: raw + ' ' }] }
  assert.throws(() => score(inputs, gold, [drift], ledger, {}))
  const wrong = { ...row, native: { ...row.native, user: { seq: 2 } } }
  assert.equal(score(inputs, gold, [wrong], ledger, {}).sameGeneration, 0)
})
