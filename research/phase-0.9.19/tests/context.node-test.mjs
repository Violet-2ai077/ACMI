import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInput } from '../context/build.mjs'
import { getFixture, validateFixture } from '../corpus/fixtures.mjs'

test('conditions expose only their allowed initial evidence', () => {
  const { publicScenario: s, oracle } = getFixture()
  assert.equal(validateFixture(s, oracle).valid, true)
  const a = buildInput(s, [], { condition: 'C1', arm: 'A', turnId: 't1' })
  assert.equal(a.catalog.length, 1)
  for (const condition of ['C2', 'C3']) {
    const p = buildInput(s, [], { condition, arm: 'B', turnId: 't1' })
    assert.equal('catalog' in p, false)
    assert.equal('active' in p, false)
    assert.equal(JSON.stringify(p).includes('HOST_ONLY_CANARY'), false)
    assert.equal(p.slots.length, 4)
    assert.equal('oracle' in p, false)
  }
})

test('raw history stays raw and never imports hidden projection', () => {
  const s = getFixture().publicScenario
  const h = [{ role: 'assistant', source_id: 'a1', content: 'my own marker', projection: 'HOST_ONLY_CANARY' }]
  const p = buildInput(s, h, { condition: 'C3', arm: 'A', turnId: 't2' })
  assert.equal(p.messages.find(x => x.source_id === 'a1').content, 'my own marker')
  assert.equal(JSON.stringify(p).includes('HOST_ONLY_CANARY'), false)
  assert.throws(() => buildInput({ ...s, oracle: {} }, [], { condition: 'C1', arm: 'A', turnId: 't1' }), /oracle/)
})

test('condition-specific birth and invisible historical identity are not interchangeable', () => {
  const f = getFixture()
  assert.equal(f.oracle.C1.t1.decisions[0].actions[0].op, 'CONTINUE')
  assert.equal(f.oracle.C3.t1.decisions[0].actions[0].op, 'CREATE')
  const missing = getFixture('identity-absent')
  assert.equal(missing.oracle.C3.t1.decisions[0].unresolved.reason, 'unknown_task')
  assert.equal(missing.oracle.C3.t1.identity_visibility, 'identity_absent')
})
