import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogs, inputs, launches, truth } from './design.mjs'
import { makeAnchorCase } from './controller.mjs'

const source = x => ({ sessionId: x.story, nativeUserId: 'native-' + x.story, sourceUserSeq: 1 })
const compose = x => makeAnchorCase(x, catalogs.get(x.id), launches.get(x.id))(source(x))
const runs = new Map(inputs.map(x => [x.id, compose(x)]))

test('zero-model replay: all 24 native-source paths use launch events, never gold', () => {
  for (const g of truth) {
    const { packet, receipt } = runs.get(g.id)
    assert.equal(receipt.status, g.anchorVerdict)
    assert.deepEqual(receipt.launchTarget, g.launchTarget)
    assert.deepEqual(receipt.effective, g.anchorEffective)
    assert.equal(Boolean(receipt.modelAnchorRef), Boolean(g.anchorEffective && receipt.arm === 'B'))
    if (g.anchorEffective) assert(!JSON.stringify(packet).includes(g.anchorEffective.taskId))
  }
  assert.equal([...runs.values()].filter(r => r.receipt.modelAnchorRef).length, 7)
  assert.deepEqual(runs.get('probe-01:B').receipt.effective, runs.get('probe-02:B').receipt.effective)
  assert.notEqual(runs.get('probe-01:B').receipt.request.sessionId, runs.get('probe-02:B').receipt.request.sessionId)
})

test('paired packet difference is only the verified anchor; five controls are byte-identical', () => {
  const data = p => JSON.parse(p.prompt.split('\nCatalog data: ')[1])
  let identical = 0
  for (const a of inputs.filter(x => x.arm === 'A')) {
    const pa = runs.get(a.id).packet, pb = runs.get(a.probe + ':B').packet
    assert.deepEqual(pa.schema, pb.schema)
    assert.equal(pa.focus, pb.focus)
    assert.equal(pa.prompt.split('\nCatalog data: ')[0], pb.prompt.split('\nCatalog data: ')[0])
    const { work_anchor, ...rest } = data(pb)
    assert.deepEqual(data(pa), rest)
    if (!work_anchor) {
      assert.deepEqual(pa, pb)
      identical++
    }
  }
  assert.equal(identical, 5)
})

test('a second native user event cannot inherit the first request anchor', () => {
  const x = inputs.find(r => r.id === 'probe-01:B')
  const build = makeAnchorCase(x, catalogs.get(x.id), launches.get(x.id))
  assert.equal(build(source(x)).receipt.status, 'accepted')
  const blocked = build({ ...source(x), nativeUserId: 'different-native-event' })
  assert.equal(blocked.receipt.status, 'native_user_mismatch')
  assert.equal(blocked.receipt.modelAnchorRef, null)
  assert.throws(() => build({ ...source(x), sessionId: 'other' }), /MISSING_NATIVE_SOURCE/u)
})
