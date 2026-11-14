import test from 'node:test'
import assert from 'node:assert/strict'
import { hash } from '../protocol/contracts.mjs'

export function fakeClock() {
  let now = 0, id = 0
  const jobs = new Map()
  return { now: () => now, setTimeout(fn, ms) { jobs.set(++id, { at: now + ms, fn }); return id }, clearTimeout(id) { jobs.delete(id) },
    async advance(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn() }
      for (let i = 0; i < 30; i++) await Promise.resolve() },
    async flush() { for (let i = 0; i < 30; i++) await Promise.resolve() } }
}
export const event = (delta = {}, finish_reason = null) => Buffer.from('data: ' + JSON.stringify({ id: 'one', model: 'synthetic', choices: [{ index: 0, delta, finish_reason }] }) + '\n\n')
export function fakeResponse(parts = [], { stuckCancel = false, late = null, status = 200, mime = 'text/event-stream' } = {}) {
  let resolveRead
  return { status, redirected: false, headers: new Headers({ 'content-type': mime }), body: { getReader: () => ({
    read() { return parts.length ? Promise.resolve({ value: parts.shift(), done: false }) : new Promise(r => { resolveRead = r }) },
    cancel() { if (stuckCancel) return new Promise(() => {}); resolveRead?.(late ? { value: late, done: false } : { done: true }); return Promise.resolve() }
  }) } }
}
let api
test('deadline transport revision exists separately from legacy transport', async () => {
  api = await import('../gate2/deadline-transport.mjs').catch(() => ({}))
  assert.equal(typeof api.performDeadlineCompletion, 'function')
})
const bytes = Buffer.from('{}'), request = { bytes, sha256: hash(bytes), endpoint: 'https://synthetic.invalid/v1/chat/completions' }
function start(response, extra = {}) {
  const clock = fakeClock(), records = []
  const promise = api.performDeadlineCompletion({ request, credential: 'SYNTHETIC', fetchImpl: async () => response,
    record: e => records.push(e), timeoutMs: 180000, maxResponseBytes: 1048576, clock, ...extra })
  return { clock, records, promise }
}
test('180 seconds is fixed; prefix and late-delivery bytes persist without late scoring', async () => {
  const early = event({ reasoning_content: 'thinking' }), late = event({ content: 'too late' }, 'stop')
  const x = start(fakeResponse([early], { late }))
  await x.clock.flush(); await x.clock.advance(179999)
  assert.equal(x.records.some(e => e.kind === 'terminal'), false)
  await x.clock.advance(1)
  const r = await x.promise
  assert.equal(r.error_code, 'timeout'); assert.equal(r.outcome, 'failed')
  assert.equal(r.content, ''); assert.equal(r.reasoning, 'thinking')
  assert.equal(r.termination.prefix_integrity, true)
  assert.equal(r.termination.local_pipeline_closed, true)
  assert.equal(r.termination.deadline_ms, 180000)
  assert.equal(r.termination.wire_sha256, hash(Buffer.concat([early, late])))
  assert.deepEqual(x.records.filter(e => e.kind === 'wire_delivery').map(e => e.phase), ['generation', 'cleanup'])
  assert.equal(r.evidence_complete, false); assert.equal(r.usage, null)
})
test('earlier HTTP, SSE and UTF8 failures are not masked by deadline', async () => {
  for (const response of [fakeResponse([], { status: 400 }), fakeResponse([Buffer.from('data: {bad}\n\n')]), fakeResponse([Buffer.from([255])])]) {
    const x = start(response); await x.clock.flush(); await x.clock.advance(180000)
    const r = await x.promise
    assert.notEqual(r.error_code, 'timeout')
    assert.ok(r.termination.errors.length)
  }
})
test('cleanup has its own 5000 ms bound and uncertain closure cannot claim integrity', async () => {
  const x = start(fakeResponse([], { stuckCancel: true }))
  await x.clock.flush(); await x.clock.advance(180000)
  assert.equal(x.records.some(e => e.kind === 'terminal'), false)
  await x.clock.advance(4999)
  assert.equal(x.records.some(e => e.kind === 'terminal'), false)
  await x.clock.advance(1)
  const r = await x.promise
  assert.equal(r.termination.local_pipeline_closed, false)
  assert.equal(r.termination.prefix_integrity, false)
  assert.ok(r.termination.errors.includes('cleanup_unconfirmed'))
})
test('external cancellation and sink failure remain hard failures', async () => {
  const controller = new AbortController(), x = start(fakeResponse(), { signal: controller.signal })
  await x.clock.flush(); controller.abort(); await x.clock.flush()
  assert.equal((await x.promise).error_code, 'cancelled')
  const y = start(fakeResponse([event({ content: 'x' })]), { record(e) { if (e.kind === 'wire') throw Error('disk') } })
  await y.clock.flush()
  const r = await y.promise
  assert.equal(r.error_code, 'evidence_write_failed'); assert.equal(r.termination.prefix_integrity, false)
})

test('archive callback cannot mutate delivered bytes or decoder input', async () => {
  const records = [], x = start(fakeResponse([event({ reasoning_content: 'original' })]), { record(e) {
    if (e.kind === 'wire') e.bytes.fill(0)
    records.push(e)
  } })
  await x.clock.flush(); await x.clock.advance(180000)
  const r = await x.promise
  assert.equal(r.reasoning, 'original')
  assert.equal(r.error_code, 'timeout')
})

test('late cleanup cannot claim success when synchronous work starves cleanup timer', async () => {
  let now = 0, trigger, release
  const clock = { now: () => now, setTimeout(fn, ms) { if (ms === 180000) trigger = fn; return fn }, clearTimeout() {} }
  const r = api.performDeadlineCompletion({ request, credential: 'SYNTHETIC', timeoutMs: 180000, maxResponseBytes: 1048576, clock, record() {},
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: () => new Promise(resolve => { release = resolve }), cancel: () => { now += 5001; release({ done: true }); return Promise.resolve() }
    }) } }) })
  for (let i = 0; i < 30; i++) await Promise.resolve()
  now = 180000; trigger()
  assert.equal((await r).termination.local_pipeline_closed, false)
})

test('hard byte limit and terminal write failures cannot become censored candidates', async () => {
  const x = start(fakeResponse([event({ content: 'oversized' })]), { maxResponseBytes: 1 })
  await x.clock.flush()
  assert.equal((await x.promise).error_code, 'response_byte_limit')
  const y = start(fakeResponse(), { record(e) { if (e.kind === 'terminal') throw Error('disk') } })
  await y.clock.flush(); await y.clock.advance(180000)
  const r = await y.promise
  assert.equal(r.error_code, 'evidence_write_failed')
  assert.equal(r.termination.prefix_integrity, false)
})

test('cancelled read EOF is not evidence that the remote response completed', async () => {
  const x = start(fakeResponse())
  await x.clock.flush(); await x.clock.advance(180000)
  const r = await x.promise
  assert.equal(r.response_body_complete, false)
  assert.equal(r.termination.local_pipeline_closed, true)
})

test('native abort-error stream closure is confirmed without hiding earlier failures', async () => {
  const clock = fakeClock()
  const promise = api.performDeadlineCompletion({ request, credential: 'SYNTHETIC', record() {}, timeoutMs: 180000, maxResponseBytes: 1048576, clock,
    fetchImpl: async (_, init) => new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('local abort', 'AbortError')), { once: true })
    } }), { headers: { 'content-type': 'text/event-stream' } }) })
  await clock.flush(); await clock.advance(180000)
  const r = await promise
  assert.equal(r.error_code, 'timeout')
  assert.equal(r.termination.local_pipeline_closed, true)
  assert.deepEqual(r.termination.errors, [])
})

test('deadline racing an unrelated pending-read rejection cannot mask that failure', async () => {
  let rejectRead
  const x = start({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
    read: () => new Promise((_, reject) => { rejectRead = reject }),
    cancel: () => { rejectRead(Error('network failure, not local AbortError')); return Promise.resolve() }
  }) } })
  await x.clock.flush(); await x.clock.advance(180000)
  const r = await x.promise
  assert.equal(r.error_code, 'transport_error')
  assert.ok(r.termination.errors.includes('transport_error'))
})
