import { CATEGORIES } from '../../gate2/plan.mjs'
import { getFixture, A, B, C } from '../../corpus/fixtures.mjs'

// Repeated engineering vectors exercise structure, not independent research scenarios.
export function makeCorpusFixture() {
  const publicFamilies = [], oracleFamilies = [], planned = []
  for (const [i, category] of CATEGORIES.entries()) {
    const f = getFixture(`engineering-${i}`), s = f.publicScenario
    for (const condition of ['C1', 'C2', 'C3']) f.oracle[condition].t3.changed = true
    const recovery = ['none', 'same-session', 'handoff'][i % 3]
    for (const t of s.turns) { t.category = category; t.agent_id = 'agent1'; t.session_id = recovery === 'handoff' && Number(t.turn_id.slice(1)) > 4 ? 's2' : 's1' }
    s.reference_history = Object.fromEntries(['C1', 'C2', 'C3'].map(condition => [condition, s.turns.map(t => ({ turn_id: t.turn_id, source_id: `a${t.turn_id.slice(1)}`, role: 'assistant', content: 'Engineering reference only.' }))]))
    publicFamilies.push(s)
    oracleFamilies.push({ family_id: s.family_id, canonical_tasks: [A, B, C].map(task_id => ({ task_id, objective: 'Engineering fixture only', acceptance: ['fixture'], initial_status: 'planned' })),
      oracle: f.oracle, state_opportunities: [], recovery_points: recovery === 'none' ? [] : [{ turn_id: 't5', kind: recovery }] })
    planned.push({ id: s.family_id, category, recovery, turns: s.turns.map(t => ({ id: t.turn_id, difficulty: t.difficulty })), probes: ['t2', 't8'] })
  }
  return { planManifest: { split: 'dev', seed: 'engineering-only', families: planned },
    publicCorpus: { version: 'gate2-public-corpus-v1', split: 'dev', families: publicFamilies },
    oracleCorpus: { version: 'gate2-oracle-corpus-v1', split: 'dev', families: oracleFamilies } }
}

// Deliberately artificial support vectors; some narrative/state pairs disagree.
// A positive structural result must NOT certify semantic truth or independence.
export function makeSupportedCorpusFixture() {
  const data = makeCorpusFixture()
  for (const [i, f] of data.oracleCorpus.families.entries()) for (const condition of ['C1', 'C2', 'C3']) {
    if (i >= 4) {
      f.oracle[condition].t8.task_memory = structuredClone(f.oracle[condition].t7.task_memory)
      f.oracle[condition].t8.status_updates = []; f.oracle[condition].t8.changed = false
    }
    const add = (theme, kind, task_id, previous_turn_id, turn_id, extra = {}) => f.state_opportunities.push({ condition, theme, kind, task_id, previous_turn_id, turn_id, ...extra })
    add('SM1', 'change', B, 't4', 't5'); add('SM1', 'retain', B, 't3', 't4')
    add('SM2', 'change', A, 't1', 't2'); add('SM2', 'retain', A, 't2', 't3')
    add('SM3', 'change', A, 't1', 't2'); add('SM3', 'retain', A, 't2', 't3')
    if (i < 4) add('SM4', 'change', A, 't7', 't8')
    add('SM4', 'retain', A, 't2', 't3')
    add('SM5', i < 4 ? 'change' : 'retain', A, 't7', 't8', { last_active_turn_id: 't2' })
    add('SM6', 'change', A, 't5', 't6'); add('SM6', 'retain', A, 't2', 't3')
  }
  return data
}
