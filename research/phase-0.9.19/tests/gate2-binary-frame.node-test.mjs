import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'

const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'binary-frame-'))
let serial = 0, api
test('binary transaction codec exists', async () => {
  api = await import('../gate2/transaction-frame.mjs').catch(() => ({}))
  assert.equal(typeof api.encodeTransaction, 'function')
  assert.equal(typeof api.scanTransactions, 'function')
})
const event = n => {
  const body = { seq: n, previous: 'a'.repeat(64), kind: 'capture', value: { attemptId: 'b'.repeat(64), channel: 'wire', bytes_base64: 'eA==', sha256: hash('x'), elapsedMs: n } }
  return { ...body, digest: hash(body) }
}
function scan(bytes, opts = {}) {
  const file = join(root, 'f-' + ++serial)
  writeFileSync(file, bytes)
  const fd = openSync(file, 'r'), events = []
  try { return { ...api.scanTransactions(fd, { initialDigest: 'c'.repeat(64), onEvent: e => events.push(e), ...opts }), events } }
  finally { closeSync(fd) }
}
test('112-byte header and 32-byte trailer bind exact payload, metadata and sequence', () => {
  const events = [event(1), event(2)]
  const f = api.encodeTransaction({ seq: 1, previous: 'c'.repeat(64), events })
  assert.equal(f.bytes.length, 144 + Buffer.byteLength(JSON.stringify(events)))
  assert.equal(f.bytes.subarray(0, 8).toString('ascii'), 'ACMITX6\0')
  const out = scan(f.bytes)
  assert.deepEqual(out.events, events); assert.equal(out.physical_digest, f.digest)
  assert.equal(out.physical_seq, 1)
  for (const offset of [9, 11, 19, 25, 60, 70, 90, 115, f.bytes.length - 1]) {
    const changed = Buffer.from(f.bytes); changed[offset] ^= 1
    assert.throws(() => scan(changed))
  }
})
test('partial header/payload/trailer, impossible count/length and extra tail rejected', () => {
  const f = api.encodeTransaction({ seq: 1, previous: 'c'.repeat(64), events: [event(1)] }).bytes
  for (const n of [1, 111, 112, f.length - 33, f.length - 1]) assert.throws(() => scan(f.subarray(0, n)), /partial|length/)
  assert.throws(() => scan(Buffer.concat([f, Buffer.from('x')])), /partial/)
  const huge = Buffer.from(f); huge.writeBigUInt64BE(2n ** 63n, 52)
  assert.throws(() => scan(huge), /length|integer/)
  assert.throws(() => api.encodeTransaction({ seq: 1, previous: 'c'.repeat(64), events: [] }), /events/)
  assert.throws(() => api.encodeTransaction({ seq: 1, previous: 'c'.repeat(64), events: [event(1), { ...event(2), value: { ...event(2).value, attemptId: 'd'.repeat(64) } }] }), /attempt/)
})
test('reader binds multiple physical frames and handles escaped JSON across 64 KiB reads', () => {
  const e = event(1); e.value.bytes_base64 = Buffer.alloc(100000, 255).toString('base64')
  const a = api.encodeTransaction({ seq: 1, previous: 'c'.repeat(64), events: [e] })
  const b = api.encodeTransaction({ seq: 2, previous: a.digest, events: [event(2)] })
  const out = scan(Buffer.concat([a.bytes, b.bytes]))
  assert.equal(out.events.length, 2); assert.equal(out.physical_seq, 2)
  assert.throws(() => scan(Buffer.concat([b.bytes, a.bytes])), /physical/)
})
