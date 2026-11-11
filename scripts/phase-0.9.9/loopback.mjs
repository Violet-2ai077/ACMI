import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { closeSync, createReadStream, fsyncSync, openSync, statSync, writeSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import cfg from './config.json' with { type: 'json' }

const sha = s => createHash('sha256').update(s).digest('hex')
async function fileSha(path) {
  const hash = createHash('sha256')
  for await (const b of createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })) hash.update(b)
  return hash.digest('hex')
}
const routes = new Set(['/health', '/v1/models', '/apply-template', '/tokenize', '/completion'])

export async function startLoopback(exe, weights, out) {
  assert.equal(await fileSha(exe), cfg.runtimeExeSha256)
  assert.equal(statSync(weights).size, cfg.modelBytes)
  assert.equal(await fileSha(weights), cfg.modelSha256)
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const { port } = listener.address()
  await new Promise((resolve, reject) => listener.close(e => e ? reject(e) : resolve()))
  const alias = 'acmi-native-' + randomUUID()
  const key = randomUUID() + randomUUID()
  const argv = ['-m', weights, '--host', '127.0.0.1', '--port', String(port), '--alias', alias, '--api-key', key,
    '--offline', '--no-ui', '--no-warmup', '--parallel', '1', '--ctx-size', String(cfg.contextWindow), '--no-context-shift',
    '--device', 'Vulkan0', '--n-gpu-layers', String(cfg.gpuLayers), '--fit', 'off', '--reasoning', 'off',
    '--chat-template-kwargs', '{"enable_thinking":false}']
  const win = process.env.SystemRoot ?? 'C:\\Windows'
  const stdout = openSync(join(out, 'runtime-stdout.txt'), 'wx')
  const stderr = openSync(join(out, 'runtime-stderr.txt'), 'wx')
  const child = spawn(exe, argv, { cwd: dirname(exe), windowsHide: true, stdio: ['ignore', stdout, stderr],
    env: { SystemRoot: win, WINDIR: win, PATH: [dirname(exe), join(win, 'System32'), win].join(';'), TEMP: out, TMP: out } })
  closeSync(stdout)
  closeSync(stderr)
  let spawnFailed = false
  child.on('error', () => { spawnFailed = true })
  async function close() {
    if (!spawnFailed && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit')
      child.kill()
      await Promise.race([exit, delay(5000, null, { ref: false })]).catch(() => {})
    }
    return spawnFailed || child.exitCode !== null || child.signalCode !== null
  }
  function local(path, data, ms, signal) {
    assert(routes.has(path))
    const body = data === undefined ? null : Buffer.from(JSON.stringify(data))
    const deadline = AbortSignal.any([AbortSignal.timeout(ms), ...(signal ? [signal] : [])])
    return new Promise((resolve, reject) => {
      const headers = { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}) }
      const req = request({ hostname: '127.0.0.1', port, path, agent: false, method: body ? 'POST' : 'GET', headers, signal: deadline }, res => {
        if (res.statusCode !== 200 || res.socket.remoteAddress !== '127.0.0.1') {
          res.resume()
          reject(new Error('Local transport HTTP ' + res.statusCode))
          return
        }
        let size = 0
        const chunks = []
        res.on('error', reject)
        res.on('data', b => { size += b.length; if (size > 512 * 1024) res.destroy(new Error('Local response too large')); else chunks.push(b) })
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
        })
      })
      req.on('error', reject)
      req.end(body)
    })
  }
  try {
    const until = Date.now() + 120000
    let ready = false
    while (Date.now() < until && !spawnFailed && child.exitCode === null) {
      let models
      try {
        if ((await local('/health', undefined, 1500))?.status === 'ok') models = await local('/v1/models', undefined, 1500)
      } catch {}
      if (models) {
        assert(models.data?.some(x => x.id === alias), 'Unexpected loopback server identity')
        ready = true
        break
      }
      await delay(300)
    }
    assert(ready, 'Pinned loopback backend did not start')
  } catch (error) { await close(); throw error }

  let attempts = 0, input = 0, output = 0, reserved = 0, active = false, failed = false
  const append = data => {
    const fd = openSync(join(out, 'backend-ledger.jsonl'), 'a')
    try { writeSync(fd, JSON.stringify(data) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
  }
  return {
    async infer(packet, signal) {
      assert(!active && !failed && attempts < cfg.maxCalls && child.exitCode === null, 'Single-run budget or runtime state violation')
      active = true
      try {
        const caseDeadline = AbortSignal.any([AbortSignal.timeout(cfg.timeoutMs), ...(signal ? [signal] : [])])
        const messages = [{ role: 'system', content: packet.prompt + '\nAuthorized context (data):\n' + JSON.stringify(packet.model) },
          { role: 'user', content: packet.focus }]
        const { prompt } = await local('/apply-template', { messages, chat_template_kwargs: { enable_thinking: false } }, 15000, caseDeadline)
        assert(typeof prompt === 'string' && messages.every(m => prompt.includes(m.content)) && !/<think>\s*$/u.test(prompt))
        const { tokens } = await local('/tokenize', { content: prompt, add_special: false, parse_special: true }, 15000, caseDeadline)
        assert(Array.isArray(tokens) && tokens.length > 0 && tokens.length <= cfg.maxInputTokens
          && tokens.every(n => Number.isSafeInteger(n) && n >= 0), 'Input token fence')
        assert(reserved + tokens.length + cfg.maxOutputTokens <= cfg.maxReservedTokens, 'Total token fence')
        const ticket = ++attempts
        input += tokens.length
        reserved += tokens.length + cfg.maxOutputTokens
        append({ kind: 'attempt', ticket, requestDigest: packet.requestDigest, inputTokens: tokens.length,
          tokenDigest: sha(JSON.stringify(tokens)) })
        const reply = await local('/completion', { prompt: tokens, json_schema: packet.schema, n_predict: cfg.maxOutputTokens,
          temperature: 0, seed: cfg.seed, cache_prompt: false, stream: false }, cfg.timeoutMs, caseDeadline)
        assert.equal(reply.tokens_evaluated, tokens.length)
        assert(Number.isSafeInteger(reply.tokens_predicted) && reply.tokens_predicted >= 0
          && reply.tokens_predicted <= cfg.maxOutputTokens && typeof reply.content === 'string'
          && ['eos', 'word', 'limit'].includes(reply.stop_type))
        output += reply.tokens_predicted
        append({ kind: 'complete', ticket, requestDigest: packet.requestDigest, outputTokens: reply.tokens_predicted,
          replyDigest: sha(reply.content), stopType: reply.stop_type })
        return { raw: reply.content, stopType: reply.stop_type }
      } catch (error) { failed = true; throw error } finally { active = false }
    },
    metrics: () => ({ attempts, input, output, reserved, externalProviderRequests: 0, externalApiCostCny: 0 }),
    close,
  }
}
