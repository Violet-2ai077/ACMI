import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { scanTransactions } from '../gate2/transaction-frame.mjs'
import { hash } from '../protocol/contracts.mjs'

const root = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-workload-bridge-prep-20261115'
const rows = []
for (const profile of ['P-L', 'P-H', 'P-G']) for (const arm of ['v4', 'v6']) {
  const parent = join(root, profile === 'P-G' ? 'verification' : 'writer-verification')
  const dir = join(parent, profile === 'P-G' ? arm + '-guarded' : profile + '-' + arm)
  const report = JSON.parse(readFileSync(join(parent, profile === 'P-G' ? arm + '-guarded-operations.json' : profile + '-' + arm + '-counts.json')))
  const calls = profile === 'P-G' ? report.ledger_calls : report.calls
  const file = join(dir, arm === 'v4' ? 'events.jsonl' : 'transactions.bin'), prefixes = [0]
  if (arm === 'v4') {
    const raw = readFileSync(file)
    let offset = 0
    while (offset < raw.length) { offset = raw.indexOf(10, offset) + 1; assert.ok(offset); prefixes.push(offset) }
  } else {
    const fd = openSync(file, 'r')
    try { scanTransactions(fd, { initialDigest: hash(readFileSync(join(dir, 'manifest.json'))), onEvent() {}, onFrame: f => prefixes.push(f.end) }) }
    finally { closeSync(fd) }
  }
  let cursor = 0, bytes = 0, count = 0
  const boundaries = []
  for (const c of calls) {
    assert.equal(c.completed, true)
    if (['capture', 'captureBatch'].includes(c.kind)) assert.equal(c.full_scans, 0, 'cache miss requires finer per-append scan evidence')
    const scanned = c.full_scans * prefixes[cursor]
    assert.ok(Number.isSafeInteger(scanned), 'scan precision')
    bytes += scanned; count += c.full_scans
    if (c.full_scans) boundaries.push({ operation_id: c.operation_id ?? c.index, kind: c.kind,
      full_scans: c.full_scans, journal_prefix_bytes: prefixes[cursor], journal_scan_bytes: scanned })
    cursor += c.append_calls; assert.ok(cursor < prefixes.length, 'append sequence out of range')
  }
  assert.equal(cursor, prefixes.length - 1); assert.equal(count, report.full_scans)
  rows.push({ profile, arm, full_scans: count, full_journal_scan_bytes: bytes, journal_bytes: prefixes.at(-1),
    boundaries, scope: 'Exact journal bytes at full replay boundaries; excludes manifest/freeze source reads, metadata syscalls and parsing/clone CPU. No time inference.' })
}
writeFileSync(join(root, 'full-audit-scan-work.json'), JSON.stringify({ model_calls: 0, performance_evaluation: false, rows }, null, 2) + '\n', { flag: 'wx', flush: true })
console.log(JSON.stringify(rows.map(({ boundaries, scope, ...r }) => r)))
