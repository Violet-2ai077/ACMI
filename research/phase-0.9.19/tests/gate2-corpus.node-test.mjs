import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCorpus } from '../gate2/corpus.mjs'
import { A, B } from '../corpus/fixtures.mjs'
import { makeCorpusFixture as sample, makeSupportedCorpusFixture } from './support/corpus-fixture.mjs'
const first = s => s.oracleCorpus.families[0]

test('Gate 2 corpus separates structural validity from state support and semantic research claims', () => {
  const r = validateCorpus(sample())
  assert.equal(r.structural_valid, true, JSON.stringify(r.errors))
  assert.equal(r.scored_turns_per_condition, 48)
  assert.equal(r.corpus_completeness_verified, false)
  assert.equal(r.semantic_truth_verified, false)
  assert.equal(r.family_independence_verified, false)
  assert.equal(r.live_execution_ready, false)
  assert.equal(r.missing_coverage.length, 36)
  assert.equal(r.conditions.C3.SM5.change, 0)
})

test('Gate 2 corpus rejects absent or extra families, turns, conditions and unit obligations', () => {
  for (const mutate of [s => s.publicCorpus.families.pop(), s => { delete first(s).oracle.C3 },
    s => { delete first(s).oracle.C1.t8 }, s => { first(s).oracle.C1.extra = first(s).oracle.C1.t1 },
    s => { first(s).oracle.C2.t1.decisions = [] }, s => { first(s).oracle.C2.t1.answer = [] },
    s => { s.publicCorpus.split = 'validation' }, s => { first(s).canonical_tasks[0].task_id = 'unknown' }]) {
    const s = sample(); mutate(s); assert.equal(validateCorpus(s).structural_valid, false)
  }
})

test('Gate 2 corpus rejects future evidence, unknown tasks, incomplete memory and forbidden-positive overlap', () => {
  for (const mutate of [g => { g.decisions[0].evidence = [{ source_id: 'u8', quote: 'Return' }] },
    g => { g.known_tasks = [] }, g => { g.task_memory = [] }, g => { g.forbidden = [A] },
    g => { g.decisions[0].task_ids = ['99999999-9999-4999-8999-999999999999'] },
    g => { g.focus_task_id = B }, g => { g.task_memory[0].criteria[0].ref.quote = 'missing quote' }]) {
    const s = sample(); mutate(first(s).oracle.C1.t1); assert.equal(validateCorpus(s).structural_valid, false)
  }
})

test('Gate 2 corpus verifies birth declarations and reference history without rewriting either', () => {
  const s = sample(); first(s).oracle.C3.t1.births = []
  assert.equal(validateCorpus(s).structural_valid, false)
  const t = sample(); t.publicCorpus.families[0].reference_history.C3.reverse()
  assert.equal(validateCorpus(t).structural_valid, false)
  const u = sample(); u.publicCorpus.families[0].reference_history.C1[0].source_id = 'u1'
  assert.equal(validateCorpus(u).structural_valid, false)
})

test('Gate 2 state opportunities require actual field changes or retention and stay condition-specific', () => {
  const s = sample(), f = first(s)
  f.state_opportunities = [
    { condition: 'C1', theme: 'SM2', kind: 'change', task_id: A, previous_turn_id: 't1', turn_id: 't2' },
    { condition: 'C1', theme: 'SM2', kind: 'retain', task_id: A, previous_turn_id: 't2', turn_id: 't3' }
  ]
  const r = validateCorpus(s)
  assert.equal(r.structural_valid, true, JSON.stringify(r.errors))
  assert.equal(r.conditions.C1.SM2.change, 1)
  assert.equal(r.conditions.C1.SM2.retain, 1)
  assert.equal(r.conditions.C3.SM2.change, 0)
  assert.equal(r.support_by_difficulty.C1.simple.SM2.change, 1)
  assert.equal(r.support_by_difficulty.C1.medium.SM2.retain, 1)
  f.state_opportunities[0].kind = 'retain'
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 dormant recovery checks declared attribution gap rather than trusting a gap label', () => {
  const s = sample(), f = first(s)
  f.state_opportunities = [{ condition: 'C1', theme: 'SM5', kind: 'change', task_id: A, previous_turn_id: 't7', turn_id: 't8', last_active_turn_id: 't2' }]
  assert.equal(validateCorpus(s).structural_valid, true)
  f.state_opportunities[0].last_active_turn_id = 't3'
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 recovery declarations must agree with actual session and agent transitions', () => {
  const s = sample(); s.publicCorpus.families[0].turns[4].session_id = 'unannounced-session'
  assert.equal(validateCorpus(s).structural_valid, false)
  const t = sample(); t.oracleCorpus.families[2].recovery_points[0].turn_id = 't4'
  assert.equal(validateCorpus(t).structural_valid, false)
})

test('Gate 2 oracle changed flags and visible old task inventory cannot silently drift', () => {
  const s = sample(); first(s).oracle.C1.t3.changed = false
  assert.equal(validateCorpus(s).structural_valid, false)
  const t = sample(), g = first(t).oracle.C1.t4
  g.known_tasks = [B]; g.task_memory = g.task_memory.filter(m => m.task_id === B); g.proposed_active_task_ids = [B]
  assert.equal(validateCorpus(t).structural_valid, false)
})

test('Gate 2 unordered state reformatting is not evidence of a change opportunity', () => {
  const s = sample(), f = first(s)
  for (const g of Object.values(f.oracle.C1)) g.task_memory[0].objective_refs = [{ source_id: 'u1', quote: 'Repair gateway' }, { source_id: 'u1', quote: 'test passes' }]
  f.oracle.C1.t3.task_memory[0].objective_refs.reverse()
  f.state_opportunities = [{ condition: 'C1', theme: 'SM2', kind: 'change', task_id: A, previous_turn_id: 't2', turn_id: 't3' }]
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 historical birth coordinates and initial catalog must belong to the same corpus', () => {
  const s = sample(); first(s).oracle.C3.t4.prior_births[0].source_id = 'a8'
  assert.equal(validateCorpus(s).structural_valid, false)
  const t = sample(); t.publicCorpus.families[0].catalog[0].task_id = '99999999-9999-4999-8999-999999999999'
  assert.equal(validateCorpus(t).structural_valid, false)
})

test('Gate 2 C1 cannot recreate a task already present in its supplied catalog', () => {
  const s = sample(); first(s).oracle.C1 = structuredClone(first(s).oracle.C3)
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 dormant flags and lifecycle transitions must agree with preceding gold states', () => {
  const s = sample(); first(s).oracle.C1.t2.dormant = true
  assert.equal(validateCorpus(s).structural_valid, false)
  const t = sample(); first(t).oracle.C1.t8.status_updates[0].from = 'completed'
  assert.equal(validateCorpus(t).structural_valid, false)
})

test('Gate 2 mechanical support success does not certify deliberately unreviewed semantic labels', () => {
  const r = validateCorpus(makeSupportedCorpusFixture())
  assert.equal(r.structural_valid, true, JSON.stringify(r.errors))
  assert.equal(r.state_opportunity_coverage_complete, true)
  assert.deepEqual(r.missing_coverage, [])
  assert.equal(r.conditions.C1.SM5.change, 4)
  assert.equal(r.conditions.C3.SM5.retain, 2)
  assert.equal(r.semantic_truth_verified, false)
  assert.equal(r.family_independence_verified, false)
  assert.equal(r.corpus_completeness_verified, false)
})

test('Gate 2 cannot count an old transition again by comparing nonadjacent snapshots', () => {
  const s = sample()
  first(s).state_opportunities = [{ condition: 'C1', theme: 'SM2', kind: 'change', task_id: A, previous_turn_id: 't1', turn_id: 't3' }]
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 duplicate state atoms cannot inflate frozen state support', () => {
  const s = sample(), memory = first(s).oracle.C1.t1.task_memory[0]
  memory.criteria.push(structuredClone(memory.criteria[0]))
  assert.equal(validateCorpus(s).structural_valid, false)
})

test('Gate 2 partially unresolved units cannot declare the same text both resolved and unresolved', () => {
  const s = sample(), d = first(s).oracle.C1.t1.decisions[0]
  d.actions.push({ op: 'UNRESOLVED' })
  d.unresolved = { reason: 'ambiguous_reference', candidate_task_ids: [], missing_evidence: 'test-only' }
  d.unresolved_scope_quotes = [...d.resolved_scope_quotes]
  assert.equal(validateCorpus(s).structural_valid, false)
})
