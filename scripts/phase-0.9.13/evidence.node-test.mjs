import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogs, evidenceWire, frozen, inputs } from './design.mjs'
import { literalMentions } from './evidence.mjs'

const a = { ref: 'q-0abcd', task: 'Fern (Print)' }
const b = { ref: 'q-1abcd', task: 'Fern (Print)' }

test('UTF-16 slices retain exact case, punctuation and astral offsets', () => {
  const text = '🌱 “FERN (Print)” and Fern (Print).'
  const hits = literalMentions(text, [a])
  assert.equal(hits.length, 2)
  assert.equal(hits[0].start_utf16, 4)
  for (const hit of hits) assert.equal(text.slice(hit.start_utf16, hit.end_utf16), hit.quote)
})

test('boundaries, duplicate titles, negated and quoted mentions remain observations only', () => {
  assert.deepEqual(literalMentions('XFern (Print) Fern (Print)s', [a]), [])
  const hits = literalMentions('Do not execute "Fern (Print)".', [a, b])
  assert.deepEqual(hits.map(x => x.ref), [a.ref, b.ref])
  assert.equal(hits[0].start_utf16, hits[1].start_utf16)
  assert.equal(hits[0].quote, hits[1].quote)
  assert(hits.every(x => !Object.hasOwn(x, 'assignment')))
  assert.throws(() => literalMentions(a.task, [a, a]), /INVALID/u)
  assert.throws(() => literalMentions((a.task + ' ').repeat(25), [a]), /OUTPUT_LIMIT/u)
})

const catalog = packet => JSON.parse(packet.prompt.split('\nCatalog data: ')[1])
test('three arms freeze the same schema, context and refs except the assigned treatment', () => {
  assert.equal(frozen.inputs, '61741f0cbd959e861900b1aa12814ccc375bccdd157cae4ead5f645d11019d9c')
  assert.equal(inputs.length, 24)
  for (const a0 of inputs.filter(x => x.arm === 'A')) {
    const b0 = inputs.find(x => x.probe === a0.probe && x.arm === 'B')
    const c0 = inputs.find(x => x.probe === a0.probe && x.arm === 'C')
    const [pa, pb, pc] = [a0, b0, c0].map(x => evidenceWire(x, null))
    assert.deepEqual(pa.schema, pb.schema)
    assert.deepEqual(pb.schema, pc.schema)
    assert.equal(pa.focus, pb.focus)
    assert.equal(pb.focus, pc.focus)
    const ca = catalog(pa), cb = catalog(pb), cc = catalog(pc)
    assert.equal(ca.current_binding_hint, cb.current_binding_hint)
    assert(!Object.hasOwn(cc, 'current_binding_hint'))
    const { current_binding_hint, ...bWithoutBinding } = cb
    assert.deepEqual(cc, bWithoutBinding)
    assert.deepEqual(ca.candidates, cb.candidates)
    assert(!Object.hasOwn(ca, 'verified_mentions'))
    for (const mention of cb.verified_mentions) {
      assert.equal(pb.focus.slice(mention.start_utf16, mention.end_utf16), mention.quote)
    }
    for (const value of Object.values(catalogs.get(c0.id).links)) assert(!JSON.stringify(pc).includes(value.taskId))
  }
})
