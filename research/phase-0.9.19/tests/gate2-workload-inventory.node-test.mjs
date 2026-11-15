import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { inventoryJournal } from '../execution/capacity-workload-inventory.mjs'

function fixture(corrupt = false) {
  mkdirSync(GATE2_EVIDENCE_ROOT, { recursive: true })
  const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'inventory-test-'))
  const manifest = '{}'; writeFileSync(join(root, 'manifest.json'), manifest)
  const raw = Buffer.from('a'), id = 'a'.repeat(64)
  const capture = (channel, bytes) => ({ attemptId: id, channel, bytes_base64: bytes.toString('base64'), sha256: hash(bytes), elapsedMs: 1 })
  const source = [ ['reserve', { attemptId: id }],
    ['capture', capture('transport', Buffer.from(JSON.stringify({ kind: 'wire_delivery', index: 0, phase: 'generation', byte_length: 1, sha256: hash(raw) })))],
    ['capture', capture('wire', raw)], ['capture', capture('model', raw)],
    ['settle', { attemptId: id, outcome: 'success' }] ]
  let previous = hash(manifest)
  const lines = source.map(([kind, value], i) => { const body = { seq: i + 1, previous, kind, value }; previous = hash(body); return { ...body, digest: previous } })
  if (corrupt) lines[2].value.bytes_base64 = 'Yg=='
  writeFileSync(join(root, 'events.jsonl'), lines.map(x => JSON.stringify(x)).join('\n') + '\n')
  return { root, head: previous }
}

test('read-only inventory checks chain, exact per-record bytes and read metadata', async () => {
  const f = fixture(), r = await inventoryJournal(f.root, f.head)
  assert.equal(r.events, 5); assert.equal(r.reads, 1); assert.equal(r.attempts, 1)
  assert.equal(r.max_read_bytes, 1); assert.equal(r.channels.wire, 1)
  assert.equal(r.last.events, 5); assert.equal(r.source_head, f.head)
  assert.equal(r.performance_evaluation, false)
  assert.ok(r.conservative_journal_bytes > r.source_bytes)
})

test('inventory rejects corrupt payload and wrong pinned head', async () => {
  const f = fixture(true); await assert.rejects(inventoryJournal(f.root, f.head), /chain|payload/)
  const g = fixture(); await assert.rejects(inventoryJournal(g.root, 'f'.repeat(64)), /head/)
})
