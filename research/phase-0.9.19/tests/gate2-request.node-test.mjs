import test from 'node:test'
import assert from 'node:assert/strict'
import { compileRequest } from '../gate2/request.mjs'
import { buildInput } from '../context/build.mjs'
import { getFixture } from '../corpus/fixtures.mjs'
import { hash } from '../protocol/contracts.mjs'

const prompts = { A: 'TEST A', B: 'TEST B', C0: 'TEST answer', D: 'TEST marker' }
function packet(condition = 'C3', arm = 'A') { return buildInput(getFixture().publicScenario, [], { condition, arm, turnId: 't1' }) }

test('Gate 2 compiler exports raw dialogue and protocol metadata, never evaluator labels', () => {
  const p = packet(), original = structuredClone(p)
  p.oracle = 'ORACLE_CANARY'; p.category = 'CATEGORY_CANARY'; p.identity_visibility = 'IDENTITY_CANARY'
  p.catalog = [{ note: 'CATALOG_CANARY' }]; p.active = ['ACTIVE_CANARY']; p.projection = { value: 'PROJECTION_CANARY' }
  const c = compileRequest(p, { prompts })
  assert.deepEqual(c.body.messages, original.messages)
  for (const secret of ['ORACLE_CANARY', 'CATEGORY_CANARY', 'IDENTITY_CANARY', 'CATALOG_CANARY', 'ACTIVE_CANARY', 'PROJECTION_CANARY']) assert.equal(c.serialized.includes(secret), false)
  assert.equal(c.request_hash, hash(c.serialized))
  assert.equal(c.prompt_hash, hash(prompts.A))
  assert.deepEqual(c.body.metadata.unit_ids, p.unit_ids)
  assert.deepEqual(c.body.metadata.slots, p.slots)
  assert.equal(c.serialized, compileRequest(p, { prompts }).serialized)
  assert.equal(p.oracle, 'ORACLE_CANARY')
})

test('Gate 2 compiler retains C1 state and C2/C3 exact historical messages', () => {
  const p = packet('C1'), c = compileRequest(p, { prompts })
  assert.deepEqual(c.body.metadata.catalog[0].acceptance, p.catalog[0].acceptance)
  assert.equal(c.serialized.includes('HOST_ONLY_CANARY'), false)
  for (const condition of ['C2', 'C3']) {
    const q = packet(condition)
    q.messages.push({ role: 'assistant', source_id: 'a0', content: 'raw \\n <|acmi: broken marker' })
    q.sourceMap.a0 = q.messages.at(-1).content
    assert.deepEqual(compileRequest(q, { prompts }).body.messages, q.messages)
  }
})

test('Gate 2 answer-only and D stage separation cannot invent a second-generation answer', () => {
  const c0 = compileRequest(packet('C3', 'C0'), { prompts })
  assert.equal(c0.body.instructions, prompts.C0)
  assert.equal('slots' in c0.body.metadata, false)
  const d = packet('C3', 'D'), answer = 'line\r\n😀 <|acmi: literal'
  assert.equal(compileRequest(d, { prompts, stage: 'answer' }).body.instructions, prompts.C0)
  const second = compileRequest(d, { prompts, stage: 'marker', answerText: answer })
  assert.equal(second.body.diagnostic_answer, answer)
  assert.equal(second.answer_hash, hash(answer))
  for (const opts of [{ stage: 'marker' }, { stage: 'answer', answerText: answer }, {}]) assert.throws(() => compileRequest(d, { prompts, ...opts }), /stage|answer/)
  assert.throws(() => compileRequest(packet(), { prompts, stage: 'marker', answerText: answer }), /stage/)
})

test('Gate 2 compiler refuses missing prompts, mismatched source maps and duplicate sources', () => {
  assert.throws(() => compileRequest(packet(), { prompts: {} }), /prompt/)
  const p = packet(); p.sourceMap.u1 = 'different'
  assert.throws(() => compileRequest(p, { prompts }), /source/)
  const q = packet(); q.messages.push(q.messages[0])
  assert.throws(() => compileRequest(q, { prompts }), /source/)
})
