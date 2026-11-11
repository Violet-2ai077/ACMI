import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import cfg from './config.json' with { type: 'json' }
import { input, truth, hashes } from './corpus.mjs'
import { score } from './score.mjs'

const h = s => createHash('sha256').update(s).digest('hex')
const raw = JSON.stringify({ assistant_response: 'Cedar Shelf deliverable', acmi_attribution: { generation_ref: 'g' } })
const proposal = { generation: 'g', sourceUserTurn: 'u', user: truth[0].user, response: truth[0].response,
  work: truth[0].work, support: 'sufficient', related: [] }
const usage = { inputTokens: 8, outputTokens: 5, totalTokens: 13 }
const first = { ticket: 1, generation: 'g', raw, usage, requestDigest: 'rq', stop: 'eos', proposal, answer: 'Cedar Shelf deliverable', actions: [] }
const row = { id: input[0].id, group: 'pilot', arm: 'B', steps: [first], latencyMs: 100,
  unchanged: { journal: true, graph: true }, metadataLeak: false,
  native: { user: { ref: 'u' }, end: 'completed', assistant: [{ text: first.answer, usage }], calls: [], results: [] } }
const receipt = { ticket: 1, id: row.id, generation: 'g', arm: 'B', group: 'pilot' }
const records = [
  { ...receipt, kind: 'attempt', requestDigest: 'rq', inputTokens: 8 },
  { ...receipt, kind: 'complete', stop: 'eos', responseDigest: h(raw), usage, latencyMs: 70 },
]
const run = { provenance: 'scripted', stopped: 'fixture', pilotPassed: false }

test('frozen corpus separates gold, balances targets, preserves identity on permutation, and fixes the control split', () => {
  assert.deepEqual(hashes, { inputs: cfg.caseDigest, groundTruth: cfg.truthDigest })
  assert.equal(input.length, 120)
  assert.equal(input.filter(x => x.split === 'pilot').length, 24)
  assert.equal(input.filter(x => x.arms.includes('C')).length, 20)
  assert(!JSON.stringify(input).includes(truth[0].user))
  for (const split of ['pilot', 'main']) {
    const counts = [1, 2, 3, 4, 8].map(position => truth.filter(x => x.id.startsWith(split) && x.id.endsWith(':base')
      && x.targetPosition === position).length)
    assert(Math.min(...counts) > 0 && Math.max(...counts) - Math.min(...counts) <= 1)
  }
  for (const variant of input.filter(x => x.variant !== 'base')) {
    const baseId = variant.id.replace(/:[^:]+$/u, ':base')
    const base = input.find(x => x.id === baseId)
    assert.equal(base.text, variant.text)
    assert.equal(truth.find(x => x.id === baseId).user, truth.find(x => x.id === variant.id).user)
    assert.notDeepEqual(base.candidates.map(x => x.objective), variant.candidates.map(x => x.objective))
    if (variant.variant === 'rename') assert(!variant.candidates.some(c => base.candidates.some(b => b.task === c.task)))
  }
})

test('one known accepted row is scored, and unobserved arms are null denominators', () => {
  const result = score(input, truth, [row], records, run)
  assert.equal(result.pilot.user.selectiveAccuracy, 1)
  assert.equal(result.pilot.protocol.sameGeneration, 1)
  assert.equal(result.pilot.performance.totalTokens, 13)
  assert.equal(result.pilot.performance.generationLatencyMs.p95, 70)
  assert.equal(result.arms.C.user.coverage, null)
  assert.equal(result.arms.C.performance.generationLatencyMs.p95, null)
})

test('unseen attempts and native invalid envelopes do not become successes', () => {
  const rejected = { ...row, native: { ...row.native, end: 'error', assistant: [] }, steps: [{ ...first, proposal: null, error: 'UNKNOWN' }] }
  const result = score(input, truth, [rejected], records, run)
  assert.equal(result.pilot.answer.rawFieldPassed, 1)
  assert.equal(result.pilot.answer.passed, 0)
  assert.equal(result.pilot.protocol.sameGeneration, 0)
  assert.equal(result.pilot.protocol.nativeCompleted, 0)
  assert.equal(result.pilot.user.coverage, 0)
  assert.equal(score(input, truth, [], records, run).missingNativeCompletions, 1)
})

test('independent receipt reconciliation rejects altered completions', () => {
  assert.throws(() => score(input, truth, [{ ...row, steps: [{ ...first, raw: raw + ' ' }] }], records, run))
  assert.throws(() => score(input, truth, [row, row], records, run), /duplicate native generation/u)
})
