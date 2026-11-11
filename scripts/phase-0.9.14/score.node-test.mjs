import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogs, inputs, launches, truth, hash } from './design.mjs'
import { makeAnchorCase } from './controller.mjs'
import { score } from './score.mjs'

const item = inputs[0], gold = truth[0]
const src = { sessionId: item.story, nativeUserId: 'user-1', sourceUserSeq: 1 }
const { receipt } = makeAnchorCase(item, catalogs.get(item.id), launches.get(item.id))(src)
const cats = [...catalogs].map(([id, c]) => ({ id, ...c })), launches0 = [...launches].map(([id, c]) => ({ id, ...c }))
const answer = 'I will continue Tamarind Index.'
const raw = JSON.stringify({ answer, tag: { intent: 'describe_only' } })
const usage = { inputTokens: 20, outputTokens: 8, totalTokens: 28 }
const ids = { ticket: 1, generation: 'g', id: item.id, arm: item.arm }
const completion = { ...ids, raw, stop: 'eos', usage }
const ledger = [{ ...ids, kind: 'attempt', requestDigest: receipt.requestDigest, inputTokens: 20 },
  { ...ids, kind: 'complete', responseDigest: hash(raw), stop: 'eos', usage, latencyMs: 21 }]
const step = { ...completion, requestDigest: receipt.requestDigest, sourceUserSeq: 1,
  decoded: { answer, user: gold.user, assistant: gold.assistant, intent: gold.intent, related: [], issues: [] } }
const row = { id: item.id, steps: [step], native: { session: item.story, user: { seq: 1, id: 'user-1' },
  end: 'completed', assistant: [{ text: answer, usage }], calls: [], results: [] },
leaked: false, unchanged: { graph: true, binding: true, otherJournals: true }, latencyMs: 30 }
const run = (records, observed = [receipt], sidecars = [completion]) => score(inputs, truth, cats, launches0, observed, records,
  ledger, sidecars, { stopped: null })

test('anchor, invisible A input, model accuracy, and host baseline are counted separately', () => {
  const s = run([row])
  assert.equal(s.arms.A.anchorOK, 1)
  assert.equal(s.arms.A.exposed, 0)
  assert.equal(s.arms.A.userExact, 1)
  assert.equal(s.arms.A.naiveHostExact, 1)
  assert.equal(s.hostMechanism, false)
  assert.equal(s.modelCandidate, false)
})

test('tampered origin or completion fails independent reconciliation', () => {
  assert.throws(() => run([row], [{ ...receipt, source: { ...src, nativeUserId: 'other' } }]))
  assert.throws(() => run([row], [receipt], [{ ...completion, raw: raw + ' ' }]))
  assert.throws(() => run([row], [], [completion]))
})

test('a host receipt does not substitute for a native assistant response', () => {
  assert.equal(run([]).performance.anchors, 1)
  assert.equal(run([]).performance.reconciled, 0)
  const rejected = { ...row, native: { ...row.native, end: 'error', assistant: [] }, steps: [{ ...step, decoded: null }] }
  assert.equal(run([rejected]).arms.A.sameGeneration, 0)
})
