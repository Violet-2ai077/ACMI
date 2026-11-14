import test from 'node:test'
import assert from 'node:assert/strict'
import { hash } from '../protocol/contracts.mjs'
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs'

let createWireAccounting
test('bounded observational accounting module exists', async () => {
  const api = await import('../gate2/wire-accounting.mjs').catch(() => ({}))
  assert.equal(typeof api.createWireAccounting, 'function')
  createWireAccounting = api.createWireAccounting
})
const event = (delta, finish_reason = null) => Buffer.from('data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] }) + '\r\n\r\n')
test('SSE boundary accounting is invariant under every-byte UTF8/CRLF/JSON splitting', () => {
  const json = '{"choices":[{"index":0,"delta":{"content":"\\u4e2d\\n"},"finish_reason":null}]}'
  const raw = Buffer.from(': heartbeat\r\n\r\ndata: ' + json + '\r\n\r\ndata: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n')
  const snapshots = [raw.length, 1, 7].map(size => {
    const a = createWireAccounting()
    for (let i = 0; i < raw.length; i += size) a.submit(raw.subarray(i, i + size))
    return a.snapshot()
  })
  assert.deepEqual(snapshots[0], snapshots[1]); assert.deepEqual(snapshots[0], snapshots[2])
  const s = snapshots[0]
  assert.equal(s.complete_sse_frames, 4)
  assert.equal(s.data_events, 3); assert.equal(s.comment_lines, 1); assert.equal(s.usage_events, 1)
  assert.equal(s.content_utf8_bytes, 4)
  assert.equal(s.payload_json_literal_bytes, 10)
  assert.equal(s.classified_frame_bytes, raw.length)
  assert.equal(s.envelope_bytes + s.payload_json_literal_bytes, raw.length)
  assert.equal(s.partial_tail_bytes, 0)
})
test('partial and observation-overflow bytes stay explicit without influencing acceptance', () => {
  const a = createWireAccounting({ maxFrameBytes: 20 })
  a.submit(Buffer.from('data: ' + 'x'.repeat(100)))
  const s = a.snapshot()
  assert.equal(s.observation_complete, false)
  assert.equal(s.unclassified_bytes, 106)
  assert.ok(s.buffered_bytes <= 20)
})

test('literal multibyte UTF8 and CR-only frames preserve byte accounting', () => {
  const raw = Buffer.from('data: {"choices":[{"delta":{"content":"\u4e2d"}}]}\r\r')
  const a = createWireAccounting()
  for (const byte of raw) a.submit(Buffer.from([byte]))
  a.finish()
  assert.equal(a.snapshot().classified_frame_bytes, raw.length)
  assert.equal(a.snapshot().content_utf8_bytes, 3)
  assert.equal(a.snapshot().payload_json_literal_bytes, 5)
  const tail = createWireAccounting(); tail.submit(Buffer.from('data: {'))
  assert.equal(tail.snapshot().partial_tail_bytes, 7)
})
test('raw durable callback precedes decode; derived callbacks coalesce only within one read', async () => {
  const parts = [Buffer.concat([event({ reasoning_content: 'r' }), event({ content: 'a' }, 'stop')]), Buffer.from('data: [DONE]\n\n')]
  const batches = [], singles = [], bytes = Buffer.from('{}')
  const r = await performDeadlineCompletion({ request: { bytes, sha256: hash(bytes), endpoint: 'https://synthetic.invalid/x' }, credential: 'SYNTHETIC',
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: async () => parts.length ? { done: false, value: parts.shift() } : { done: true }, cancel: async () => {} }) } }),
    timeoutMs: 180000, maxResponseBytes: 1048576, record: e => singles.push(e),
    recordBatch: es => batches.push(es), accounting: true })
  assert.deepEqual(batches.map(es => es.map(e => e.kind)), [['wire_delivery', 'wire'], ['reasoning', 'content'], ['wire_delivery', 'wire']])
  assert.equal(r.content, 'a'); assert.equal(r.outcome, 'complete')
  assert.equal(r.accounting.raw_chunks_committed, 2)
  assert.equal(r.accounting.decoder.content_utf8_bytes, 1)
  assert.ok(r.accounting.terminal_durable_ack_ms >= r.latency.total_ms)
  assert.equal(singles.find(e => e.kind === 'terminal').result.accounting.terminal_durable_ack_ms, null)
})
test('raw transaction failure prevents any decoded delta and does not claim durable bytes', async () => {
  const bytes = Buffer.from('{}'), parts = [event({ content: 'never published' })], seen = []
  const r = await performDeadlineCompletion({ request: { bytes, sha256: hash(bytes), endpoint: 'https://synthetic.invalid/x' }, credential: 'SYNTHETIC',
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
      read: async () => ({ done: false, value: parts.shift() }), cancel: async () => {} }) } }),
    timeoutMs: 180000, maxResponseBytes: 1048576, record() {}, recordBatch(es) { seen.push(es); throw Error('disk full') }, accounting: true })
  assert.equal(r.content, ''); assert.equal(r.error_code, 'evidence_write_failed')
  assert.equal(seen.length, 1); assert.equal(r.accounting.raw_bytes_committed, 0)
  assert.equal(r.termination.prefix_integrity, false)
})
