import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { appendFileSync, closeSync, createReadStream, openSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import cfg from './config.json' with { type: 'json' }

export const digest = data => createHash('sha256').update(data).digest('hex')
const fileDigest = async path => {
  const hash = createHash('sha256')
  for await (const b of createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })) hash.update(b)
  return hash.digest('hex')
}
const routes = new Set(['/health', '/v1/models', '/apply-template', '/tokenize', '/completion'])
const allowedHost = '127.0.0.1'
const ms = () => performance.now()

export async function startBackend(exe, weights, out, runStarted) {
  const home = dirname(exe)
  const win = process.env.SystemRoot ?? 'C:\\Windows'
  const env = { SystemRoot: win, WINDIR: win, PATH: [home, join(win, 'System32'), win].join(';'), TEMP: out, TMP: out }
  assert.equal(statSync(weights).size, cfg.modelBytes, 'Model size mismatch')
  const verified = {}
  for (const [key, file, expected] of [
    ['launcher', exe, cfg.runtimeExeSha256], ['weights', weights, cfg.modelSha256],
    ['impl', join(home, 'llama-server-impl.dll'), cfg.runtimeImplSha256],
    ['vulkan', join(home, 'ggml-vulkan.dll'), cfg.runtimeVulkanSha256],
    ['llama', join(home, 'llama.dll'), cfg.runtimeLlamaSha256],
  ]) {
    const actual = await fileDigest(file)
    assert.equal(actual, expected.toLowerCase(), 'Artifact mismatch: ' + key)
    verified[key] = actual
  }
  const gpu = () => {
    const raw = execFileSync(join(win, 'System32', 'nvidia-smi.exe'), ['--query-gpu=name,temperature.gpu,memory.used',
      '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 6000, windowsHide: true,
      env: { ...env, ProgramFiles: process.env.ProgramFiles ?? 'C:\\Program Files' } })
    const row = raw.trim().split(/\r?\n/u).map(s => s.split(',').map(v => v.trim())).find(x => x[0] === 'NVIDIA GeForce RTX 3060')
    assert(row && /^\d+$/u.test(row[1]) && /^\d+$/u.test(row[2]) && Number(row[1]) < cfg.nativeTemperatureStopC, 'GPU safety fence')
    return { temperatureC: Number(row[1]), usedMiB: Number(row[2]) }
  }
  const bootGpu = gpu()
  const reserve = createServer()
  reserve.listen(0, allowedHost)
  await once(reserve, 'listening')
  const { port } = reserve.address()
  await new Promise((resolve, reject) => reserve.close(e => e ? reject(e) : resolve()))
  const key = randomUUID() + randomUUID(), alias = 'acmi-local-' + randomUUID()
  const argv = ['-m', weights, '--host', allowedHost, '--port', String(port), '--alias', alias, '--api-key', key,
    '--offline', '--no-ui', '--no-warmup', '--parallel', '1', '--ctx-size', String(cfg.contextWindow), '--no-context-shift',
    '--device', 'Vulkan0', '--n-gpu-layers', String(cfg.gpuLayers), '--fit', 'off', '--reasoning', 'off',
    '--chat-template-kwargs', '{"enable_thinking":false}']
  const outFd = openSync(join(out, 'private-runtime-stdout.txt'), 'wx')
  const errFd = openSync(join(out, 'private-runtime-stderr.txt'), 'wx')
  const child = spawn(exe, argv, { cwd: home, windowsHide: true, env, stdio: ['ignore', outFd, errFd] })
  closeSync(outFd); closeSync(errFd)
  let spawnFailed = false
  child.on('error', () => { spawnFailed = true })
  const alive = () => !spawnFailed && child.exitCode === null && child.signalCode === null
  async function close() {
    if (alive()) {
      const exit = once(child, 'exit')
      child.kill()
      await Promise.race([exit, wait(5000, null, { ref: false })]).catch(() => {})
    }
    return !alive()
  }
  function local(path, data, timeout, signal) {
    assert(routes.has(path))
    const body = data === undefined ? null : Buffer.from(JSON.stringify(data))
    const abort = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])
    return new Promise((resolve, reject) => {
      const headers = { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}) }
      const req = request({ hostname: allowedHost, port, path, agent: false, method: body ? 'POST' : 'GET', headers, signal: abort }, res => {
        if (res.statusCode !== 200 || res.socket.remoteAddress !== allowedHost) {
          res.resume()
          reject(new Error('Loopback HTTP ' + res.statusCode))
          return
        }
        let bytes = 0
        const chunks = []
        res.on('error', reject)
        res.on('data', b => {
          bytes += b.length
          if (bytes > 512 * 1024) res.destroy(new Error('Loopback response too large'))
          else chunks.push(b)
        })
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('Invalid loopback JSON')) }
        })
      })
      req.on('error', reject)
      req.end(body)
    })
  }
  try {
    const deadline = ms() + cfg.timeoutMs
    let ready = false
    while (alive() && ms() < deadline) {
      let models
      try {
        if ((await local('/health', undefined, 1500)).status === 'ok') models = await local('/v1/models', undefined, 1500)
      } catch {}
      if (models) {
        assert(models.data?.some(x => x.id === alias), 'Local listener identity mismatch')
        ready = true
        break
      }
      await wait(300)
    }
    assert(ready, 'Pinned loopback backend did not start')
  } catch (error) { await close(); throw error }

  const counts = { pilot: 0, main: 0, control: 0 }
  let attempts = 0, reserved = 0, input = 0, output = 0, active = false, failed = false
  let peakSampledGpuMiB = bootGpu.usedMiB, peakSampledGpuC = bootGpu.temperatureC, peakInput = 0
  const append = entry => appendFileSync(join(out, 'generation-ledger.jsonl'), JSON.stringify(entry) + '\n', { flush: true })
  return {
    async infer(packet, { group, id, arm, generation }, signal) {
      assert(!active && !failed && alive() && Object.hasOwn(counts, group)
        && counts[group] < cfg.budgets[group] && ms() < runStarted + cfg.wallMs, 'Budget or runtime state violation')
      active = true
      const start = ms()
      let ticket
      try {
        const remaining = Math.floor(Math.min(cfg.timeoutMs, runStarted + cfg.wallMs - start))
        assert(remaining > 0, 'Wall clock fence')
        const deadline = AbortSignal.any([AbortSignal.timeout(remaining), ...(signal ? [signal] : [])])
        const sample = gpu()
        peakSampledGpuMiB = Math.max(peakSampledGpuMiB, sample.usedMiB)
        peakSampledGpuC = Math.max(peakSampledGpuC, sample.temperatureC)
        const messages = [{ role: 'system', content: packet.prompt }, { role: 'user', content: packet.focus }]
        const { prompt } = await local('/apply-template', { messages, chat_template_kwargs: { enable_thinking: false } }, 15000, deadline)
        assert(typeof prompt === 'string' && messages.every(m => prompt.includes(m.content)) && !/<think>\s*$/u.test(prompt), 'Chat template fence')
        const { tokens } = await local('/tokenize', { content: prompt, add_special: false, parse_special: true }, 15000, deadline)
        assert(Array.isArray(tokens) && tokens.length > 0 && tokens.length <= cfg.maxInputTokens
          && tokens.every(n => Number.isSafeInteger(n) && n >= 0), 'Input token fence')
        assert(reserved + tokens.length + cfg.maxOutputTokens <= cfg.maxReservedTokens, 'Total token fence')
        reserved += tokens.length + cfg.maxOutputTokens
        peakInput = Math.max(peakInput, tokens.length)
        ticket = ++attempts
        counts[group]++
        append({ kind: 'attempt', ticket, group, id, arm, generation, inputTokens: tokens.length,
          requestDigest: digest(JSON.stringify(packet)), tokenDigest: digest(JSON.stringify(tokens)) })
        const reply = await local('/completion', { prompt: tokens, json_schema: packet.schema,
          n_predict: cfg.maxOutputTokens, temperature: 0, seed: cfg.seed, cache_prompt: false, stream: false }, remaining, deadline)
        assert.equal(reply.tokens_evaluated, tokens.length, 'Backend input-token receipt mismatch')
        assert(Number.isSafeInteger(reply.tokens_predicted) && reply.tokens_predicted >= 0
          && reply.tokens_predicted <= cfg.maxOutputTokens && typeof reply.content === 'string'
          && ['eos', 'word', 'limit'].includes(reply.stop_type), 'Backend output receipt invalid')
        input += tokens.length
        output += reply.tokens_predicted
        const usage = { inputTokens: tokens.length, outputTokens: reply.tokens_predicted, totalTokens: tokens.length + reply.tokens_predicted }
        const result = { ticket, raw: reply.content, stop: reply.stop_type, usage, latencyMs: Math.round(ms() - start) }
        append({ kind: 'complete', group, id, arm, generation, ticket, usage, stop: result.stop,
          latencyMs: result.latencyMs, responseDigest: digest(result.raw) })
        return result
      } catch (error) {
        failed = true
        append({ kind: 'failure', group, id, arm, generation, ticket: ticket ?? null, error: String(error.message).slice(0, 150) })
        throw error
      } finally { active = false }
    },
    metrics: () => ({ attempts, counts, input, output, reserved, peakInput, peakSampledGpuMiB, peakSampledGpuC,
      externalProviderRequests: 0, externalApiCostCny: 0, port, verified }),
    close,
  }
}
