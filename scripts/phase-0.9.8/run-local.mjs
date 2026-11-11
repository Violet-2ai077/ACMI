import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { closeSync, createReadStream, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync,
  statSync, writeFileSync, writeSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import cfg from './config.json' with { type: 'json' }
import { freezeInput, planTokens, sha, validateNativeResult } from './policy.mjs'

const [exeArg, modelArg, benchmarkArg, outArg, ...extra] = process.argv.slice(2)
assert(exeArg && modelArg && benchmarkArg && outArg && extra.length === 0,
  'Usage: node run-local.mjs <pinned-llama-server.exe> <pinned-model.gguf> <0.9.7-benchmark-dir> <new-run-dir>')
const exe = realpathSync(exeArg), model = realpathSync(modelArg), benchmark = realpathSync(benchmarkArg), out = resolve(outArg)
const json = (dir, name) => {
  const p = join(dir, name)
  const info = statSync(p)
  assert(info.isFile() && info.size <= 1024 * 1024)
  return JSON.parse(readFileSync(p, 'utf8'))
}
const dump = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
async function fileSha(path) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })) h.update(chunk)
  return h.digest('hex')
}
assert.equal(await fileSha(exe), cfg.runtimeExeSha256, 'runtime executable digest mismatch')
assert.equal(statSync(model).size, cfg.modelBytes, 'model byte count mismatch')
assert.equal(await fileSha(model), cfg.modelSha256, 'model digest mismatch')
const frozen = freezeInput(json(benchmark, 'frozen-contract.json'), json(benchmark, 'requests.offline.json'), cfg)
mkdirSync(out)

const listener = createServer()
listener.listen(0, '127.0.0.1')
await once(listener, 'listening')
const port = listener.address().port
await new Promise((resolve, reject) => listener.close(err => err ? reject(err) : resolve()))
const alias = 'acmi-098-' + randomUUID()
const permittedRoutes = new Set(['/health', '/v1/models', '/apply-template', '/tokenize', '/completion'])
function local(path, body, timeout = 15000) {
  assert(permittedRoutes.has(path))
  const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body))
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: bytes ? 'POST' : 'GET', agent: false,
      signal: AbortSignal.timeout(timeout), headers: bytes ? { 'Content-Type': 'application/json', 'Content-Length': bytes.length } : {} }, res => {
      if (res.socket.remoteAddress !== '127.0.0.1' || res.statusCode !== 200) {
        res.resume()
        reject(new Error('local HTTP ' + res.statusCode))
        return
      }
      const chunks = []
      let length = 0
      res.on('error', reject)
      res.on('data', chunk => {
        length += chunk.length
        if (length > 512 * 1024) res.destroy(new Error('local response envelope exceeded budget'))
        else chunks.push(chunk)
      })
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(bytes)
  })
}

const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '--alias', alias, '--offline',
  '--no-webui', '--no-warmup', '--parallel', '1', '--ctx-size', '2048', '--no-context-shift', '--device', 'Vulkan0',
  '--n-gpu-layers', '99', '--fit', 'off', '--reasoning', 'off', '--chat-template-kwargs', '{"enable_thinking":false}']
const win = process.env.SystemRoot ?? 'C:\\Windows'
const stdout = openSync(join(out, 'runtime-stdout.txt'), 'wx')
const stderr = openSync(join(out, 'runtime-stderr.txt'), 'wx')
const child = spawn(exe, args, { cwd: dirname(exe), windowsHide: true, stdio: ['ignore', stdout, stderr], env: {
  SystemRoot: win, WINDIR: win, PATH: [dirname(exe), join(win, 'System32'), win].join(';'), TMP: out, TEMP: out,
} })
closeSync(stdout)
closeSync(stderr)
let spawnFailed = false
child.on('error', () => { spawnFailed = true })
const ledger = openSync(join(out, 'generation-ledger.jsonl'), 'wx')
const record = value => { writeSync(ledger, JSON.stringify(value) + '\n'); fsyncSync(ledger) }
let started = 0, promptTokens = 0, outputTokens = 0, budget = null, stopped = null, stoppedRuntime = false
const receipts = []
try {
  const until = Date.now() + 120000
  let ready = false
  while (Date.now() < until && !spawnFailed && child.exitCode === null) {
    let models
    try {
      const health = await local('/health', undefined, 1500)
      if (health?.status !== 'ok') { await delay(300); continue }
      models = await local('/v1/models', undefined, 1500)
    } catch { await delay(300); continue }
    assert(models?.data?.some(x => x.id === alias), 'server did not attest the unique run alias')
    ready = true
    break
  }
  assert(ready, 'pinned local runtime did not start')
  const prepared = []
  for (const item of frozen.requests) {
    const messages = [{ role: 'system', content: frozen.prompt }, { role: 'user', content: JSON.stringify(item.payload) }]
    const template = await local('/apply-template', { messages, chat_template_kwargs: { enable_thinking: false } })
    assert(typeof template.prompt === 'string' && template.prompt.includes(frozen.prompt) && template.prompt.includes(messages[1].content))
    assert(!/<think>\s*$/u.test(template.prompt), 'thinking template was not disabled')
    const tokens = (await local('/tokenize', { content: template.prompt, add_special: false, parse_special: true })).tokens
    assert(Array.isArray(tokens) && tokens.every(n => Number.isSafeInteger(n) && n >= 0))
    prepared.push({ ...item, tokens, tokensDigest: sha(JSON.stringify(tokens)) })
  }
  budget = planTokens(prepared.map(r => r.tokens.length), cfg)
  console.log('Preflight tokenizer: ' + budget.promptTokens + ' input tokens; ' + budget.maxTokens + ' reserved total')
  dump('preflight.json', { ...budget, requestCount: prepared.length, promptDigest: cfg.promptDigest,
    schemaDigest: cfg.schemaDigest, requestsDigest: cfg.requestsDigest, modelSha256: cfg.modelSha256,
    runtimeExeSha256: cfg.runtimeExeSha256, runtimePid: child.pid, bind: '127.0.0.1', tokenizerOnlyBeforeStart: true,
    inputs: prepared.map(({ storyId, mode, requestDigest, tokens, tokensDigest }) =>
      ({ storyId, mode, requestDigest, promptTokens: tokens.length, tokensDigest })) })
  const oncePath = join(dirname(model), 'phase-0.9.8-consumed.json')
  const consumed = openSync(oncePath, 'wx')
  try {
    writeSync(consumed, JSON.stringify({ requestsDigest: cfg.requestsDigest, modelSha256: cfg.modelSha256, run: out }) + '\n')
    fsyncSync(consumed)
  } finally { closeSync(consumed) }
  for (const item of prepared) {
    const { storyId, mode, requestDigest, tokens } = item
    assert(child.exitCode === null && started < cfg.maxGenerations, 'unexpected local runtime state')
    const binding = { storyId, mode, requestDigest }
    record({ kind: 'attempt', ...binding, promptTokens: tokens.length })
    started++
    promptTokens += tokens.length
    const t0 = performance.now()
    const res = await local('/completion', { prompt: tokens, n_predict: cfg.maxOutputTokens, json_schema: frozen.schema,
      temperature: cfg.temperature, seed: cfg.seed, cache_prompt: false, stream: false }, cfg.timeoutMs)
    const result = validateNativeResult(res, tokens.length, cfg.maxOutputTokens)
    outputTokens += result.outputTokens
    receipts.push({ ...binding, raw: result.raw })
    record({ kind: 'completed', ...binding, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      stopType: result.stopType, outputDigest: sha(result.raw), elapsedMs: Math.round(performance.now() - t0) })
    if (started % 8 === 0 || started === prepared.length) console.log('Local generations: ' + started + '/' + prepared.length)
  }
} catch (error) {
  stopped = String(error?.message ?? 'local run failed').slice(0, 300)
} finally {
  closeSync(ledger)
  if (!spawnFailed && child.exitCode === null && child.signalCode === null) {
    const exit = once(child, 'exit')
    child.kill()
    await Promise.race([exit, delay(5000, null, { ref: false })]).catch(() => {})
  }
  stoppedRuntime = spawnFailed || child.exitCode !== null || child.signalCode !== null
  dump('local-responses.json', { protocol: cfg.sourceProtocol, records: receipts })
  dump('run-summary.json', { provenance: cfg.provenance, status: !stopped && stoppedRuntime && receipts.length === cfg.maxGenerations ? 'completed' : 'stopped',
    started, completed: receipts.length, stopped, runtimeStopped: stoppedRuntime, externalProviderRequests: 0,
    externalApiCostCny: 0, promptTokens, outputTokens, totalTokens: promptTokens + outputTokens, reservedTokenUpperBound: budget?.maxTokens ?? null })
}
if (stopped || !stoppedRuntime || receipts.length !== cfg.maxGenerations) {
  console.error(stopped ?? 'incomplete local batch')
  process.exitCode = 1
}
