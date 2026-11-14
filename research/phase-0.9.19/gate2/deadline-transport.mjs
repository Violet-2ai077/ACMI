import { hash } from '../protocol/contracts.mjs'
import { createCompletionDecoder } from './transport.mjs'
import { checkedRoutingHeaders } from './routing.mjs'
import { createWireAccounting, createDurationHistogram } from './wire-accounting.mjs'

export const DEADLINE_POLICY = 'D-180-LOCAL-v1'
const nativeClock = { now: () => performance.now(), setTimeout, clearTimeout }
const problem = code => Object.assign(new Error(code), { code })

// Injected clocks/fetch are for offline acceptance. The guarded live entry point
// never accepts them. No pending asynchronous branch may write after sealing.
export async function performDeadlineCompletion({ request, credential, fetchImpl, record, recordBatch, accounting = false, timeoutMs, maxResponseBytes, signal, clock = nativeClock }) {
  if (recordBatch !== undefined && typeof recordBatch !== 'function') throw problem('transport_configuration')
  if (timeoutMs !== 180000 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0 ||
      typeof fetchImpl !== 'function' || typeof record !== 'function' || typeof credential !== 'string' || !credential.length || /[\r\n]/.test(credential)) throw problem('transport_configuration')
  if (!Buffer.isBuffer(request?.bytes) || request.bytes.length > 1048576 || hash(request.bytes) !== request.sha256) throw problem('request_digest_mismatch')
  const url = new URL(request.endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw problem('invalid_endpoint')
  const headers = request.headers === undefined ? undefined : checkedRoutingHeaders(request.headers, request.headers_sha256)
  if ((request.headers === undefined) !== (request.headers_sha256 === undefined)) throw problem('routing_header_digest')
  const started = clock.now(), controller = new AbortController(), errors = [], wire = []
  let sealed = false, evidence = true, attempted = false, httpStatus = null, mime = null
  let reader, fetchPending, readPending, timer, deadline = Infinity, stopCause = null, stoppedAt = null
  let bodyComplete = false, complete = false, closed = false, wireBytes = 0, cleanupMs = 0, evidenceWriteMs = 0
  let firstWire = null, firstContent = null, firstReasoning = null
  let pendingDerived = null, derivedBytes = 0
  const observer = accounting ? createWireAccounting() : null, durations = createDurationHistogram()
  const metrics = { version: 'wire-accounting-v1', boundary: 'Fetch response.body; not HTTP/TLS packet bytes',
    fetch_body_bytes_received: 0, raw_bytes_committed: 0, raw_chunks_received: 0, raw_chunks_committed: 0,
    generation_received_bytes: 0, cleanup_received_bytes: 0, generation_committed_bytes: 0, cleanup_committed_bytes: 0,
    body_bytes_submitted_to_decoder: 0, decoded_callback_ms: 0, observation_ms: 0,
    last_read_received_ms: null, last_raw_durable_ack_ms: null, last_derived_durable_ack_ms: null,
    fetch_start_ms: null, deadline_at_ms: null, terminal_durable_ack_ms: null }
  const elapsed = () => clock.now() - started
  const note = code => { if (!errors.includes(code)) errors.push(code) }
  const pendingError = error => {
    if (!sealed && !(stopCause && error?.name === 'AbortError')) note(typeof error?.code === 'string' ? error.code : 'transport_error')
    throw error
  }
  function emit(kind, fields) {
    if (sealed) throw problem('sealed_pipeline')
    const event = { kind, elapsed_ms: elapsed(), ...fields }
    if (pendingDerived && ['content', 'reasoning'].includes(kind)) {
      derivedBytes += fields.bytes.length
      // Existing per-channel bounds bound the local aggregate too; no live policy change.
      if (derivedBytes > 2 * 4_194_304) { evidence = false; note('evidence_write_failed'); throw problem('evidence_write_failed') }
      pendingDerived.push(event); return
    }
    const before = clock.now()
    try {
      const result = record(event)
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw problem('async_sink') }
    } catch { evidence = false; note('evidence_write_failed'); throw problem('evidence_write_failed') }
    finally { evidenceWriteMs += clock.now() - before }
  }
  function batch(events) {
    if (sealed) throw problem('sealed_pipeline')
    const before = clock.now()
    try {
      const result = recordBatch(events)
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw problem('async_sink') }
    } catch { evidence = false; note('evidence_write_failed'); throw problem('evidence_write_failed') }
    finally { evidenceWriteMs += clock.now() - before }
  }
  let rejectStop
  const stopped = new Promise((_, reject) => { rejectStop = reject }); stopped.catch(() => {})
  function stop(cause) {
    if (stopCause) return
    stopCause = cause; stoppedAt = elapsed()
    controller.abort(); rejectStop(problem(cause))
  }
  const cancel = () => { note('cancelled'); stop('cancelled') }
  signal?.addEventListener('abort', cancel, { once: true })
  const check = () => {
    if (clock.now() >= deadline) stop('timeout')
    if (stopCause) throw problem(stopCause)
  }
  const parser = createCompletionDecoder({ onDelta(kind, text) {
    if (kind === 'content' && firstContent === null) firstContent = elapsed()
    if (kind === 'reasoning' && firstReasoning === null) firstReasoning = elapsed()
    emit(kind, { bytes: Buffer.from(text) })
  } })
  async function wait(pending) {
    pending.catch(() => {})
    check()
    const result = await Promise.race([pending, stopped])
    check()
    return result
  }
  function delivered(item) {
    if (sealed) return item
    if (item.done) { if (!stopCause && clock.now() < deadline) bodyComplete = true; return item }
    const bytes = Buffer.from(item.value)
    if (!bytes.length) return item
    if (firstWire === null) firstWire = elapsed()
    const phase = stopCause || clock.now() >= deadline ? 'cleanup' : 'generation'
    const index = wire.length
    const receivedAt = clock.now()
    try {
      wire.push(bytes); wireBytes += bytes.length
      metrics.fetch_body_bytes_received += bytes.length; metrics.raw_chunks_received++
      metrics[phase + '_received_bytes'] += bytes.length; metrics.last_read_received_ms = elapsed()
      if (recordBatch) batch([
        { kind: 'wire_delivery', elapsed_ms: elapsed(), index, phase, byte_length: bytes.length, sha256: hash(bytes) },
        { kind: 'wire', elapsed_ms: elapsed(), bytes: Buffer.from(bytes) }
      ])
      else {
        emit('wire_delivery', { index, phase, byte_length: bytes.length, sha256: hash(bytes) })
        emit('wire', { bytes: Buffer.from(bytes) })
      }
      metrics.raw_bytes_committed += bytes.length; metrics.raw_chunks_committed++
      metrics[phase + '_committed_bytes'] += bytes.length; metrics.last_raw_durable_ack_ms = elapsed()
      if (wireBytes > maxResponseBytes) { note('response_byte_limit'); throw problem('response_byte_limit') }
      if (phase === 'generation' && !errors.length) {
        const before = clock.now()
        metrics.body_bytes_submitted_to_decoder += bytes.length
        if (recordBatch) { pendingDerived = []; derivedBytes = 0 }
        let parseError
        try { parser.push(bytes) } catch (e) { parseError = e; note(e.code ?? 'decoder_error') }
        finally {
          metrics.decoded_callback_ms += clock.now() - before
          const events = pendingDerived; pendingDerived = null
          // Preserve deltas emitted before a parser error, without inventing completion.
          if (events?.length) { batch(events); metrics.last_derived_durable_ack_ms = elapsed() }
        }
        if (observer) { const t = clock.now(); observer.submit(bytes); metrics.observation_ms += clock.now() - t }
        if (parseError) throw parseError
      }
      return item
    } finally { durations.add(clock.now() - receivedAt) }
  }
  try {
    if (signal?.aborted) throw problem('cancelled')
    emit('request', { endpoint: url.href, sha256: request.sha256, bytes: Buffer.from(request.bytes),
      ...(headers ? { headers, headers_sha256: hash(headers) } : {}) })
    if (signal?.aborted) throw problem('cancelled')
    deadline = clock.now() + timeoutMs
    metrics.fetch_start_ms = elapsed(); metrics.deadline_at_ms = deadline - started
    timer = clock.setTimeout(() => stop('timeout'), timeoutMs)
    attempted = true
    fetchPending = Promise.resolve(fetchImpl(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers, Authorization: `Bearer ${credential}` },
      body: Buffer.from(request.bytes), signal: controller.signal, redirect: 'error', cache: 'no-store' })).then(response => {
      if (sealed) { Promise.resolve(response.body?.cancel()).catch(() => {}); return response }
      httpStatus = response.status
      mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null
      emit('response', { http_status: httpStatus, content_type: mime, content_encoding: response.headers.get('content-encoding') })
      if (httpStatus !== 200) note('http_status')
      if (mime !== 'text/event-stream') note('unexpected_content_type')
      if (response.redirected) note('unexpected_redirect')
      if (!response.body) note('missing_response_body')
      if (response.body) reader = response.body.getReader()
      return response
    }).catch(pendingError)
    await wait(fetchPending)
    if (errors.length) throw problem(errors[0])
    while (true) {
      check()
      // Capture in the owned read continuation BEFORE the deadline race can
      // discard its value. Cleanup awaits this same continuation.
      readPending = Promise.resolve(reader.read()).then(delivered).catch(pendingError)
      const item = await wait(readPending)
      if (item.done) break
    }
    parser.finish(); check(); complete = true
  } catch (e) {
    const code = stopCause && e.name === 'AbortError' ? stopCause : typeof e.code === 'string' ? e.code : 'transport_error'
    if (code !== 'timeout') note(code)
    if (!stopCause) stop(code)
  } finally {
    clock.clearTimeout(timer)
    const cleanupStart = clock.now()
    controller.abort()
    let cleanupTimer
    const cleanup = async () => {
      if (fetchPending) await fetchPending.catch(() => {})
      if (reader) {
        const expectedAbort = e => controller.signal.aborted && e?.name === 'AbortError'
        // Native streams may already be errored by our abort. A rejected cancel
        // is insufficient alone: also await their closed and owned read promises.
        const nativeClosed = reader.closed?.then(() => true, e => { if (!expectedAbort(e)) throw e; return true })
        nativeClosed?.catch(() => {})
        try { await reader.cancel() } catch (e) { if (!nativeClosed || !expectedAbort(e)) throw e }
        if (nativeClosed) await nativeClosed
      }
      if (readPending) await readPending.catch(() => {})
      return true
    }
    try {
      closed = await Promise.race([cleanup(), new Promise(resolve => { cleanupTimer = clock.setTimeout(() => resolve(false), 5000) })])
    } catch { closed = false }
    clock.clearTimeout(cleanupTimer)
    cleanupMs = clock.now() - cleanupStart
    if (cleanupMs > 5000) closed = false
    if (!closed) note('cleanup_unconfirmed')
    signal?.removeEventListener('abort', cancel)
  }
  const parsed = parser.snapshot()
  if (bodyComplete) observer?.finish()
  const observed = observer?.snapshot()
  const result = { ...parsed, outcome: complete && !errors.length ? ({ stop: 'complete', length: 'truncated', content_filter: 'filtered' })[parsed.finish_reason] : 'failed',
    attempted, transport_complete: complete && !errors.length, response_body_complete: bodyComplete,
    evidence_complete: evidence && bodyComplete && complete && closed && !errors.length,
    error_code: errors[0] ?? stopCause, http_status: httpStatus, wire_bytes: wireBytes,
    termination: { policy: DEADLINE_POLICY, deadline_ms: timeoutMs, deadline_at_ms: deadline - started,
      stop_cause: stopCause, stopped_at_ms: stoppedAt, errors: [...errors],
      prefix_integrity: evidence && closed, local_pipeline_closed: closed, cleanup_limit_ms: 5000, cleanup_ms: cleanupMs,
      content_type: mime, wire_chunks: wire.length, wire_sha256: hash(Buffer.concat(wire)),
      content_sha256: hash(Buffer.from(parsed.content)), reasoning_sha256: hash(Buffer.from(parsed.reasoning)) },
    latency: { total_ms: elapsed(), first_wire_ms: firstWire, first_content_ms: firstContent, first_reasoning_ms: firstReasoning, evidence_write_ms: evidenceWriteMs },
    ...(accounting ? { accounting: { ...metrics,
      not_submitted_to_decoder_bytes: wireBytes - metrics.body_bytes_submitted_to_decoder,
      observation_unprocessed_bytes: metrics.body_bytes_submitted_to_decoder - observed.submitted_bytes,
      delivered_chunk_processing: durations.snapshot(), decoder: observed } } : {}) }
  try { emit('terminal', { result: structuredClone(result) }) } catch {
    result.outcome = 'failed'; result.evidence_complete = false; result.error_code = 'evidence_write_failed'
    result.termination.prefix_integrity = false
    result.termination.errors = [...errors]
  }
  if (accounting && evidence) result.accounting.terminal_durable_ack_ms = elapsed()
  sealed = true
  return result
}
