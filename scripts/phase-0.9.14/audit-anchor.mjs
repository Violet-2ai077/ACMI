import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogs, inputs, launches } from './design.mjs'
import { makeAnchorCase } from './controller.mjs'

const [run, out] = process.argv.slice(2)
assert(run && out, 'Usage: node audit-anchor.mjs <evaluation-dir> <new-output.json>')
const rows = name => readFileSync(join(run, name + '.jsonl'), 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse)
const anchors = rows('anchor-receipts')
const attempts = rows('generation-ledger').filter(r => r.kind === 'attempt')
const byId = new Map(inputs.map(x => [x.id, x]))
const packetMap = new Map()
for (const observed of anchors) {
  const entry = byId.get(observed.id)
  assert(entry && !packetMap.has(entry.id), 'Unexpected anchor receipt')
  const { packet, receipt } = makeAnchorCase(entry, catalogs.get(entry.id), launches.get(entry.id))(observed.source)
  assert.deepEqual(receipt, observed)
  packetMap.set(entry.id, { packet, digest: receipt.requestDigest })
}
for (const attempt of attempts) assert.equal(packetMap.get(attempt.id)?.digest, attempt.requestDigest)
const data = packet => JSON.parse(packet.prompt.slice(packet.prompt.lastIndexOf('\nCatalog data: ') + '\nCatalog data: '.length))
const pairs = inputs.filter(x => x.arm === 'A').flatMap(a => {
  const p = packetMap.get(a.id)?.packet, q = packetMap.get(a.probe + ':B')?.packet
  if (!p || !q) return []
  const { work_anchor, ...without } = data(q)
  assert.deepEqual(data(p), without)
  assert.equal(p.focus, q.focus)
  assert.deepEqual(p.schema, q.schema)
  assert.equal(p.prompt.split('\nCatalog data: ')[0], q.prompt.split('\nCatalog data: ')[0])
  return [{ probe: a.probe, onlyDifferenceIsAnchor: Boolean(work_anchor), identical: JSON.stringify(p) === JSON.stringify(q) }]
})
writeFileSync(out, JSON.stringify({ provenance: 'offline_host_fixture_and_request_digest_replay', receipts: anchors.length,
  requests: attempts.length, pairs }, null, 2) + '\n', { flag: 'wx' })
