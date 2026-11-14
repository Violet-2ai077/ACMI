import { createHash } from 'node:crypto'
import { readSync, fstatSync } from 'node:fs'

export const BINARY_STORAGE = 'gate2-transaction-binary-v1'
export const HEADER_BYTES = 112
export const TRAILER_BYTES = 32
const MAGIC = Buffer.from('ACMITX6\0', 'ascii')
const DOMAIN = Buffer.from('ACMI-G2-TX-BINARY-V1\0', 'ascii')
const CHANNEL_BYTES = 4194304
// Existing semantics: four channels, nonempty captures, <=4 MiB/channel.
// 1024 covers the fixed logical envelope, safe integer digits and bounded IDs.
export const MAX_EVENT_BYTES = 4 * Math.ceil(CHANNEL_BYTES / 3) + 1024
export const MAX_FRAME_EVENTS = 4 * CHANNEL_BYTES
export const MAX_PAYLOAD_BYTES = MAX_FRAME_EVENTS * (1025 + 4) + 2
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const positive = v => Number.isSafeInteger(v) && v > 0
const reject = message => { throw new Error('binary transaction ' + message) }

function checkedHeader(h) {
  if (!h.subarray(0, 8).equals(MAGIC) || h.readUInt16BE(8) !== 1 || h.readUInt16BE(10) !== 0) reject('version/flags')
  const number = offset => {
    const value = h.readBigUInt64BE(offset)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) reject('integer overflow')
    return Number(value)
  }
  const f = { seq: number(12), previous: h.subarray(20, 52).toString('hex'), length: number(52),
    count: h.readUInt32BE(60), first: number(64), last: number(72), attemptId: h.subarray(80, 112).toString('hex') }
  if (!positive(f.seq) || !positive(f.length) || f.length > MAX_PAYLOAD_BYTES ||
      !positive(f.count) || f.count > MAX_FRAME_EVENTS || !positive(f.first) || !positive(f.last) ||
      f.last - f.first !== f.count - 1 || f.length < 2 + f.count * 2) reject('length/count/range')
  return f
}

export function encodeTransaction({ seq, previous, events }) {
  if (!positive(seq) || !hex(previous) || !Array.isArray(events) || !events.length || events.length > MAX_FRAME_EVENTS) reject('events/header')
  const attemptId = events[0].value?.attemptId, first = events[0].seq
  if (!hex(attemptId) || events.some((e, i) => e.value?.attemptId !== attemptId || e.seq !== first + i) ||
      (events.length > 1 && events.some(e => e.kind !== 'capture'))) reject('attempt/range')
  const payload = Buffer.from(JSON.stringify(events)), header = Buffer.alloc(HEADER_BYTES)
  MAGIC.copy(header); header.writeUInt16BE(1, 8); header.writeBigUInt64BE(BigInt(seq), 12)
  Buffer.from(previous, 'hex').copy(header, 20); header.writeBigUInt64BE(BigInt(payload.length), 52)
  header.writeUInt32BE(events.length, 60); header.writeBigUInt64BE(BigInt(first), 64)
  header.writeBigUInt64BE(BigInt(events.at(-1).seq), 72); Buffer.from(attemptId, 'hex').copy(header, 80)
  checkedHeader(header)
  const digest = createHash('sha256').update(DOMAIN).update(header).update(payload).digest()
  return { bytes: Buffer.concat([header, payload, digest]), digest: digest.toString('hex'), seq }
}

function eventReader(onEvent) {
  let mode = 'array', depth = 0, quoted = false, escaped = false, bytes = 0, count = 0
  let pieces = []
  return {
    push(chunk) {
      let start = mode === 'object' ? 0 : -1
      for (let i = 0; i < chunk.length; i++) {
        const b = chunk[i]
        if (mode === 'array') { if (b !== 91) reject('payload array'); mode = 'first'; continue }
        if (mode === 'separator') {
          if (b === 44) mode = 'next'
          else if (b === 93) mode = 'done'
          else reject('payload separator')
          continue
        }
        if (mode === 'done') reject('payload trailing bytes')
        if (mode === 'first' || mode === 'next') {
          if (b !== 123) reject('payload event object')
          mode = 'object'; start = i; depth = 0
        }
        if (++bytes > MAX_EVENT_BYTES) reject('logical event length')
        if (quoted) {
          if (escaped) escaped = false
          else if (b === 92) escaped = true
          else if (b === 34) quoted = false
        } else if (b === 34) quoted = true
        else if (b === 123 || b === 91) depth++
        else if (b === 125 || b === 93) depth--
        if (!depth && !quoted) {
          pieces.push(chunk.subarray(start, i + 1))
          const raw = Buffer.concat(pieces), text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
          const value = JSON.parse(text)
          // New physical format has one encoding; duplicate keys and alternate
          // encodings cannot hide under JSON.parse's last-key semantics.
          if (JSON.stringify(value) !== text) reject('noncanonical logical encoding')
          onEvent(value, count++)
          pieces = []; bytes = 0; mode = 'separator'; start = -1
        }
      }
      if (start >= 0) pieces.push(chunk.subarray(start))
    },
    finish(expected) { if (mode !== 'done' || count !== expected) reject('partial payload/count') }
  }
}

// Events are tentative until the whole audit succeeds. Never publish the state
// from onEvent callbacks before this scanner and the caller's fingerprint check.
export function scanTransactions(fd, { initialDigest, onEvent, onFrame = () => {} }) {
  if (!hex(initialDigest) || typeof onEvent !== 'function') reject('scanner configuration')
  const size = fstatSync(fd).size
  let offset = 0, physical_seq = 0, physical_digest = initialDigest, logical = 0
  function read(n) {
    if (n > size - offset) reject('partial frame length')
    const b = Buffer.allocUnsafe(n)
    let used = 0
    while (used < n) {
      const got = readSync(fd, b, used, n - used, offset + used)
      if (!got) reject('partial read')
      used += got
    }
    offset += n
    return b
  }
  while (offset < size) {
    const start = offset, header = read(HEADER_BYTES), f = checkedHeader(header)
    if (f.seq !== physical_seq + 1 || f.previous !== physical_digest || f.first !== logical + 1) reject('physical/logical chain')
    if (f.length + TRAILER_BYTES > size - offset) reject('partial payload length')
    const digest = createHash('sha256').update(DOMAIN).update(header)
    const parser = eventReader((e, index) => {
      if (e.seq !== f.first + index || e.value?.attemptId !== f.attemptId || (f.count > 1 && e.kind !== 'capture')) reject('event attempt/range')
      onEvent(e, { transactionOffset: start, physicalSeq: f.seq })
    })
    let remaining = f.length
    while (remaining) {
      const b = read(Math.min(65536, remaining)); remaining -= b.length
      digest.update(b); parser.push(b)
    }
    parser.finish(f.count)
    const expected = read(TRAILER_BYTES), actual = digest.digest()
    if (!actual.equals(expected)) reject('physical digest')
    physical_seq = f.seq; physical_digest = actual.toString('hex'); logical = f.last
    onFrame({ ...f, digest: physical_digest, start, end: offset })
  }
  return { physical_seq, physical_digest, bytes_read: offset }
}
