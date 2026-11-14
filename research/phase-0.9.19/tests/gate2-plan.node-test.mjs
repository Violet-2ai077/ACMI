import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlan, CATEGORIES } from '../gate2/plan.mjs'

export function manifest() {
  return { split: 'dev', seed: 'predeclared-seed', families: CATEGORIES.map((category, i) => ({
    id: `family-${i}`, category, recovery: ['none', 'same-session', 'handoff'][i % 3],
    turns: Array.from({ length: 8 }, (_, j) => ({ id: `t${j + 1}`, difficulty: j < 2 ? 'simple' : j < 4 ? 'medium' : 'hard' })),
    probes: ['t2', 't8']
  })) }
}

test('Gate 2 schedule has exact proposal counts and preserves independent conversations', () => {
  const m = manifest(), plan = createPlan(m)
  assert.deepEqual(plan.counts, { total: 576, closed_loop: 432, replay: 72, diagnostic: 72, by_condition: { C1: 192, C2: 192, C3: 192 } })
  assert.equal(plan.blocks.length, 162)
  assert.equal(new Set(plan.blocks.map(b => b.id)).size, 162)
  assert.equal(plan.coverage.length, 18)
  for (const b of plan.blocks) {
    if (b.track === 'CLOSED-LOOP') assert.deepEqual(b.calls.map(c => c.turn_id), m.families[0].turns.map(t => t.id))
    if (b.arm === 'D') assert.deepEqual(b.calls.map(c => c.stage), ['answer', 'marker'])
  }
  assert.deepEqual(createPlan(m), plan)
  assert.notDeepEqual(createPlan({ ...m, seed: 'different' }).blocks.map(b => b.id), plan.blocks.map(b => b.id))
})

test('Gate 2 plan rejects malformed, duplicated, non-development or incomplete manifests', () => {
  for (const mutate of [m => { m.split = 'validation' }, m => { m.families.pop() },
    m => { m.families[0].probes = ['t2', 't2'] }, m => { m.families[0].probes[0] = 'missing' },
    m => { m.families[0].turns[0].id = 't2' }, m => { m.families[0].turns[0].difficulty = 'hard' },
    m => { m.families[0].id = m.families[1].id }, m => { m.families[0].category = m.families[1].category },
    m => { m.families[0].recovery = 'handoff' }, m => { m.seed = '' }]) {
    const m = manifest(); mutate(m); assert.throws(() => createPlan(m), /manifest/)
  }
})
