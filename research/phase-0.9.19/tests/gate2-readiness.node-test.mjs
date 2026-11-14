import test from 'node:test'
import assert from 'node:assert/strict'
import { checkReadiness } from '../gate2/readiness.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function complete() {
  return { model_snapshot: 'synthetic-pinned-test-version', route: { endpoint: 'https://synthetic.invalid/generate', credential_env: 'SYNTHETIC_TEST_KEY' },
    limits: { max_calls: 576, max_cost: 100, currency: 'USD', max_input_tokens: 20000, max_output_tokens: 8000, timeout_ms: 120000 },
    pricing: { input_per_million: 1, output_per_million: 2, all_billable_tokens_bounded: true, record_sha256: 'a'.repeat(64) },
    freeze: { corpus_sha256: 'b'.repeat(64), prompt_sha256: 'c'.repeat(64), evaluator_sha256: 'd'.repeat(64),
      review: { author: 'human-author', reviewer: 'human-reviewer', record_sha256: 'e'.repeat(64) } } }
}

test('Gate 2 readiness lists concrete unresolved inputs without reading credentials', () => {
  const r = checkReadiness({})
  assert.equal(r.configuration_complete, false)
  for (const path of ['model_snapshot', 'route.endpoint', 'route.credential_env', 'limits.max_calls', 'limits.max_cost', 'freeze.review.author', 'freeze.review.reviewer']) assert.ok(r.missing.includes(path), path)
  assert.equal(r.live_execution_ready, false)
})

test('Gate 2 declared configuration is not evidence of a live adapter or human review', () => {
  const r = checkReadiness(complete())
  assert.equal(r.configuration_complete, true)
  assert.deepEqual(r.missing, [])
  assert.equal(r.worst_case_declared_cost, 20.736)
  assert.equal(r.live_execution_ready, false)
  assert.equal(r.artifact_hashes_verified, false)
  assert.ok(r.remaining_gates.includes('human-review-record-verification'))
})

test('Gate 2 budgets, identity of reviewers and secure endpoint declarations fail closed', () => {
  for (const mutate of [c => { c.limits.max_calls = 575 }, c => { c.limits.max_cost = 0.01 },
    c => { c.limits.max_calls = 577 }, c => { c.limits.max_output_tokens = Infinity },
    c => { c.pricing.all_billable_tokens_bounded = false }, c => { c.pricing.output_per_million = -1 },
    c => { c.route.endpoint = 'http://example.invalid' }, c => { c.route.endpoint = 'https://user:secret@example.invalid' },
    c => { c.route.endpoint = 'https://example.invalid/?api_key=secret' }, c => { c.route.credential_env = 'secret value' },
    c => { c.freeze.review.reviewer = c.freeze.review.author }, c => { c.freeze.corpus_sha256 = 'pending' }]) {
    const c = complete(); mutate(c); assert.equal(checkReadiness(c).configuration_complete, false)
  }
})

test('Gate 2 configuration rejects unknown fields instead of archiving secret values', () => {
  const c = complete(); c.route.api_key = 'NEVER_ECHO_THIS'
  const r = checkReadiness(c)
  assert.equal(r.configuration_complete, false)
  assert.equal(JSON.stringify(r).includes('NEVER_ECHO_THIS'), false)
  assert.ok(r.missing.includes('route.unknown-fields'))
})

test('Gate 2 malformed reviewer fields return blockers rather than crashing', () => {
  for (const author of [42, {}, [], true]) {
    const c = complete(); c.freeze.review.author = author
    assert.equal(checkReadiness(c).configuration_complete, false)
  }
})

test('Gate 2 CLI lists missing config and rejects all live flags without a transport', () => {
  const cli = new URL('../gate2/cli.mjs', import.meta.url)
  const config = new URL('../gate2/config.template.json', import.meta.url)
  const run = args => spawnSync(process.execPath, [fileURLToPath(cli), ...args], { encoding: 'utf8' })
  const r = run(['check', fileURLToPath(config)])
  assert.equal(r.status, 2)
  assert.equal(JSON.parse(r.stdout).live_execution_ready, false)
  const rejected = run(['check', fileURLToPath(config), '--live'])
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /Offline usage/)
})

test('Gate 2 explicit uncapped policy is distinct from missing caps and missing pricing', () => {
  const c = complete()
  c.limits.max_calls = null; c.limits.max_cost = null; c.pricing = null
  assert.equal(checkReadiness(c).configuration_complete, false)
  c.spending_policy = { mode: 'uncapped', authorization_ref: 'owner-2026-11-14', scheduled_calls: 576 }
  const r = checkReadiness(c)
  assert.equal(r.configuration_complete, true)
  assert.equal(r.spending_mode, 'uncapped')
  assert.equal(r.worst_case_declared_cost, null)
  assert.equal(r.cost_estimate_available, false)
  assert.equal(r.live_execution_ready, false)
  for (const mutate of [
    x => { x.spending_policy.authorization_ref = '' },
    x => { x.spending_policy.scheduled_calls = null },
    x => { x.spending_policy.mode = 'unlimited' },
    x => { x.limits.max_cost = 100 },
    x => { x.limits.max_output_tokens = null },
    x => { x.pricing = { api_key: 'NEVER_ECHO_THIS' } }
  ]) {
    const x = structuredClone(c); mutate(x)
    assert.equal(checkReadiness(x).configuration_complete, false)
  }
})

test('Gate 2 delegated review needs explicit provenance but not a fictitious second human', () => {
  const c = complete()
  c.freeze.review.reviewer = c.freeze.review.author
  assert.equal(checkReadiness(c).configuration_complete, false)
  Object.assign(c.freeze.review, { mode: 'owner-delegated-model-review', authorization_sha256: 'f'.repeat(64) })
  const r = checkReadiness(c)
  assert.equal(r.configuration_complete, true)
  assert.equal(r.review_mode, 'owner-delegated-model-review')
  assert.equal(r.live_execution_ready, false)
  assert.equal(r.remaining_gates.includes('human-review-record-verification'), false)
  delete c.freeze.review.authorization_sha256
  assert.equal(checkReadiness(c).configuration_complete, false)
  c.freeze.review.mode = 'unrecognized'
  assert.equal(checkReadiness(c).configuration_complete, false)
})
