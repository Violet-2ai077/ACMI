import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { inputs, evidenceWire, hash } from './design.mjs'

const [ledgerPath, out] = process.argv.slice(2)
assert(ledgerPath && out, 'Usage: node audit-wire.mjs <generation-ledger.jsonl> <new-audit.json>')
const byId = new Map(inputs.map(x => [x.id, x]))
const attempts = readFileSync(ledgerPath, 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse).filter(x => x.kind === 'attempt')
const observed = attempts.map(a => {
  const row = byId.get(a.id)
  assert(row && row.arm === a.arm)
  const wire = evidenceWire(row, null)
  assert.equal(hash(JSON.stringify(wire)), a.requestDigest, 'Ledger request differs from frozen wire')
  const data = JSON.parse(wire.prompt.slice(wire.prompt.lastIndexOf('\nCatalog data: ') + '\nCatalog data: '.length))
  assert.equal(Object.hasOwn(data, 'current_binding_hint'), row.arm !== 'C')
  assert.equal(Object.hasOwn(data, 'verified_mentions'), row.arm !== 'A')
  return { id: a.id, arm: row.arm, hasBinding: row.arm !== 'C', mentions: data.verified_mentions?.length ?? null, requestDigest: a.requestDigest }
})
writeFileSync(out, JSON.stringify({ provenance: 'offline_frozen_wire_against_actual_request_digest', count: observed.length,
  observed }, null, 2) + '\n', { flag: 'wx' })
