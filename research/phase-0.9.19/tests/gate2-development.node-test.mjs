import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDevelopmentCorpus, renderOracle } from '../gate2/development-corpus.mjs'
import { validateCorpus } from '../gate2/corpus.mjs'
import { buildInput } from '../context/build.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt } from '../evaluator/score.mjs'
import { encodeInline } from '../protocol/wire.mjs'
import { scoreDevelopmentAttempt, checkDevelopmentAnswers } from '../gate2/development-evaluator.mjs'

const narrative = readFileSync(new URL('../gate2/development-scenarios.md', import.meta.url), 'utf8')
test('development corpus has complete condition-specific reviewed state and real birth histories', () => {
  const data = buildDevelopmentCorpus(narrative)
  const r = validateCorpus(data)
  assert.deepEqual(r.errors, [])
  assert.equal(r.state_opportunity_coverage_complete, true, JSON.stringify(r.missing_coverage))
  assert.equal(data.oracleCorpus.families.reduce((n, f) => n + Object.values(f.oracle).reduce((a, c) => a + Object.keys(c).length, 0), 0), 144)
  assert.equal(data.publicCorpus.families.flatMap(s => s.turns.flatMap(t => t.messages)).length, 49)
  assert.equal(JSON.stringify(data).includes('Engineering reference only'), false)
  assert.equal(r.semantic_truth_verified, false)
  for (const s of data.publicCorpus.families) assert.deepEqual(s.initial.C3, [])
})

test('all authored oracle vectors round-trip both protocols and historical UUID births', () => {
  const data = buildDevelopmentCorpus(narrative)
  for (const s of data.publicCorpus.families) for (const condition of ['C1', 'C2', 'C3']) for (const t of s.turns) for (const arm of ['A', 'B']) {
    const p = buildInput(s, s.reference_history[condition], { condition, arm, turnId: t.turn_id })
    const family = data.oracleCorpus.families.find(f => f.family_id === s.family_id), g = family.oracle[condition][t.turn_id]
    const envelope = renderOracle(family, p)
    const raw = readRaw(Buffer.from(arm === 'A' ? JSON.stringify(envelope) : encodeInline(envelope)), { arm, inputPacket: p })
    assert.equal(raw.valid, true, `${s.family_id}/${condition}/${t.turn_id}/${arm}: ${raw.errors}`)
    const score = scoreAttempt({ inputPacket: p, oracle: g, attempt: { track: 'FROZEN-REPLAY', arm }, rawPrediction: raw })
    assert.equal(score.state.snapshot_exact, true)
    assert.equal(score.actions_exact, true)
    assert.equal(score.user.fp + score.user.fn + score.assistant.fp + score.assistant.fn, 0)
    assert.equal(checkDevelopmentAnswers(g, raw, arm).every(c=>c.passed),true,`${s.family_id}/${t.turn_id} answer`)
  }
})

test('frozen answer alternatives accept spelled numbers while wrong task/completion cannot pass', () => {
  const data=buildDevelopmentCorpus(narrative), s=data.publicCorpus.families[1], f=data.oracleCorpus.families[1]
  const p=buildInput(s,[],{condition:'C1',arm:'A',turnId:'t1'}), g=f.oracle.C1.t1
  const evaluate=v=>scoreDevelopmentAttempt({inputPacket:p,oracle:g,attempt:{arm:'A',track:'FROZEN-REPLAY'},rawPrediction:readRaw(Buffer.from(JSON.stringify(v)),{arm:'A',inputPacket:p})})
  const v=renderOracle(f,p); v.answer[0].text='Three sizes are required.'
  assert.equal(evaluate(v).answer_passed,true)
  v.answer[0].text='Two sizes are required.'; assert.equal(evaluate(v).answer_passed,false)
  const wrong=renderOracle(f,p), b=f.canonical_tasks[1].task_id
  wrong.work_state.decisions[0].actions=[{op:'CONTINUE',task_ids:[b]}];wrong.work_state.decisions[0].task_ids=[b]
  if(!wrong.work_state.proposed_active_task_ids.includes(b))wrong.work_state.proposed_active_task_ids.push(b)
  assert.ok(evaluate(wrong).user.fp>0)
  const done=renderOracle(f,p);done.work_state.task_memory[0].lifecycle_status='completed';done.work_state.status_updates[0].to='completed'
  assert.ok(evaluate(done).state.false_actual_completions>0)
})

test('narrative edits cannot silently reuse old reviewed expectations', () => {
  assert.throws(() => buildDevelopmentCorpus(narrative.replace('six entries in two batches', 'seven entries in two batches')), /narrative|evidence|source/)
})
