import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { encodeInline } from '../protocol/wire.mjs'
import { openLedger, EVIDENCE_ROOT } from '../ledger/store.mjs'
import { makeFakeTransport } from '../runner/fake.mjs'
import { runTurn } from '../runner/run.mjs'
import { evaluateArchive } from '../report/build.mjs'
import { hash } from '../protocol/contracts.mjs'

test('eight-turn raw replay, all conditions and protocols, restart and stale-state counterexample', async () => {
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const root = mkdtempSync(join(EVIDENCE_ROOT, 'e2e-'))
  const f = getFixture()
  const oraclePath = join(root, 'oracle.json')
  writeFileSync(oraclePath, JSON.stringify(f.oracle), { flag: 'wx' })
  const reports = []
  for (const condition of ['C1', 'C2', 'C3']) for (const arm of ['A', 'B']) {
    const opts = { root, runId: condition + '-' + arm, scope: { condition, arm, family_id: f.publicScenario.family_id }, oracleHash: hash(JSON.stringify(f.oracle)) }
    let ledger = openLedger(opts), history = []
    const policy = { transport: 'fake', maxCalls: 8 }
    for (let i = 1; i <= 8; i++) {
      const p = buildInput(f.publicScenario, history, { condition, arm, turnId: 't' + i })
      const value = predictionFor(f, p)
      if (i === 8 && condition === 'C3' && arm === 'B') value.work_state.task_memory[0].criteria[0].state = 'pending'
      const raw = arm === 'A' ? JSON.stringify(value) : encodeInline(value)
      const record = await runTurn({ inputPacket: p, policy, transport: makeFakeTransport([{ raw, chunkSize: 113 }]), ledger })
      assert.equal(record.valid, true, record.error)
      history.push({ role: 'assistant', source_id: 'a' + i, turn_id: p.turn_id, content: record.raw.toString(), projection: record.workState })
      if (i === 4) {
        ledger.checkpoint()
        const code = 'import {openLedger} from ' + JSON.stringify(new URL('../ledger/store.mjs', import.meta.url).href) +
          ';process.stdout.write(JSON.stringify(openLedger(' + JSON.stringify({ ...opts, resume: true }) + ').restore()))'
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
        assert.equal(child.status, 0, child.stderr)
        assert.equal(JSON.parse(child.stdout).attempts.length, 4)
        ledger = openLedger({ ...opts, resume: true })
        const saved = ledger.restore()
        history = saved.attempts.map(a => ({
          role: 'assistant', source_id: 'a' + a.turn_id.slice(1), turn_id: a.turn_id,
          content: readFileSync(join(ledger.path, 'outputs', a.attempt_id + '.raw'), 'utf8'),
          projection: saved.proposals.find(p => p.attempt_id === a.attempt_id)?.workState
        }))
      }
    }
    const result = evaluateArchive({ archiveRoot: ledger.path, oraclePath })
    assert.equal(JSON.stringify(result), JSON.stringify(evaluateArchive({ archiveRoot: ledger.path, oraclePath })))
    const metric = result.json.conditions[condition][0]
    assert.equal(metric.user.f1, 1)
    if (condition === 'C3' && arm === 'B') {
      assert.equal(metric.rows.at(-1).state.snapshot_exact, false)
      assert.equal(metric.rows.at(-1).state.dormant_recovery, 0)
    } else assert.equal(metric.state_snapshot_exact, 1)
    reports.push({ condition, arm, archive: ledger.path, user_f1: metric.user.f1, state_snapshot_exact: metric.state_snapshot_exact })
  }
  writeFileSync(join(root, 'summary.json'), JSON.stringify(reports, null, 2), { flag: 'wx' })
  process.stdout.write('EVIDENCE ' + root + '\n')
})
