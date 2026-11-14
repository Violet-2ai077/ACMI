import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { openLedger, EVIDENCE_ROOT } from '../ledger/store.mjs'

function setup(runId = 'ledger') {
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const root = mkdtempSync(join(EVIDENCE_ROOT, 'test-'))
  return { root, runId, allowedRoot: EVIDENCE_ROOT, scope: { condition: 'C3', arm: 'A', session: 's1' } }
}
test('append-only evidence, immutable attempts and checkpoint survive a new process', () => {
  const options = setup()
  const ledger = openLedger(options)
  ledger.reserve('a1', 'turn1')
  ledger.appendAttempt({ attempt_id: 'a1', input: { turn_id: 't1' }, raw: Buffer.from('raw'), finish_reason: 'stop', chunks: [] })
  ledger.appendProposal({ attempt_id: 'a1', valid: true, workState: { intentionally: 'wrong state' } })
  ledger.checkpoint()
  const before = readFileSync(join(ledger.path, 'events.jsonl'))
  const script = "import {openLedger} from " + JSON.stringify(new URL('../ledger/store.mjs', import.meta.url).href) + "; process.stdout.write(JSON.stringify(openLedger(" + JSON.stringify({ ...options, resume: true }) + ").restore()))"
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(JSON.parse(child.stdout).proposals[0].workState.intentionally, 'wrong state')
  assert.deepEqual(readFileSync(join(ledger.path, 'events.jsonl')), before)
  assert.throws(() => ledger.reserve('a2', 'turn1'), /duplicate/)
  assert.throws(() => ledger.appendAttempt({ attempt_id: 'a1', raw: Buffer.from('replacement') }), /duplicate/)
  assert.throws(() => openLedger(options), /exist/)
})
test('tampered raw, interrupted lines and foreign scope fail closed', () => {
  const opts = setup()
  const l = openLedger(opts)
  l.reserve('x', 'x')
  l.appendAttempt({ attempt_id: 'x', input: {}, raw: Buffer.from('keep'), chunks: [], finish_reason: 'stop' })
  l.checkpoint()
  assert.throws(() => openLedger({ ...opts, resume: true, scope: { session: 'other' } }), /scope/)
  writeFileSync(join(l.path, 'outputs', 'x.raw'), 'tampered')
  assert.throws(() => l.restore(), /digest/)
  const second = openLedger(setup('partial'))
  writeFileSync(join(second.path, 'events.jsonl'), '{"partial":')
  assert.throws(() => second.restore(), /partial|JSON/)
})
test('outside roots and invalid proposals cannot create formal state', () => {
  assert.throws(() => openLedger({ root: 'E:/codex-prj/ACMI/acmi', runId: 'bad', allowedRoot: EVIDENCE_ROOT }), /outside/)
  const l = openLedger(setup())
  assert.throws(() => l.appendProposal({ attempt_id: 'missing', valid: false }), /proposal/)
  assert.deepEqual(l.restore().proposals, [])
})
