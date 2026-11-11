import assert from 'node:assert/strict'
import test from 'node:test'
import { openDiagnostic, runTraces } from './benchmark.mjs'

test('fixed paired benchmark passes, with nontrivial positive and negative denominators', () => {
  const { report, cases } = runTraces()
  assert.equal(report.decision, 'PASS_READ_ONLY_CONTRACT')
  assert(report.splits.validation.advice.positives >= 10)
  assert(report.splits.validation.advice.negatives >= 10)
  assert.equal(report.splits.validation.advice.invariantPairs.rate, 1)
  assert.equal(report.splits.validation.advice.wrongIdentityOutputs, 0)
  assert(cases.every(({ input }) => !/(?:oracle|expected|split)/u.test(JSON.stringify(Object.keys(input.context)))))
})

test('removing actual confirmation or replacing it with a hypothesis is not treated as user selection', () => {
  const { rows } = runTraces()
  for (const id of ['s11', 's12', 's22', 's23', 's24']) {
    assert(rows.find(r => r.id === id + '.base').outputs.advice.taskId)
    for (const transform of ['remove_confirmation', 'hypothesis_only', 'stale_confirmation', 'foreign_session_confirmation']) {
      assert.deepEqual(rows.find(r => r.id === id + '.' + transform).outputs.advice, { status: 'clarify', taskId: null })
    }
  }
})

test('open diagnostic uses only 0.9.4 open data and does not replace the qualification baseline', () => {
  const out = openDiagnostic()
  assert.equal(out.summaries.validation.n, 59)
  assert.deepEqual(out.summaries.validation.legacy.exactGivenIssued, { n: 9, d: 45, rate: 0.2 })
  assert.equal(out.providerRequests, 0)
  assert.equal(out.holdoutRuns, 0)
})
