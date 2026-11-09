/** Strict bounded v4 reader for one already opened regular file. */

import type { FileHandle } from 'node:fs/promises'
import { addAbortSignal, Readable } from 'node:stream'
import { constants, createZstdDecompress } from 'node:zlib'
import { ScopedJournalError, strictScanner, type DshJournalInspection, type JsonlCompression, type ScopedJournalLimits } from './journal-format.ts'

/** Effective limits cannot exceed the pilot's verified ceilings. */
export type DecodeLimits = Required<ScopedJournalLimits>

const HEADER_LIMIT = 16 * 1024
const CHUNK = 16 * 1024
const MAGIC = 0xfd2fb528

function corrupt(): never { throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT') }
function limit(): never { throw new ScopedJournalError('ACMI_JOURNAL_LIMIT') }

class ExactInput {
  offset = 0

  constructor(readonly handle: FileHandle, readonly size: number, readonly signal: AbortSignal) {}

  async take(length: number): Promise<Buffer> {
    this.signal.throwIfAborted()
    if (this.offset + length > this.size) corrupt()
    const output = Buffer.allocUnsafe(length)
    let done = 0
    while (done < length) {
      const { bytesRead } = await this.handle.read(output, done, length - done, this.offset)
      this.signal.throwIfAborted()
      if (bytesRead === 0) corrupt()
      this.offset += bytesRead
      done += bytesRead
    }
    return output
  }
}

// The writer emits independent checksummed frames. Slice exactly one frame
// before asking Node's public decoder to consume it: it can drop concatenated
// frames in one chunk and can emit a partial frame without an EOF error.
async function frame(input: ExactInput, maximum: number): Promise<Buffer> {
  const start = input.offset
  const parts: Buffer[] = []
  async function part(bytes: number): Promise<Buffer> {
    if (input.offset - start + bytes > maximum) limit()
    const buffer = await input.take(bytes)
    parts.push(buffer)
    return buffer
  }
  const magic = await part(4)
  if (magic.readUInt32LE() !== MAGIC) throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
  const descriptor = (await part(1)).readUInt8()
  if ((descriptor & 0x18) !== 0) corrupt()
  if ((descriptor & 0x04) === 0 || (descriptor & 3) !== 0) throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
  const singleSegment = (descriptor & 0x20) !== 0
  const sizeFlag = descriptor >>> 6
  const sizeBytes = sizeFlag === 0 ? Number(singleSegment) : 1 << sizeFlag
  await part((singleSegment ? 0 : 1) + sizeBytes)
  for (;;) {
    const block = (await part(3)).readUIntLE(0, 3)
    const kind = (block >>> 1) & 3
    const size = block >>> 3
    if (kind === 3 || size > 128 * 1024) corrupt()
    await part(kind === 1 ? 1 : size)
    if ((block & 1) !== 0) break
  }
  await part(4)
  return Buffer.concat(parts, input.offset - start)
}

async function decompress(bytes: Buffer, signal: AbortSignal, consume: (data: Buffer) => void): Promise<void> {
  const decoder = addAbortSignal(signal, createZstdDecompress({
    chunkSize: CHUNK, params: { [constants.ZSTD_d_windowLogMax]: 24 },
  }))
  const source = Readable.from([bytes])
  source.pipe(decoder)
  try {
    for await (const data of decoder as AsyncIterable<Buffer>) {
      signal.throwIfAborted()
      consume(data)
    }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof ScopedJournalError) throw error
    corrupt()
  } finally {
    source.destroy()
    decoder.destroy()
  }
}

class BodyBudget {
  private readonly utf8 = new TextDecoder('utf-8', { fatal: true })
  private lineBytes = 0
  private events = 0
  private depth = 0
  private quoted = false
  private escaped = false

  constructor(private readonly limits: DecodeLimits) {}

  inspect(chunk: Buffer): void {
    this.utf8.decode(chunk, { stream: true })
    for (const byte of chunk) {
      if (byte === 0x0a) {
        if (this.quoted || this.depth !== 0 || this.lineBytes === 0) corrupt()
        if (++this.events > this.limits.maxEvents) limit()
        this.lineBytes = 0
        continue
      }
      if (++this.lineBytes > this.limits.maxLineBytes) limit()
      if (this.quoted) {
        if (this.escaped) this.escaped = false
        else if (byte === 0x5c) this.escaped = true
        else if (byte === 0x22) this.quoted = false
      } else if (byte === 0x22) {
        this.quoted = true
      } else if (byte === 0x7b || byte === 0x5b) {
        if (++this.depth > this.limits.maxDepth) limit()
      } else if (byte === 0x7d || byte === 0x5d) {
        if (--this.depth < 0) corrupt()
      }
    }
  }

  finish(): void {
    this.utf8.decode()
    if (this.lineBytes !== 0) corrupt()
  }
}

/**
 * Read just one header, then allow its caller to authorize the exact same file before reading events.
 * @param handle - validated read-only regular-file descriptor.
 * @param size - observed size for this descriptor.
 * @param compression - expected physical encoding, verified from framing.
 * @param limits - lowered resource guardrails.
 * @param signal - bounded operation cancellation.
 * @returns validated header and deferred strict body read.
 */
export async function readHeader(
  handle: FileHandle, size: number, compression: JsonlCompression, limits: DecodeLimits, signal: AbortSignal,
): Promise<{ header: DshJournalInspection['meta']; body(): Promise<DshJournalInspection> }> {
  const input = new ExactInput(handle, size, signal)
  const maxHeader = Math.min(HEADER_LIMIT, limits.maxLineBytes, limits.maxPlainBytes)
  let header: Buffer
  if (compression === 'zstd') {
    const bytes = await frame(input, Math.min(HEADER_LIMIT, limits.maxCompressedBytes))
    const parts: Buffer[] = []
    let length = 0
    await decompress(bytes, signal, (chunk) => {
      length += chunk.length
      if (length > maxHeader || length > bytes.length * limits.maxExpansionRatio) limit()
      parts.push(chunk)
    })
    header = Buffer.concat(parts, length)
  } else {
    const bytes = Buffer.alloc(maxHeader)
    for (;;) {
      if (input.offset >= maxHeader) limit()
      const value = await input.take(1)
      const byte = value.readUInt8()
      bytes[input.offset - 1] = byte
      if (byte === 0x0a) break
    }
    header = bytes.subarray(0, input.offset)
  }
  const headerBudget = new BodyBudget(limits)
  headerBudget.inspect(header)
  headerBudget.finish()
  const scanner = strictScanner(header)
  return {
    header: scanner.header,
    async body() {
      const budget = new BodyBudget(limits)
      let plain = header.length
      function consume(chunk: Buffer): void {
        signal.throwIfAborted()
        plain += chunk.length
        if (plain > limits.maxPlainBytes || (compression === 'zstd' && plain > input.offset * limits.maxExpansionRatio)) limit()
        budget.inspect(chunk)
        scanner.write(chunk)
      }
      while (input.offset < size) {
        signal.throwIfAborted()
        if (compression === 'zstd') {
          const bytes = await frame(input, limits.maxCompressedBytes - input.offset)
          let produced = 0
          let last: number | undefined
          await decompress(bytes, signal, (chunk) => {
            produced += chunk.length
            if (produced > bytes.length * limits.maxExpansionRatio) limit()
            last = chunk.at(-1)
            consume(chunk)
          })
          if (produced === 0 || last !== 0x0a) corrupt()
        } else {
          consume(await input.take(Math.min(CHUNK, size - input.offset)))
        }
      }
      budget.finish()
      const scanned = scanner.finish()
      if (scanned.committedBytes !== plain) corrupt()
      signal.throwIfAborted()
      if (scanned.events.length > limits.maxEvents) limit()
      return { meta: scanned.meta, inheritedEventCount: scanned.inheritedEventCount, events: scanned.events }
    },
  }
}
