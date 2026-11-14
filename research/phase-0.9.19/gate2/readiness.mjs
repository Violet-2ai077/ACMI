const fields = {
  '': ['model_snapshot', 'route', 'limits', 'pricing', 'freeze', 'spending_policy'],
  spending_policy: ['mode', 'authorization_ref', 'scheduled_calls'],
  route: ['endpoint', 'credential_env'],
  limits: ['max_calls', 'max_cost', 'currency', 'max_input_tokens', 'max_output_tokens', 'timeout_ms'],
  pricing: ['input_per_million', 'output_per_million', 'all_billable_tokens_bounded', 'record_sha256'],
  freeze: ['corpus_sha256', 'prompt_sha256', 'evaluator_sha256', 'review'],
  'freeze.review': ['author', 'reviewer', 'record_sha256', 'mode', 'authorization_sha256']
}
const nonempty = v => typeof v === 'string' && v.trim().length > 0
const positive = v => Number.isFinite(v) && v > 0
const integer = v => Number.isSafeInteger(v) && v > 0
const digest = v => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v)

export function checkReadiness(config) {
  const missing = []
  const uncapped = config?.spending_policy?.mode === 'uncapped'
  const delegated = config?.freeze?.review?.mode === 'owner-delegated-model-review'
  const get = path => path ? path.split('.').reduce((v, key) => v?.[key], config) : config
  const require = (path, predicate) => { if (!predicate(get(path))) missing.push(path) }
  for (const [path, allowed] of Object.entries(fields)) {
    const obj = get(path)
    if (obj != null && (typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !allowed.includes(k)))) missing.push(`${path || 'config'}.unknown-fields`)
  }
  require('model_snapshot', nonempty)
  require('route.endpoint', value => {
    try {
      const u = new URL(value)
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
    } catch { return false }
  })
  require('route.credential_env', v => typeof v === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(v))
  // This preparation version represents the fixed R2 proposal, not arbitrary smaller batches.
  if (config?.spending_policy != null) {
    require('spending_policy.mode', v => v === 'uncapped')
    require('spending_policy.authorization_ref', nonempty)
    require('spending_policy.scheduled_calls', v => v === 576)
  }
  require('limits.max_calls', v => uncapped ? v === null : v === 576)
  require('limits.max_cost', v => uncapped ? v === null : positive(v))
  require('limits.currency', v => typeof v === 'string' && /^[A-Z]{3}$/.test(v))
  for (const key of ['max_input_tokens', 'max_output_tokens', 'timeout_ms']) require(`limits.${key}`, integer)
  const hasPricing = !uncapped || config.pricing !== null
  if (hasPricing) {
    for (const key of ['input_per_million', 'output_per_million']) require(`pricing.${key}`, v => Number.isFinite(v) && v >= 0)
    require('pricing.all_billable_tokens_bounded', v => v === true)
    require('pricing.record_sha256', digest)
  }
  for (const key of ['freeze.corpus_sha256', 'freeze.prompt_sha256', 'freeze.evaluator_sha256', 'freeze.review.record_sha256']) require(key, digest)
  require('freeze.review.author', nonempty)
  require('freeze.review.reviewer', v => nonempty(v) && nonempty(get('freeze.review.author')) && (delegated || v.trim().toLowerCase() !== get('freeze.review.author').trim().toLowerCase()))
  if (get('freeze.review.mode') !== undefined) require('freeze.review.mode', v => v === 'owner-delegated-model-review')
  if (delegated) require('freeze.review.authorization_sha256', digest)
  else if (get('freeze.review.authorization_sha256') !== undefined) missing.push('freeze.review.authorization-without-delegation')
  let worstCase = null
  if (hasPricing && !missing.some(p => p.startsWith('limits.') || p.startsWith('pricing.') || p.startsWith('spending_policy.'))) {
    const l = config.limits, p = config.pricing
    worstCase = Math.ceil((uncapped ? config.spending_policy.scheduled_calls : l.max_calls) * (l.max_input_tokens * p.input_per_million + l.max_output_tokens * p.output_per_million)) / 1e6
    if (!Number.isFinite(worstCase) || (!uncapped && worstCase > l.max_cost)) missing.push('limits.max_cost.insufficient-for-declared-bound')
  }
  return { version: uncapped || delegated ? 'gate2-readiness-v2' : 'gate2-readiness-v1', configuration_complete: !missing.length, missing,
    spending_mode: uncapped ? 'uncapped' : 'bounded', cost_estimate_available: worstCase !== null && Number.isFinite(worstCase),
    review_mode: delegated ? 'owner-delegated-model-review' : 'distinct-reviewers-declared',
    proposed_calls: 576, worst_case_declared_cost: worstCase,
    live_execution_ready: false, artifact_hashes_verified: false,
    remaining_gates: ['artifact-byte-and-hash-verification', delegated ? 'review-provenance-and-authority-verification' : 'human-review-record-verification',
      'provider-wire-adapter-tests', 'durable-global-call-and-cost-reservations', 'frozen-corpus-and-prompt-preflight'] }
}
