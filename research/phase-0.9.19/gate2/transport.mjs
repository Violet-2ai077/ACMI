import { hash } from '../protocol/contracts.mjs'
import { checkedRoutingHeaders } from './routing.mjs'

class WireError extends Error {
  constructor(code) { super(code.replaceAll('_', ' ')); this.code = code }
}
const fail = code => { throw new WireError(code) }
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const positive = v => Number.isSafeInteger(v) && v > 0
const exactKeys = (o, names) => object(o) && Object.keys(o).every(k => names.includes(k))

export function serializeCompletion(compiled, { route, maxOutputTokens, assistantReasoning = {}, routingHeaders }) {
  if (!compiled || JSON.stringify(compiled.body) !== compiled.serialized || hash(compiled.serialized) !== compiled.request_hash) fail('compiled_request_changed')
  if (route?.version !== 'gate2-dsh-route-v1' || route.api !== 'openai-completions' || route.thinking_format !== 'deepseek' || route.max_tokens_field !== 'max_tokens' || !['low', 'high', 'max'].includes(route.reasoning_effort) || typeof route.model_alias !== 'string') fail('unsupported_route')
  let endpoint
  try { endpoint = new URL(route.endpoint) } catch { fail('invalid_endpoint') }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail('invalid_endpoint')
  if (!positive(maxOutputTokens) || !positive(route.output_tokens_declared) || maxOutputTokens > route.output_tokens_declared) fail('output_token_limit')
  const b = compiled.body
  if (!exactKeys(b, ['instructions', 'messages', 'metadata', 'diagnostic_answer']) || !Array.isArray(b.messages) || !object(assistantReasoning)) fail('compiled_request_shape')
  const assistants = b.messages.filter(m => m.role === 'assistant').map(m => m.source_id)
  if (Object.keys(assistantReasoning).some(id => !assistants.includes(id)) || (route.assistant_reasoning_content_required && assistants.some(id => typeof assistantReasoning[id] !== 'string'))) fail('reasoning_history_missing_or_foreign')
  const messages = b.messages.map(m => ({ role: m.role, content: m.content,
    ...(m.role === 'assistant' && Object.hasOwn(assistantReasoning, m.source_id) ? { reasoning_content: assistantReasoning[m.source_id] } : {}) }))
  const metadata = { acmi_request: b.metadata, source_ids: b.messages.map(m => m.source_id),
    ...(b.diagnostic_answer === undefined ? {} : { diagnostic_answer: b.diagnostic_answer }) }
  const body = { model: route.model_alias, stream: true, stream_options: { include_usage: true },
    max_tokens: maxOutputTokens, thinking: { type: 'enabled' }, reasoning_effort: route.reasoning_effort,
    messages: [{ role: 'system', content: b.instructions }, { role: 'system', content: JSON.stringify(metadata) }, ...messages] }
  const bytes = Buffer.from(JSON.stringify(body))
  if (bytes.length > 1_048_576) fail('request_byte_limit')
  const headers=routingHeaders===undefined?undefined:checkedRoutingHeaders(routingHeaders)
  return { endpoint: endpoint.href, bytes, sha256: hash(bytes), compiled_sha256: compiled.request_hash,
    ...(headers?{headers,headers_sha256:hash(headers)}:{}) }
}

function strictJson(text) {
  let value
  try { value = JSON.parse(text) } catch { fail('invalid_event_json') }
  const stack = []
  for (const match of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const token = match[0], top = stack.at(-1)
    if (token === '{' || token === '[') {
      stack.push({ object: token === '{', key: token === '{', keys: new Set() })
      if (stack.length > 48) fail('event_depth_limit')
    } else if (token === '}' || token === ']') stack.pop()
    else if (token === ',') { if (top?.object) top.key = true }
    else if (token[0] === '"' && top?.object && top.key) {
      const key = JSON.parse(token)
      if (top.keys.has(key)) fail('duplicate_event_key')
      top.keys.add(key); top.key = false
    } else if (/^[\d-]/.test(token) && !Number.isFinite(Number(token))) fail('invalid_event_number')
  }
  return value
}

function checkedUsage(value) {
  if (!object(value) || ['prompt_tokens', 'completion_tokens', 'total_tokens'].some(k => !Number.isSafeInteger(value[k]) || value[k] < 0) || value.total_tokens !== value.prompt_tokens + value.completion_tokens) fail('invalid_usage')
  for (const [field, bound] of [['prompt_tokens_details', value.prompt_tokens], ['completion_tokens_details', value.completion_tokens]]) {
    if (value[field] != null && (!object(value[field]) || Object.values(value[field]).some(n => !Number.isSafeInteger(n) || n < 0 || n > bound))) fail('invalid_usage')
  }
  return structuredClone(value)
}

export function createCompletionDecoder({ onDelta = () => {}, maxEventChars = 1_048_576 } = {}) {
  if (!positive(maxEventChars) || typeof onDelta !== 'function') fail('decoder_configuration')
  const decoder = new TextDecoder('utf-8', { fatal: true }), content = [], reasoning = []
  let line = '', data = [], dataChars = 0, skipLF = false, done = false, ended = false, invalid = false
  let finishReason = null, usage = null, id = null, model = null
  const snapshot = () => ({ content: content.join(''), reasoning: reasoning.join(''), finish_reason: finishReason, usage: usage && structuredClone(usage), done, generation_id: id, response_model: model })
  function event() {
    if (!data.length) return
    const text = data.join('\n'); data = []; dataChars = 0
    if (done) fail('event_after_done')
    if (text === '[DONE]') { if (!finishReason) fail('incomplete_stream'); done = true; return }
    const v = strictJson(text)
    if (!object(v) || v.error != null || !Array.isArray(v.choices)) fail('invalid_provider_event')
    for (const key of ['id', 'model']) if (v[key] !== undefined) {
      if (typeof v[key] !== 'string' || !v[key].length || v[key].length > 256) fail('invalid_generation_identity')
      const previous = key === 'id' ? id : model
      if (previous !== null && previous !== v[key]) fail('generation_identity_changed')
      if (key === 'id') id = v.id; else model = v.model
    }
    if (v.usage != null) { if (usage !== null) fail('duplicate_usage'); usage = checkedUsage(v.usage) }
    if (v.choices.length === 0) { if (v.usage == null) fail('empty_provider_event'); return }
    if (v.choices.length !== 1 || finishReason !== null) fail('unexpected_choice')
    const c = v.choices[0], d = c?.delta
    if (c?.index !== 0 || !exactKeys(d, ['role', 'content', 'reasoning_content', 'refusal'])) fail('unsupported_delta')
    if (d.role !== undefined && d.role !== 'assistant') fail('unexpected_role')
    if (d.refusal != null) fail('provider_refusal')
    for (const [key, output, kind] of [['reasoning_content', reasoning, 'reasoning'], ['content', content, 'content']]) {
      if (d[key] == null) continue
      if (typeof d[key] !== 'string') fail('invalid_delta_text')
      if (d[key]) { output.push(d[key]); onDelta(kind, d[key]) }
    }
    if (c.finish_reason != null) {
      if (!['stop', 'length', 'content_filter'].includes(c.finish_reason)) fail('unsupported_finish_reason')
      finishReason = c.finish_reason
    }
  }
  function consumeLine() {
    if (!line) event()
    else if (line[0] !== ':') {
      const split = line.indexOf(':'), field = split < 0 ? line : line.slice(0, split)
      let value = split < 0 ? '' : line.slice(split + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'data') { data.push(value); dataChars += value.length + 1; if (dataChars > maxEventChars) fail('event_size_limit') }
      else if (!['event', 'id', 'retry'].includes(field) || (field === 'event' && !['message', ''].includes(value))) fail('unsupported_sse_field')
    }
    line = ''
  }
  function consume(text) {
    for (const char of text) {
      if (skipLF && char === '\n') { skipLF = false; continue }
      skipLF = false
      if (char === '\r' || char === '\n') { consumeLine(); skipLF = char === '\r' }
      else { line += char; if (line.length > maxEventChars) fail('event_size_limit') }
    }
  }
  return {
    snapshot,
    push(bytes) {
      if (ended || invalid) fail('decoder_closed')
      try {
        let text
        try { text = decoder.decode(bytes, { stream: true }) } catch { fail('invalid_utf8') }
        consume(text)
      } catch (error) { invalid = true; throw error }
    },
    finish() {
      if (ended || invalid) fail('decoder_closed')
      ended = true
      let tail
      try { tail = decoder.decode() } catch { fail('invalid_utf8') }
      consume(tail)
      if (line || data.length || !done || !finishReason) fail('incomplete_stream')
      return snapshot()
    }
  }
}

// An injected send function is mandatory: importing this module cannot contact a provider.
export async function performCompletion({ request, credential, fetchImpl, record, timeoutMs, maxResponseBytes, signal }) {
  if (typeof fetchImpl !== 'function' || typeof record !== 'function' || typeof credential !== 'string' || !credential.length || /[\r\n]/.test(credential) || !positive(timeoutMs) || timeoutMs > 2_147_483_647 || !positive(maxResponseBytes)) fail('transport_configuration')
  if (!Buffer.isBuffer(request?.bytes) || request.bytes.length > 1_048_576 || hash(request.bytes) !== request.sha256) fail('request_digest_mismatch')
  if(request.headers!==undefined&&typeof request.headers_sha256!=='string')fail('routing_header_digest')
  const routingHeaders=request.headers===undefined?undefined:checkedRoutingHeaders(request.headers,request.headers_sha256)
  if(request.headers===undefined&&request.headers_sha256!==undefined)fail('routing_header_digest')
  let url
  try { url = new URL(request.endpoint) } catch { fail('invalid_endpoint') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('invalid_endpoint')
  const bytes = Buffer.from(request.bytes), started = performance.now(), controller = new AbortController()
  let reader, timer, httpStatus = null, attempted = false, evidenceComplete = true, wireBytes = 0
  let firstWire = null, firstContent = null, firstReasoning = null, complete = false, errorCode = null
  let bodyComplete = false, abortCode = null, decodeError = null, deadline = Infinity, evidenceWriteMs = 0
  const elapsed = () => performance.now() - started
  function emit(kind, fields) {
    const before = performance.now()
    try {
      const result = record({ kind, elapsed_ms: elapsed(), ...fields })
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw new Error() }
    } catch { evidenceComplete = false; fail('evidence_write_failed') }
    finally { evidenceWriteMs += performance.now() - before }
  }
  const parser = createCompletionDecoder({ onDelta(kind, text) {
    if (kind === 'content' && firstContent === null) firstContent = elapsed()
    if (kind === 'reasoning' && firstReasoning === null) firstReasoning = elapsed()
    emit(kind, { bytes: Buffer.from(text) })
  } })
  let rejectAbort
  const aborted = new Promise((_, reject) => { rejectAbort = reject })
  // Register a handler immediately, including the pre-aborted/no-send path.
  aborted.catch(() => {})
  const cancel = () => { abortCode ??= 'cancelled'; controller.abort(); rejectAbort(new WireError(abortCode)) }
  signal?.addEventListener('abort', cancel, { once: true })
  function checkDeadline() {
    if (performance.now() >= deadline) abortCode ??= 'timeout'
    if (abortCode) { controller.abort(); fail(abortCode) }
  }
  const wait = async promise => {
    const pending = Promise.race([promise, aborted])
    pending.catch(() => {})
    checkDeadline()
    const value = await pending
    checkDeadline()
    return value
  }
  try {
    if (signal?.aborted) fail('cancelled')
    emit('request', { endpoint: url.href, sha256: request.sha256, bytes: Buffer.from(bytes),
      ...(routingHeaders?{headers:{...routingHeaders},headers_sha256:hash(routingHeaders)}:{}) })
    if (signal?.aborted) fail('cancelled')
    deadline = performance.now() + timeoutMs
    timer = setTimeout(() => { abortCode ??= 'timeout'; controller.abort(); rejectAbort(new WireError(abortCode)) }, timeoutMs)
    attempted = true
    const response = await wait(fetchImpl(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json', ...routingHeaders, Authorization: `Bearer ${credential}` }, body: bytes, signal: controller.signal, redirect: 'error', cache: 'no-store' }))
    httpStatus = response.status
    const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    emit('response', { http_status: httpStatus, content_type: mime ?? null, content_encoding: response.headers.get('content-encoding') })
    if (!response.body || response.redirected) fail(response.redirected ? 'unexpected_redirect' : 'missing_response_body')
    const responseError = httpStatus !== 200 ? 'http_status' : mime !== 'text/event-stream' ? 'unexpected_content_type' : null
    reader = response.body.getReader()
    while (true) {
      const item = await wait(reader.read())
      if (item.done) { bodyComplete = true; break }
      const part = Buffer.from(item.value)
      if (!part.length) continue
      if (firstWire === null) firstWire = elapsed()
      emit('wire', { bytes: Buffer.from(part) }); wireBytes += part.length
      checkDeadline()
      if (wireBytes > maxResponseBytes) fail('response_byte_limit')
      if (!responseError && !decodeError) {
        try { parser.push(part) } catch (error) {
          if (!(error instanceof WireError) || error.code === 'evidence_write_failed') throw error
          decodeError = error
        }
      }
    }
    if (responseError) fail(responseError)
    if (decodeError) throw decodeError
    parser.finish(); checkDeadline(); complete = true
  } catch (error) {
    errorCode = abortCode ?? (error instanceof WireError ? error.code : 'transport_error')
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel)
    controller.abort()
    if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {} }
  }
  const parsed = parser.snapshot()
  const result = { ...parsed, outcome: complete ? ({ stop: 'complete', length: 'truncated', content_filter: 'filtered' })[parsed.finish_reason] : 'failed',
    attempted, transport_complete: complete, response_body_complete: bodyComplete, evidence_complete: evidenceComplete && bodyComplete, error_code: errorCode,
    http_status: httpStatus, wire_bytes: wireBytes,
    latency: { total_ms: elapsed(), first_wire_ms: firstWire, first_content_ms: firstContent, first_reasoning_ms: firstReasoning, evidence_write_ms: evidenceWriteMs } }
  try { emit('terminal', { result: structuredClone(result) }) } catch {
    result.outcome = 'failed'; result.evidence_complete = false; result.error_code = 'evidence_write_failed'
  }
  return result
}
