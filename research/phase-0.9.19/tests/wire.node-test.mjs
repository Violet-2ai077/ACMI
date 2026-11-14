import test from 'node:test'
import assert from 'node:assert/strict'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { createWireParser, encodeInline } from '../protocol/wire.mjs'

const f = getFixture()
const p = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'A', turnId: 't1' })
const value = predictionFor(f, p)
value.answer[0].text = 'Result 300: 你好 \\ quote " <|acmi:end|>'
export function parse(raw, arm = 'A', cuts = []) {
  const parser = createWireParser({ arm, inputPacket: p })
  const bytes = Buffer.from(raw)
  let at = 0
  const events = []
  for (const cut of [...cuts, bytes.length]) { events.push(...parser.push(bytes.subarray(at, cut))); at = cut }
  return { result: parser.finish(), events }
}

test('A/B normalize identically and stream only visible text across every byte boundary', () => {
  for (const arm of ['A', 'B']) {
    const raw = arm === 'A' ? JSON.stringify(value) : encodeInline(value)
    for (let cut = 1; cut < Buffer.byteLength(raw); cut++) {
      const { result, events } = parse(raw, arm, [cut])
      assert.equal(result.valid, true, result.errors.join(','))
      assert.deepEqual(result.workState, value.work_state)
      assert.equal(events.map(e => e.text).join(''), value.answer[0].text)
    }
    const bytes = Buffer.byteLength(raw)
    assert.equal(parse(raw, arm, Array.from({ length: bytes }, (_, i) => i)).result.valid, true)
    let seed = 1919
    const cuts = []
    for (let at = 0; at < bytes;) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      at = Math.min(bytes, at + 1 + seed % 37)
      cuts.push(at)
    }
    assert.equal(parse(raw, arm, cuts).result.valid, true)
  }
})

test('prefix delivers text before marker completion without inventing closing bytes', () => {
  const raw = JSON.stringify(value)
  const cut = raw.indexOf('work_state')
  const parser = createWireParser({ arm: 'A', inputPacket: p })
  assert.equal(parser.push(Buffer.from(raw.slice(0, cut))).map(e => e.text).join(''), value.answer[0].text)
  const r = parser.finish()
  assert.equal(r.valid, false)
  assert.equal(r.raw.toString(), raw.slice(0, cut))
})

test('duplicate keys, missing memory, invalid refs and extra inline commits fail closed', () => {
  assert.equal(parse(JSON.stringify(value).replace('"answer":', '"x":0,"x":1,"answer":')).result.valid, false)
  const bad = structuredClone(value)
  delete bad.work_state.task_memory
  assert.equal(parse(JSON.stringify(bad)).result.valid, false)
  const refs = structuredClone(value)
  refs.work_state.decisions[0].evidence[0].source_id = 'not-visible'
  assert.equal(parse(JSON.stringify(refs)).result.valid, false)
  const raw = encodeInline(value)
  assert.equal(parse(raw + raw, 'B').result.valid, false)
  assert.equal(parse(raw.slice(0, -1), 'B').result.valid, false)
})

test('semantically wrong but structurally valid state is retained, not repaired', () => {
  const v = structuredClone(value)
  v.work_state.task_memory[0].criteria[0].state = 'satisfied'
  const r = parse(JSON.stringify(v)).result
  assert.equal(r.valid, true)
  assert.equal(r.workState.task_memory[0].criteria[0].state, 'satisfied')
})
