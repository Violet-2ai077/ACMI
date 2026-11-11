import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluate } from './benchmark.mjs'
import { protocol } from './contract.mjs'
import { scoreOfflineBatch } from './replay.mjs'

test('prepared corpus uses a nontrivial independent story denominator and does not claim model output', () => {
  const { metrics } = evaluate()
  assert.equal(metrics.decision, 'PASS_OFFLINE_EVAL_READINESS')
  assert.equal(metrics.baseline.validation.paired.expectedSwitch, 7)
  assert.equal(metrics.baseline.validation.on.correctCoverage.n, 3)
  assert.equal(metrics.modelEvaluation.actualRuns, 0)
  assert.equal(metrics.modelEvaluation.pairedResults, null)
  assert.equal(metrics.fixtureRoundTrip.provenance, 'answer_aware_scripted_fixture_not_model_output')
})

test('offline replay keeps missing, duplicate, stale and unknown receipts out of the success numerator', () => {
  const { rows } = evaluate()
  const receipt = r => ({ storyId: r.storyId, mode: r.mode, requestDigest: r.requestDigest, raw: JSON.stringify(r.scriptedResponse) })
  const valid = scoreOfflineBatch(rows, { protocol, records: rows.map(receipt) })
  assert.equal(valid.accepted, rows.length)
  assert.equal(valid.splits.validation.on.exact.n, 14)
  assert.equal(valid.providerRequests, 0)
  const invalid = scoreOfflineBatch(rows, { protocol, records: [
    receipt(rows[0]), receipt(rows[0]), { ...receipt(rows[1]), requestDigest: 'stale' },
    { ...receipt(rows[2]), storyId: 'unknown' },
  ] })
  assert.equal(invalid.accepted, 0)
  assert.equal(invalid.missing, rows.length - 2)
  assert.equal(invalid.duplicateKeys, 1)
  assert.equal(invalid.invalidReceipts, 1)
  assert.equal(invalid.splits.dev.off.exact.d, 14)
})
