import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { createWireParser } from '../protocol/wire.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { openLedger, EVIDENCE_ROOT } from '../ledger/store.mjs'
import { runTurn } from '../runner/run.mjs'
import { makeFakeTransport } from '../runner/fake.mjs'
import { hash } from '../protocol/contracts.mjs'
import { evaluateArchive } from '../report/build.mjs'

test('strict JSON whitespace and active-target invariants agree across readers', () => {
  const f = getFixture(), p = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'A', turnId: 't1' })
  const v = predictionFor(f, p)
  const invalidActive = structuredClone(v)
  invalidActive.work_state.proposed_active_task_ids = []
  invalidActive.work_state.focus_task_id = null
  for (const raw of ['\u00a0' + JSON.stringify(v), JSON.stringify(invalidActive)]) {
    const parser = createWireParser({ arm: 'A', inputPacket: p })
    parser.push(Buffer.from(raw))
    assert.equal(parser.finish().valid, false)
    assert.equal(readRaw(Buffer.from(raw), { arm: 'A', inputPacket: p }).valid, false)
  }
})

test('reserved request is immutable before generation and budgets survive fresh policies', async () => {
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const root = mkdtempSync(join(EVIDENCE_ROOT, 'integrity-'))
  const f = getFixture(), p = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'A', turnId: 't1' })
  const l = openLedger({ root, runId: 'run' })
  l.reserve('manual', 'manual', p)
  assert.equal(existsSync(join(l.path, 'inputs', 'manual.json')), true)
  assert.deepEqual(JSON.parse(readFileSync(join(l.path, 'inputs', 'manual.json'), 'utf8')), p)
  await assert.rejects(runTurn({ inputPacket: p, policy: { transport: 'fake', maxCalls: 1 },
    transport: makeFakeTransport([]), ledger: l }), /budget/)
})

test('frozen oracle digest must match before any score can be produced', () => {
  const root = mkdtempSync(join(EVIDENCE_ROOT, 'oracle-'))
  const oracle = JSON.stringify(getFixture().oracle)
  const path = join(root, 'oracle.json')
  writeFileSync(path, oracle)
  const l = openLedger({ root, runId: 'run', oracleHash: hash(oracle) })
  writeFileSync(path, '{}')
  assert.throws(() => evaluateArchive({ archiveRoot: l.path, oraclePath: path }), /oracle digest/)
})
