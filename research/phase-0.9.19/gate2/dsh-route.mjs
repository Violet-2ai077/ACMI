const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const token = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v)
const fail = () => { throw new Error('unsupported or ambiguous DSH route configuration') }
const allowed = (v, fields) => { if (!object(v) || Object.keys(v).some(k => !fields.includes(k))) fail() }
const positiveInteger = v => Number.isSafeInteger(v) && v > 0

export function selectedDshDefault(entries) {
  if (!Array.isArray(entries)) fail()
  const defaults = entries.filter(e => e?.id === 'agent-default-model')
  if (defaults.length !== 1) fail()
  allowed(defaults[0], ['id', 'config'])
  const selected = defaults[0].config
  allowed(selected, ['provider', 'model', 'reasoningEffort'])
  if (!token(selected.provider) || !token(selected.model) || !token(selected.reasoningEffort)) fail()
  return { ...selected }
}

// This deliberately supports a narrow data-only profile, not Cordis composition.
export function selectDshRoute({ entries, catalog }) {
  const selected = selectedDshDefault(entries)
  const adapters = entries.filter(e => e?.id === 'llm-pi-ai')
  if (adapters.length !== 1) fail()
  allowed(adapters[0], ['id', 'config'])
  allowed(adapters[0].config, ['providers'])
  const provider = adapters[0].config.providers?.[selected.provider]
  allowed(provider, ['apiKeyEnv', 'models', 'baseURL', 'api', 'displayName'])
  if (typeof provider.apiKeyEnv !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(provider.apiKeyEnv) || !Array.isArray(provider.models)) fail()
  const overrides = provider.models.filter(m => m?.id === selected.model)
  if (overrides.length !== 1) fail()
  const override = overrides[0]
  allowed(override, ['id', 'name', 'contextWindow', 'maxTokens', 'input'])
  const models = Object.values(catalog ?? {}).flatMap(group => object(group) ? Object.values(group) : [])
    .filter(m => m?.id === selected.model && m?.provider === selected.provider)
  if (models.length !== 1) fail()
  const model = models[0]
  if (model.api !== 'openai-completions' || (provider.api !== undefined && provider.api !== model.api)) fail()
  const base = provider.baseURL ?? model.baseUrl
  let url
  try { url = new URL(base) } catch { fail() }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail()
  const effort = model.thinkingLevelMap?.[selected.reasoningEffort]
  if (effort !== selected.reasoningEffort || model.compat?.thinkingFormat !== 'deepseek' || model.compat?.maxTokensField !== 'max_tokens') fail()
  const context = override.contextWindow ?? model.contextWindow, output = override.maxTokens ?? model.maxTokens
  if (!positiveInteger(context) || !positiveInteger(output) || output > context) fail()
  return {
    version: 'gate2-dsh-route-v1', provider: selected.provider, model_alias: selected.model,
    model_snapshot_verified: false, api: model.api,
    endpoint: url.href.replace(/\/+$/, '') + '/chat/completions',
    credential_ref: provider.apiKeyEnv, reasoning_effort: effort,
    thinking_format: 'deepseek', max_tokens_field: 'max_tokens',
    assistant_reasoning_content_required: model.compat.requiresReasoningContentOnAssistantMessages === true,
    context_window_declared: context, output_tokens_declared: output,
    effective_profile_verified: false, live_execution_ready: false
  }
}
