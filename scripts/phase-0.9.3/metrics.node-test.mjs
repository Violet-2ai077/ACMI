import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterIntervals, metrics } from './metrics.mjs'

const row = {
  cluster: 'test', expected: { relation: 'existing', posture: 'switch', status: 'active', targetId: 't1', acts: ['request'],
    claims: ['objective-refined'], mandatory: true },
  relation: 'existing', posture: 'switch', identity: 'active', targetId: 't2', acts: ['request'],
  activeRanks: ['t2', 't1'], historicalRanks: [], analyzed: true, trigger: 'analyze',
  rawClaims: ['objective-refined'], validatedClaims: [], authorization: 'no_operation',
}
test('a guard refusal is not counted as a correct claim and wrong available targets still fail', () => {
  const result = metrics([row])
  assert.deepEqual(result.L3.availableExact, { n: 0, d: 1, rate: 0 })
  assert.equal(result.L3.wrongTarget, 1)
  assert.equal(result.L4.raw.recall.rate, 1)
  assert.equal(result.L4.validated.recall.rate, 0)
  assert.equal(result.L4.validated.precision.rate, null)
})

test('cluster confidence intervals preserve zero denominators and are deterministic', () => {
  const first = clusterIntervals([row], 9302301, 30)
  assert.deepEqual(first, clusterIntervals([row], 9302301, 30))
  assert.equal(first.clusterCount, 1)
  assert.deepEqual(first.intervals.protectedPrecision, { validDraws: 0, low: null, high: null })
})
