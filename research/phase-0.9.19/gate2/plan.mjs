import { hash } from '../protocol/contracts.mjs'

export const CATEGORIES = ['continuity', 'switching', 'parallel', 'creation', 'branch-merge', 'ambiguity']
const CONDITIONS = ['C1', 'C2', 'C3']
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
const unique = values => new Set(values).size === values.length

export function createPlan(manifest) {
  const fail = () => { throw new Error('invalid development manifest') }
  if (!manifest || manifest.split !== 'dev' || !id(manifest.seed) || !Array.isArray(manifest.families) || manifest.families.length !== 6) fail()
  const families = manifest.families
  if (families.some(f => !f || !id(f.id)) || !unique(families.map(f => f.id))) fail()
  if (!unique(families.map(f => f.category)) || families.some(f => !CATEGORIES.includes(f.category))) fail()
  for (const recovery of ['none', 'same-session', 'handoff']) if (families.filter(f => f.recovery === recovery).length !== 2) fail()
  const blocks = [], coverage = []
  for (const f of families) {
    if (!Array.isArray(f.turns) || f.turns.length !== 8 || f.turns.some(t => !t || !id(t.id)) || !unique(f.turns.map(t => t.id))) fail()
    for (const [difficulty, expected] of [['simple', 2], ['medium', 2], ['hard', 4]]) {
      const turns = f.turns.filter(t => t.difficulty === difficulty).length
      if (turns !== expected) fail()
      coverage.push({ category: f.category, difficulty, independent_families: 1, turns })
    }
    if (!Array.isArray(f.probes) || f.probes.length !== 2 || !unique(f.probes) || f.probes.some(p => !f.turns.some(t => t.id === p))) fail()
    const add = (condition, arm, track, turns, stages) => {
      const key = [f.id, condition, arm, track, ...turns].join(':')
      blocks.push({ id: hash(key), family_id: f.id, condition, arm, track, recovery: f.recovery,
        calls: turns.flatMap(turn_id => stages.map(stage => ({ turn_id, stage }))) })
    }
    for (const condition of CONDITIONS) {
      for (const arm of ['A', 'B', 'C0']) add(condition, arm, 'CLOSED-LOOP', f.turns.map(t => t.id), ['single'])
      for (const probe of f.probes) {
        for (const arm of ['A', 'B']) add(condition, arm, 'FROZEN-REPLAY', [probe], ['single'])
        add(condition, 'D', 'FROZEN-REPLAY', [probe], ['answer', 'marker'])
      }
    }
  }
  // Randomize whole independent blocks, never the history within a conversation or D pair.
  const rank = b => hash([manifest.seed, b.id])
  blocks.sort((a, b) => rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : a.id < b.id ? -1 : 1)
  const count = predicate => blocks.filter(predicate).reduce((n, b) => n + b.calls.length, 0)
  return { version: 'gate2-plan-v1', split: 'dev', exploratory_only: true, manifest_hash: hash(manifest),
    counts: { total: count(() => true), closed_loop: count(b => b.track === 'CLOSED-LOOP'),
      replay: count(b => b.track === 'FROZEN-REPLAY' && b.arm !== 'D'), diagnostic: count(b => b.arm === 'D'),
      by_condition: Object.fromEntries(CONDITIONS.map(c => [c, count(b => b.condition === c)])) },
    coverage, blocks }
}
