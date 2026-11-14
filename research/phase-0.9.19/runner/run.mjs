import { performance } from 'node:perf_hooks'
import { hash } from '../protocol/contracts.mjs'
import { createWireParser } from '../protocol/wire.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { isFakeTransport } from './fake.mjs'

function preflight(p, policy, transport, ledger) {
  if (!isFakeTransport(transport) || policy.transport !== 'fake') throw new Error('Gate 1 requires registered fake transport')
  if (Object.keys(policy).some(k => /credential|api.?key|provider|endpoint/i.test(k))) throw new Error('live/credential options forbidden')
  if (policy.halted) throw new Error('run halted')
  const prior = ledger.restore()
  if (Math.max(policy.usedCalls ?? 0, prior.reservations.length) >= policy.maxCalls) throw new Error('call budget')
  if (prior.reservations.some(r => !prior.attempts.some(a => a.attempt_id === r.attempt_id))) throw new Error('incomplete prior generation')
  if (!Number.isInteger(policy.maxCalls) || policy.maxCalls < 1) throw new Error('call budget required')
  if (ledger.scope.condition && ledger.scope.condition !== p.context_condition) throw new Error('ledger condition scope')
  if (ledger.scope.arm && ledger.scope.arm !== p.arm) throw new Error('ledger arm scope')
  if (ledger.scope.family_id && ledger.scope.family_id !== p.family_id) throw new Error('ledger family scope')
  if (Buffer.byteLength(JSON.stringify(p)) > (policy.maxInputBytes ?? 131072)) throw new Error('input byte budget')
}

async function generate({ inputPacket: p, policy, transport, ledger, stage = null, answerText }) {
  preflight(p, policy, transport, ledger)
  const request = answerText === undefined ? p : { ...p, answerText }
  if (Buffer.byteLength(JSON.stringify(request)) > (policy.maxInputBytes ?? 131072)) throw new Error('input byte budget')
  const turnKey = [p.family_id, p.context_condition, p.arm, p.turn_id, stage ?? 'single'].join(':')
  const attempt_id = hash(turnKey).slice(0, 24)
  ledger.reserve(attempt_id, turnKey, request)
  policy.usedCalls = (policy.usedCalls ?? 0) + 1
  const started = performance.now(), chunks = [], buffers = []
  const controller = new AbortController()
  let finish_reason = 'error', error = null, usage = null, totalBytes = 0, firstByte = null, firstVisible = null
  let parsed = null, text = '', completedEvent = false
  const parser = ['A', 'B'].includes(p.arm) ? createWireParser({ arm: p.arm, inputPacket: p, limits: { maxBytes: policy.maxOutputBytes ?? 262144 } }) : null
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('deadline exceeded')) }, policy.timeoutMs ?? 120000)
  })
  try {
    const iterator = transport.generate(request, { signal: controller.signal })[Symbol.asyncIterator]()
    while (true) {
      const step = await Promise.race([iterator.next(), deadline])
      if (step.done) break
      const event = step.value
      if (completedEvent) throw new Error('event after completion')
      const ms = performance.now() - started
      if (event.bytes) {
        const b = Buffer.from(event.bytes); buffers.push(b); totalBytes += b.length
        chunks.push({ seq: chunks.length + 1, ms, bytes_base64: b.toString('base64') })
        firstByte ??= ms
        if (totalBytes > (policy.maxOutputBytes ?? 262144)) throw new Error('output byte budget')
        if (parser) {
          const visible = parser.push(b)
          if (visible.length) firstVisible ??= ms
          text += visible.map(v => v.text).join('')
        }
      } else if (event.finish_reason) {
        completedEvent = true; finish_reason = event.finish_reason; usage = event.usage
        chunks.push({ seq: chunks.length + 1, ms, finish_reason, usage })
      } else throw new Error('invalid transport event')
    }
    if (!completedEvent) throw new Error('missing completion')
    if (parser) parsed = parser.finish()
    if (finish_reason !== 'stop') error = 'non-success finish'
  } catch (e) {
    error = e.message; finish_reason = 'error'
    if (parser) { try { parsed = parser.finish() } catch {} }
  } finally { clearTimeout(timer); controller.abort() }
  const raw = Buffer.concat(buffers)
  if (!parser) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw) } catch { error = 'invalid UTF-8' }
  }
  const valid = !error && finish_reason === 'stop' && (parser ? parsed.valid : text.length > 0)
  const record = {
    attempt_id, family_id: p.family_id, turn_id: p.turn_id, context_condition: p.context_condition, arm: p.arm,
    split: p.split, track: policy.track ?? (p.arm === 'D' ? 'FROZEN-REPLAY' : 'CLOSED-LOOP'),
    prompt_version: p.prompt_version, stage, pair_id: p.arm === 'D' ? hash(turnKey.replace(/:(answer|marker)$/, '')).slice(0, 24) : null,
    finish_reason, error, parser_errors: parsed?.errors ?? [], visible_text: text,
    usage, valid, transport_kind: 'fake', streaming_complete: false,
    clocks: { first_byte_ms: firstByte, first_visible_ms: firstVisible, total_ms: performance.now() - started },
    request_hash: hash(JSON.stringify(request)), raw_hash: hash(raw)
  }
  ledger.appendAttempt({ ...record, input: request, raw, chunks })
  if (valid && parsed) ledger.appendProposal({ attempt_id, valid: true, workState: parsed.workState })
  if (!valid && (error || policy.mechanismPrefix)) policy.halted = true
  return { ...record, raw, text, workState: valid ? parsed?.workState ?? null : null }
}

export async function runTurn(options) {
  if (!['A', 'B', 'C0'].includes(options.inputPacket.arm)) throw new Error('single arm required')
  return generate(options)
}

export async function runDiagnosticPair(options) {
  const { inputPacket: p, policy, ledger } = options
  if (p.arm !== 'D' || p.split !== 'dev' || policy.diagnostic !== true) throw new Error('D requires diagnostic dev')
  const first = await generate({ ...options, stage: 'answer' })
  if (!first.valid) return { valid: false, stages: [first], usage: first.usage, total_ms: first.clocks.total_ms }
  const second = await generate({ ...options, stage: 'marker', answerText: first.text })
  const decoded = readRaw(second.raw, { arm: 'D', inputPacket: p, answerText: first.text })
  const valid = second.valid && decoded.valid
  if (!valid) policy.halted = true
  const usage = first.usage && second.usage ? {
    input: first.usage.input + second.usage.input, output: first.usage.output + second.usage.output
  } : null
  return { valid, diagnostic_only: true, stages: [first, second], usage, total_ms: first.clocks.total_ms + second.clocks.total_ms,
    errors: decoded.errors, ledger_path: ledger.path }
}
