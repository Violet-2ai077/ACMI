import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, lstatSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { hash } from '../protocol/contracts.mjs'

const empty = () => ({ events: 0, reads: 0, logical_json_bytes: 0, channels: { wire: 0, transport: 0, model: 0, reasoning: 0 },
  base64_bytes: 0, max_read_bytes: 0, max_logical_bytes: 0, max_control_bytes: {} })
const physicalBound = r => r.logical_json_bytes + 146 * r.events + 65536

export async function inventoryJournal(root, expectedHead) {
  const manifestPath = join(root, 'manifest.json'), journalPath = join(root, 'events.jsonl')
  for (const p of [root, manifestPath, journalPath]) assert.ok(!lstatSync(p).isSymbolicLink(), 'linked inventory source')
  const original = [lstatSync(manifestPath), lstatSync(journalPath)]
  const manifestBytes = readFileSync(manifestPath), total = empty(), attempts = []
  let previous = hash(manifestBytes), current = null, seq = 0, delivery = null
  const fileHash = createHash('sha256'), stream = createReadStream(journalPath)
  stream.on('data', b => fileHash.update(b))
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    const e = JSON.parse(line), { digest, ...body } = e
    assert.ok(e.seq === ++seq && e.previous === previous && hash(body) === digest, 'source chain mismatch')
    previous = digest
    if (e.kind === 'reserve') {
      assert.ok(!current || current.settled, 'unsettled previous attempt')
      current = { ...empty(), attempt_id: e.value.attemptId, settled: false }; attempts.push(current)
    }
    assert.ok(current && e.value.attemptId === current.attempt_id && !current.settled, 'attempt boundary mismatch')
    const eventBytes = Buffer.byteLength(JSON.stringify(e))
    for (const r of [total, current]) { r.events++; r.logical_json_bytes += eventBytes; r.max_logical_bytes = Math.max(r.max_logical_bytes, eventBytes) }
    if (e.kind === 'capture') {
      const v = e.value, b = Buffer.from(v.bytes_base64, 'base64')
      assert.ok(b.toString('base64') === v.bytes_base64 && hash(b) === v.sha256, 'source payload mismatch')
      assert.ok(Object.hasOwn(total.channels, v.channel), 'unknown channel')
      for (const r of [total, current]) { r.channels[v.channel] += b.length; r.base64_bytes += v.bytes_base64.length }
      if (delivery) {
        assert.ok(v.channel === 'wire' && delivery.byte_length === b.length && delivery.sha256 === v.sha256, 'delivery/raw mismatch')
        delivery = null
      } else assert.notEqual(v.channel, 'wire', 'unpaired raw read')
      if (v.channel === 'transport') {
        const m = JSON.parse(b)
        if (m.kind === 'wire_delivery') {
          assert.equal(m.index, current.reads, 'read order mismatch')
          delivery = m
          for (const r of [total, current]) { r.reads++; r.max_read_bytes = Math.max(r.max_read_bytes, m.byte_length) }
        } else for (const r of [total, current]) r.max_control_bytes[m.kind] = Math.max(r.max_control_bytes[m.kind] ?? 0, b.length)
      }
    } else if (e.kind === 'settle') { assert.equal(delivery, null); current.settled = true; current.outcome = e.value.outcome }
    else assert.equal(e.kind, 'reserve', 'unknown event')
  }
  assert.equal(delivery, null, 'unpaired terminal read')
  assert.equal(previous, expectedHead, 'pinned head mismatch')
  for (const [i, p] of [manifestPath, journalPath].entries()) {
    const after = lstatSync(p), before = original[i]
    assert.ok(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs
      && after.ino === before.ino && !after.isSymbolicLink(), 'inventory source changed')
  }
  return { ...total, version: 'read-only-workload-inventory-v1', model_calls: 0, performance_evaluation: false,
    source_head: previous, manifest_sha256: hash(manifestBytes), journal_sha256: fileHash.digest('hex'),
    source_bytes: original[1].size, attempts: attempts.length, conservative_journal_bytes: physicalBound(total),
    per_attempt: attempts.map(a => ({ ...a, conservative_journal_bytes: physicalBound(a) })),
    last: { ...attempts.at(-1), conservative_journal_bytes: physicalBound(attempts.at(-1)) },
    qualification: 'Observed fixed input sizes, not a provider delivery bound, RSS/time proof or timing run. Physical bound assumes these exact logical values and no larger sequence encoding.' }
}
