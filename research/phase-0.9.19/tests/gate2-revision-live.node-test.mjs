import test from 'node:test'
import assert from 'node:assert/strict'

const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4'
const authorization = 'owner-2026-11-15-revision-freeze-live-r4'
const runtime = {
  protocol_revision: { version: 'gate2-protocol-revision-v1', diagnostic_policy: 'D-180-LOCAL-v1', inline_profile: 'B-inline-v1-ws1', owner_authorization: authorization },
  execution_amendment: { version: 'gate2-revision-live-v1', owner_authorization: authorization, batch_id: 'live-20261115-r4', run_id: 'development', scheduled_calls: 576, retries: 0, resend: false,
    prior_revision_manifest_sha256: 'a335bd5c340249021e534a3a8de23f079e504308cae41bd8350ea6c07470d168' }
}
let api
test('live revision activation has a separately checked Owner grant', async () => {
  api = await import('../gate2/revision-policy.mjs')
  assert.equal(typeof api.checkRevisionExecution, 'function')
  assert.equal(api.checkRevisionExecution(runtime, { root, runId: 'development', scheduledCalls: 576 }), true)
})
test('offline authorization, changed schedule, another batch or retries cannot use the live grant', () => {
  for (const mutate of [r => { r.protocol_revision.owner_authorization = 'owner-2026-11-15-offline-revision' }, r => { delete r.execution_amendment },
    r => { r.execution_amendment.retries = 1 }, r => { r.execution_amendment.resend = true }, r => { r.execution_amendment.scheduled_calls = 577 },
    r => { r.execution_amendment.prior_revision_manifest_sha256 = '0'.repeat(64) }, r => { r.protocol_revision.inline_profile = null }]) {
    const r = structuredClone(runtime); mutate(r)
    assert.throws(() => api.checkRevisionExecution(r, { root, runId: 'development', scheduledCalls: 576 }), /authorization/)
  }
  for (const options of [{ root: root + '-extra', runId: 'development', scheduledCalls: 576 }, { root, runId: 'retry', scheduledCalls: 576 }, { root, runId: 'development', scheduledCalls: 575 }]) {
    assert.throws(() => api.checkRevisionExecution(runtime, options), /authorization/)
  }
})

test('refreeze assembly preserves runtime controls and rejects any study-material change', async () => {
  const freeze = await import('../execution/freeze-r4.mjs').catch(() => ({}))
  assert.equal(typeof freeze.buildRevisionRuntime, 'function')
  const prior = { route: { model_alias: 'unchanged' }, timeout_ms: 180000, max_output_tokens: 16384, max_input_bytes: 131072, max_response_bytes: 1048576, spending_policy: { scheduled_calls: 576, mode: 'uncapped' }, execution_amendment: { historical: true } }
  const current = freeze.buildRevisionRuntime(prior)
  assert.deepEqual(current.route, prior.route)
  for (const k of ['timeout_ms','max_output_tokens','max_input_bytes','max_response_bytes','spending_policy']) assert.deepEqual(current[k], prior[k])
  assert.deepEqual(prior.execution_amendment, { historical: true })
  assert.equal(api.checkRevisionExecution(current, { root, runId: 'development', scheduledCalls: 576 }), true)
  const files = ['public/corpus.json','oracle/corpus.json','plan/schedule.json','prompts/a.txt','prompts/b.txt','prompts/c0.txt','prompts/d.txt'].map(path => ({ path, sha256: 'a'.repeat(64) }))
  assert.equal(freeze.unchangedStudyMaterials(files, structuredClone(files)).length, 7)
  const wrong = structuredClone(files); wrong[1].sha256 = 'b'.repeat(64)
  assert.throws(() => freeze.unchangedStudyMaterials(files, wrong), /study materials/)
  assert.throws(() => freeze.unchangedStudyMaterials(files, files.slice(1)), /study materials/)
})
