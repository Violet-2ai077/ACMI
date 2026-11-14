import test from 'node:test'
import assert from 'node:assert/strict'
import { compileRequest } from '../gate2/request.mjs'
import { hash } from '../protocol/contracts.mjs'
import { serializeCompletion, createCompletionDecoder, performCompletion } from '../gate2/transport.mjs'

const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', model_alias: 'synthetic-model',
  endpoint: 'https://synthetic.invalid/v1/chat/completions', reasoning_effort: 'max', thinking_format: 'deepseek',
  max_tokens_field: 'max_tokens', assistant_reasoning_content_required: true, output_tokens_declared: 8000 }
function request(history = false) {
  const messages = [...(history ? [{ source_id: 'a0', role: 'assistant', content: 'Original answer\r\n' }] : []),
    { source_id: 'u1', role: 'user', content: 'Original user text\r\n' }]
  return compileRequest({ context_condition: 'C3', arm: 'C0', split: 'dev', messages,
    sourceMap: Object.fromEntries(messages.map(m => [m.source_id, m.content])), unit_ids: ['u1'] }, { prompts: { C0: 'TEST answer normally' } })
}
const serialize = (compiled = request(), extra = {}) => serializeCompletion(compiled, { route, maxOutputTokens: 400, ...extra })
const chunk = (delta = {}, finish_reason = null, more = {}) => ({ id: 'gen1', model: 'synthetic-model', choices: [{ index: 0, delta, finish_reason }], ...more })
const event = obj => 'data: ' + JSON.stringify(obj) + '\r\n\r\n'
const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, completion_tokens_details: { reasoning_tokens: 5 } }
const successWire = () => Buffer.from(': ping\r\n\r\n' + event(chunk({ role: 'assistant', reasoning_content: 'private reasoning' })) +
  event(chunk({ content: 'Answer \u4e2d\ud83d\ude00' })) + event(chunk({}, 'stop')) +
  event({ id: 'gen1', model: 'synthetic-model', choices: [], usage }) + 'data: [DONE]\r\n\r\n')
function response(parts, status = 200, headers = { 'content-type': 'text/event-stream' }) {
  return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(Buffer.from(p)); c.close() } }), { status, headers })
}
const run = (fetchImpl, extra = {}) => performCompletion({ request: serialize(), credential: 'SYNTHETIC_CREDENTIAL',
  fetchImpl, record: () => {}, timeoutMs: 1000, maxResponseBytes: 65536, ...extra })

test('transport serialization preserves conversation and explicit reasoning history, no oracle fields', () => {
  const c = request(true)
  assert.throws(() => serialize(c), /reasoning history/)
  const r = serialize(c, { assistantReasoning: { a0: 'original reasoning' } }), body = JSON.parse(r.bytes)
  assert.equal(r.sha256, hash(r.bytes)); assert.equal(r.endpoint, route.endpoint)
  assert.equal(body.model, 'synthetic-model'); assert.equal(body.max_tokens, 400)
  assert.deepEqual(body.thinking, { type: 'enabled' }); assert.equal(body.reasoning_effort, 'max')
  assert.deepEqual(body.stream_options, { include_usage: true })
  assert.deepEqual(body.messages.slice(2), [
    { role: 'assistant', content: 'Original answer\r\n', reasoning_content: 'original reasoning' },
    { role: 'user', content: 'Original user text\r\n' }
  ])
  assert.deepEqual(JSON.parse(body.messages[1].content).source_ids, ['a0', 'u1'])
  assert.equal('response_format' in body, false)
  c.body.metadata.oracle = 'FORBIDDEN'
  assert.throws(() => serialize(c, { assistantReasoning: { a0: '' } }), /compiled request/)
})

test('transport request rejects unsupported URLs, limits and unrelated reasoning entries', () => {
  for (const endpoint of ['http://synthetic.invalid', 'https://u:p@synthetic.invalid', 'https://synthetic.invalid/?key=secret']) {
    assert.throws(() => serialize(request(), { route: { ...route, endpoint } }))
  }
  for (const maxOutputTokens of [0, Infinity, 8001]) assert.throws(() => serialize(request(), { maxOutputTokens }))
  assert.throws(() => serialize(request(), { assistantReasoning: { unrelated: 'not history' } }), /reasoning history/)
})

test('SSE decoder is byte-boundary invariant and reasoning never becomes answer text', () => {
  const wire = successWire()
  for (let i = 0; i <= wire.length; i++) {
    const d = createCompletionDecoder()
    d.push(wire.subarray(0, i)); d.push(wire.subarray(i))
    const r = d.finish()
    assert.equal(r.content, 'Answer \u4e2d\ud83d\ude00'); assert.equal(r.reasoning, 'private reasoning')
    assert.equal(r.finish_reason, 'stop'); assert.equal(r.done, true); assert.deepEqual(r.usage, usage)
  }
})

test('SSE framing supports multiline data, CR-only separators and comments without repair', () => {
  const d = createCompletionDecoder()
  d.push(Buffer.from('data: {"id":"g","choices":\rdata: [{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\r\rdata: [DONE]\r\r'))
  assert.equal(d.finish().content, 'ok')
  const partial = createCompletionDecoder(); partial.push(Buffer.from(event(chunk({ content: 'partial' }))))
  assert.throws(() => partial.finish(), /incomplete/)
  assert.equal(partial.snapshot().content, 'partial')
})

test('SSE decoder rejects ambiguous or unsupported events without repair', () => {
  const malformed = [
    'data: {"choices":[],"choices":[]}\n\n',
    event(chunk({ tool_calls: [{ id: 't' }] })),
    event({ id: 'g', choices: [{ index: 1, delta: {} }] }),
    event(chunk({ content: 42 })),
    event(chunk({}, 'tool_calls')),
    event({ error: { message: 'provider error' } }),
    event(chunk({}, 'stop')) + event(chunk({ content: 'late' })),
    event(chunk({ content: 'a' })) + event({ ...chunk({ content: 'b' }), id: 'another' }),
    event(chunk({}, 'stop')) + event({ choices: [], usage: { ...usage, total_tokens: -1 } }),
    event(chunk({}, 'stop')) + 'data: [DONE]\n\ndata: [DONE]\n\n',
    'data: [DONE]\n\n'
  ]
  for (const wire of malformed) assert.throws(() => { const d = createCompletionDecoder(); d.push(Buffer.from(wire)); d.finish() })
  const badUtf8 = createCompletionDecoder(); assert.throws(() => badUtf8.push(Buffer.from([0xff])))
})

test('one send archives request first and exact wire, content, reasoning and usage separately', async () => {
  const records = []; let calls = 0
  const result = await run(async (url, options) => {
    calls++; assert.equal(records[0].kind, 'request')
    assert.equal(url, route.endpoint); assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC_CREDENTIAL')
    assert.deepEqual(Buffer.from(options.body), records[0].bytes)
    return response([successWire().subarray(0, 67), successWire().subarray(67)])
  }, { record: e => { records.push(e) } })
  assert.equal(calls, 1); assert.equal(result.outcome, 'complete'); assert.equal(result.transport_complete, true)
  assert.deepEqual(Buffer.concat(records.filter(e => e.kind === 'wire').map(e => e.bytes)), successWire())
  assert.equal(Buffer.concat(records.filter(e => e.kind === 'content').map(e => e.bytes)).toString(), result.content)
  assert.equal(result.reasoning, 'private reasoning'); assert.deepEqual(result.usage, usage)
  assert.equal(JSON.stringify(records).includes('SYNTHETIC_CREDENTIAL'), false)
  assert.equal(records.at(-1).kind, 'terminal')
  assert.ok(result.latency.total_ms >= result.latency.first_content_ms)
})

test('HTTP failures and redirects are never retried; error bodies remain wire evidence', async () => {
  for (const status of [302, 401, 429, 500]) {
    let calls = 0; const records = []
    const r = await run(async () => { calls++; return response(['original error body'], status, { 'content-type': 'application/json' }) }, { record: e => records.push(e) })
    assert.equal(calls, 1); assert.equal(r.outcome, 'failed'); assert.equal(r.error_code, 'http_status')
    assert.equal(r.http_status, status)
    assert.equal(Buffer.concat(records.filter(e => e.kind === 'wire').map(e => e.bytes)).toString(), 'original error body')
  }
})

test('truncation, filtering, missing usage and incomplete stream are distinct outcomes', async () => {
  for (const [finish, outcome] of [['length', 'truncated'], ['content_filter', 'filtered'], ['stop', 'complete']]) {
    const r = await run(async () => response([event(chunk({ content: 'partial' }, finish)) + 'data: [DONE]\n\n']))
    assert.equal(r.outcome, outcome); assert.equal(r.usage, null); assert.equal(r.transport_complete, true)
  }
  const r = await run(async () => response([event(chunk({ content: 'partial' }))]))
  assert.equal(r.content, 'partial'); assert.equal(r.error_code, 'incomplete_stream'); assert.equal(r.transport_complete, false)
})

test('deadline aborts stalled fetch and stalled body; no retry or raw exception leakage', async () => {
  for (const body of [false, true]) {
    let calls = 0, signal
    const r = await run(async (_, options) => {
      calls++; signal = options.signal
      return body ? new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } }) : new Promise(() => {})
    }, { timeoutMs: 20 })
    assert.equal(r.error_code, 'timeout'); assert.equal(calls, 1); assert.equal(signal.aborted, true)
  }
  const r = await run(async () => { throw new Error('SYNTHETIC_CREDENTIAL provider failure') })
  assert.equal(r.error_code, 'transport_error'); assert.equal(JSON.stringify(r).includes('SYNTHETIC_CREDENTIAL'), false)
})

test('archive failure before send prevents send; during streaming stops with partial evidence', async () => {
  let calls = 0
  const r = await run(async () => { calls++; return response([successWire()]) }, { record: () => { throw new Error('disk failure') } })
  assert.equal(calls, 0); assert.equal(r.error_code, 'evidence_write_failed'); assert.equal(r.evidence_complete, false)
  const s = await run(async () => { calls++; return response([successWire()]) }, { record: e => { if (e.kind === 'wire') throw new Error('disk failure') } })
  assert.equal(calls, 1); assert.equal(s.error_code, 'evidence_write_failed'); assert.equal(s.evidence_complete, false)
})

test('body digest tampering and missing transport reject before any generation', async () => {
  const r = serialize(); r.bytes[0] = 0
  let calls = 0
  await assert.rejects(run(async () => { calls++ }, { request: r }), /request digest/)
  await assert.rejects(run(undefined), /transport configuration/)
  assert.equal(calls, 0)
})

test('wire overflow and cancellation stop the only attempt without fabricated completion', async () => {
  const r = await run(async () => response([successWire()]), { maxResponseBytes: 10 })
  assert.equal(r.error_code, 'response_byte_limit'); assert.equal(r.transport_complete, false)
  const c = new AbortController(); c.abort()
  let calls = 0
  const s = await run(async () => { calls++ }, { signal: c.signal })
  assert.equal(s.error_code, 'cancelled'); assert.equal(calls, 0)
})

test('protocol rejection still drains and archives the full received response without parsing later events', async () => {
  const records = [], first = Buffer.from('data: broken json\n\n'), last = successWire()
  const r = await run(async () => response([first, last]), { record: e => records.push(e) })
  assert.deepEqual(Buffer.concat(records.filter(e => e.kind === 'wire').map(e => e.bytes)), Buffer.concat([first, last]))
  assert.equal(r.response_body_complete, true)
  assert.equal(r.transport_complete, false); assert.equal(r.error_code, 'invalid_event_json')
  assert.equal(r.content, '')
})

test('archive callback cannot change bytes before provider decoding', async () => {
  const r = await run(async () => response([successWire()]), { record: e => { if (e.kind === 'wire') e.bytes.fill(0) } })
  assert.equal(r.outcome, 'complete')
  assert.equal(r.content, 'Answer \u4e2d\ud83d\ude00')
})

test('abort-aware fetch reports deadline as timeout and cancellation during reservation sends nothing', async () => {
  const r = await run((_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort')))), { timeoutMs: 20 })
  assert.equal(r.error_code, 'timeout')
  let calls = 0; const controller = new AbortController()
  const s = await run(async () => { calls++; return response([successWire()]) }, {
    signal: controller.signal, record: e => { if (e.kind === 'request') controller.abort() }
  })
  assert.equal(calls, 0); assert.equal(s.error_code, 'cancelled')
})

test('deadline cannot be bypassed by synchronous evidence work starving the timer queue', async () => {
  const r = await run(async () => response([successWire()]), { timeoutMs: 10, record: e => {
    if (e.kind === 'wire') { const end = performance.now() + 30; while (performance.now() < end) {} }
  } })
  assert.equal(r.error_code, 'timeout')
  assert.equal(r.transport_complete, false)
  assert.equal(r.evidence_complete, false)
  const delayedRejection = await run(async () => {
    const end = performance.now() + 30; while (performance.now() < end) {}
    throw new Error('late transport rejection')
  }, { timeoutMs: 10 })
  assert.equal(delayedRejection.error_code, 'timeout')
  await new Promise(resolve => setImmediate(resolve))
})
