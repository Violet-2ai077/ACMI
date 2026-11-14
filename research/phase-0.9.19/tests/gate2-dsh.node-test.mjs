import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDshRoute } from '../gate2/dsh-route.mjs'
import { inspectDsh } from '../gate2/dsh-inspect.mjs'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const secret = 'SECRET_MUST_NOT_APPEAR'
function fixture() {
  return {
    entries: [
      { id: 'llm-pi-ai', config: { providers: { sample: { apiKeyEnv: 'SAMPLE_KEY', models: [{ id: 'model-alias', contextWindow: 1000, maxTokens: 500 }] }, unrelated: { apiKey: secret } } } },
      { id: 'agent-default-model', config: { provider: 'sample', model: 'model-alias', reasoningEffort: 'max' } }
    ],
    catalog: { 'openai-completions': { 'chat:model-alias': {
      id: 'model-alias', provider: 'sample', api: 'openai-completions', baseUrl: 'https://sample.invalid/v1',
      contextWindow: 900, maxTokens: 400, thinkingLevelMap: { max: 'max' },
      compat: { thinkingFormat: 'deepseek', maxTokensField: 'max_tokens', requiresReasoningContentOnAssistantMessages: true }
    } } }
  }
}

test('DSH selection exports only selected route and distinguishes alias from snapshot', () => {
  const result = selectDshRoute(fixture())
  assert.equal(result.endpoint, 'https://sample.invalid/v1/chat/completions')
  assert.equal(result.model_alias, 'model-alias')
  assert.equal(result.model_snapshot_verified, false)
  assert.equal(result.credential_ref, 'SAMPLE_KEY')
  assert.equal(result.reasoning_effort, 'max')
  assert.equal(result.context_window_declared, 1000)
  assert.equal(result.output_tokens_declared, 500)
  assert.equal(result.live_execution_ready, false)
  assert.equal(JSON.stringify(result).includes(secret), false)
})

test('DSH selection fails closed on ambiguity, unsupported auth or route semantics', () => {
  for (const mutate of [
    f => f.entries.push(f.entries[1]),
    f => { f.entries[1].config.provider = 'missing' },
    f => { f.entries[0].config.providers.sample.apiKey = secret },
    f => { f.entries[0].config.providers.sample.headers = { Authorization: secret } },
    f => { f.entries[0].config.providers.sample.baseURL = 'https://sample.invalid/?key=' + secret },
    f => { f.entries[0].config.providers.sample.models.push({ id: 'model-alias' }) },
    f => { f.entries[0].config.providers.sample.models[0].baseURL = 'http://sample.invalid' },
    f => { f.entries[1].config.reasoningEffort = 'unsupported' },
    f => { f.catalog['openai-completions']['chat:model-alias'].api = 'other' }
  ]) {
    const f = fixture(); mutate(f)
    assert.throws(() => selectDshRoute(f), e => !String(e).includes(secret))
  }
})

test('DSH selection uses explicit provider baseURL but never silently falls back', () => {
  const f = fixture(); f.entries[0].config.providers.sample.baseURL = 'https://alternate.invalid/v2/'
  assert.equal(selectDshRoute(f).endpoint, 'https://alternate.invalid/v2/chat/completions')
  delete f.catalog['openai-completions']['chat:model-alias']
  assert.throws(() => selectDshRoute(f))
})

function installation() {
  const base = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'dsh-tests-'))
  const write = (path, content) => writeFileSync(path, content, { flag: 'wx' })
  const options = { packageJson: join(root, 'package.json'), profilePatch: join(root, 'profile.yml'), credentialsFile: join(root, 'credentials.yml'), env: {} }
  const yaml = join(root, 'node_modules/yaml'), catalog = join(root, 'node_modules/@earendil-works/pi-ai/dist/providers/data')
  mkdirSync(yaml, { recursive: true }); mkdirSync(catalog, { recursive: true })
  write(join(yaml, 'index.js'), readFileSync(new URL('./support/dsh-yaml-stub.cjs', import.meta.url)))
  write(options.packageJson, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.0.0-engineering-stub' }))
  const f = fixture()
  write(options.profilePatch, JSON.stringify(f.entries)); write(join(catalog, 'sample.json'), JSON.stringify(f.catalog))
  return { options, write }
}

test('DSH inspection selects managed ref before environment without returning either value', () => {
  const { options, write } = installation()
  write(options.credentialsFile, JSON.stringify({ version: 1, refs: { SAMPLE_KEY: secret, UNRELATED_KEY: secret + 'OTHER' } }))
  options.env.SAMPLE_KEY = secret + 'ENV'
  const result = inspectDsh(options)
  assert.deepEqual(result.credential, { reference: 'SAMPLE_KEY', available: true, source: 'dsh-managed-refs' })
  assert.equal(result.network_contacted, false)
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal('credential_file_sha256' in result, false)
  assert.equal('credentialsFile' in result.sources, false)
})

test('DSH missing selected credential never falls back to another provider or dotenv', () => {
  const { options, write } = installation()
  assert.equal(inspectDsh(options).credential.available, false)
  options.env.SAMPLE_KEY = secret
  assert.equal(inspectDsh(options).credential.source, 'environment')
  write(options.credentialsFile, JSON.stringify({ version: 1, refs: { UNRELATED_KEY: secret } }))
  options.env = {}
  assert.equal(inspectDsh(options).credential.available, false)
})

test('DSH malformed store blocks environment fallback and sanitizes CLI errors', () => {
  for (const raw of [secret + ': invalid', JSON.stringify({ version: 2, refs: { SAMPLE_KEY: secret } }), JSON.stringify({ version: 1, refs: { SAMPLE_KEY: { nested: secret } } })]) {
    const { options, write } = installation(); write(options.credentialsFile, raw)
    options.env.SAMPLE_KEY = secret
    assert.throws(() => inspectDsh(options), e => /inspection failed/.test(e.message) && !String(e).includes(secret))
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../gate2/dsh-inspect.mjs', import.meta.url)), options.packageJson, options.profilePatch, options.credentialsFile], { encoding: 'utf8' })
    assert.equal(child.status, 1)
    assert.equal(child.stdout, '')
    assert.equal(child.stderr.includes(secret), false)
  }
})
