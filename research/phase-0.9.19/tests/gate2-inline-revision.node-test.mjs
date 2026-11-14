import test from 'node:test'
import assert from 'node:assert/strict'
import { getFixture, predictionFor } from '../corpus/fixtures.mjs'
import { buildInput } from '../context/build.mjs'
import { encodeInline } from '../protocol/wire.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt } from '../evaluator/score.mjs'

const f = getFixture()
const packet = buildInput(f.publicScenario, [], { condition: 'C1', arm: 'B', turnId: 't1' })
const value = predictionFor(f, packet)
value.answer[0].text = ' \r\nResult 300: \u4f60\u597d \\ <|acmi:end|>\t '
const raw = encodeInline(value)
const boundary = raw.indexOf('<|acmi:answer:v1|>')
const profile = 'B-inline-v1-ws1'
let api
test('explicit revision API exists without modifying Gate 1', async () => {
  api = await import('../gate2/inline-profile.mjs').catch(() => ({}))
  assert.equal(typeof api.readGate2Raw, 'function')
})
const read = text => api.readGate2Raw(Buffer.from(text), { arm: 'B', inputPacket: packet, inlineProfile: profile })

test('bounded ASCII layout is accepted only at frame boundaries and raw payload is retained', () => {
  for (const ws of ['', ' ', '\t', '\r', '\n', '\r\n', ' '.repeat(1024)]) {
    for (const text of [ws + raw, raw + ws, raw.slice(0, boundary) + ws + raw.slice(boundary)]) {
      const r = read(text)
      assert.equal(r.valid, true, r.errors.join(','))
      assert.deepEqual(r.envelope, value)
      assert.equal(r.raw.toString(), text)
      assert.equal(r.arm, 'B')
    }
  }
  const spaced = '\n' + raw + '\n'
  assert.equal(readRaw(Buffer.from(spaced), { arm: 'B', inputPacket: packet }).valid, false)
  assert.equal(api.readGate2Raw(Buffer.from(spaced), { arm: 'B', inputPacket: packet }).valid, false)
  assert.throws(() => api.readGate2Raw(Buffer.from(raw), { arm: 'B', inputPacket: packet, inlineProfile: 'guess' }), /profile/)
})

test('invalid layouts, duplicate keys, truncated frames and semantic violations stay invalid', () => {
  for (const ws of [' '.repeat(1025), '\uFEFF', '\u00a0', '\u200b', '\u2028', '\v', '\f', '```', 'explanation']) {
    for (const text of [ws + raw, raw + ws, raw.slice(0, boundary) + ws + raw.slice(boundary)]) assert.equal(read(text).valid, false)
  }
  for (const text of [' \n', raw.slice(0, -1), raw + raw, raw.replace('"decision_id":', '"x":1,"x":2,"decision_id":')]) assert.equal(read(text).valid, false)
  for (const change of [v => { delete v.work_state.task_memory }, v => { v.work_state.turn_id = 'wrong' }, v => { v.work_state.decisions[0].evidence[0].source_id = 'invisible' }]) {
    const v = structuredClone(value); change(v)
    assert.equal(read('\n' + encodeInline(v)).valid, false)
  }
  const wrong = structuredClone(value)
  wrong.work_state.task_memory[0].criteria[0].state = 'satisfied'
  assert.equal(read(encodeInline(wrong)).workState.task_memory[0].criteria[0].state, 'satisfied')
})

test('every byte split shares final scanner and exact visible text, including escaped markers', () => {
  const bytes = Buffer.from('\r\n' + raw.slice(0, boundary) + '\t\n' + raw.slice(boundary) + '\r\n')
  for (let cut = 0; cut <= bytes.length; cut++) {
    const p = api.createInlineProfileParser({ inputPacket: packet, inlineProfile: profile })
    const events = [...p.push(bytes.subarray(0, cut)), ...p.push(bytes.subarray(cut))]
    const r = p.finish()
    assert.equal(r.valid, true, r.errors.join(','))
    assert.deepEqual(r.envelope, value)
    assert.equal(events.map(e => e.text).join(''), value.answer[0].text)
    assert.deepEqual(r.raw, bytes)
  }
  const p = api.createInlineProfileParser({ inputPacket: packet, inlineProfile: profile })
  for (const b of bytes) p.push(Buffer.from([b]))
  assert.equal(p.finish().valid, true)
  const invalid = api.createInlineProfileParser({ inputPacket: packet, inlineProfile: profile })
  invalid.push(Buffer.from(raw)); invalid.push(Buffer.from('x'))
  assert.equal(invalid.finish().valid, false)
})

test('unknown fields including prototype names cannot bypass the closed schema bridge', () => {
  for (const name of ['unexpected', 'constructor', '__proto__', 'toString']) {
    const v = structuredClone(value)
    Object.defineProperty(v.answer[0], name, { value: 'foreign', enumerable: true })
    assert.equal(read(encodeInline(v)).valid, false, name)
  }
})

test('layout acceptance cannot repair stale state, missing memory or false completion scores', () => {
  for (const change of [v => { v.work_state.task_memory = [] }, v => { v.work_state.task_memory[0].criteria[0].state = 'satisfied' }, v => { v.work_state.task_memory[0].work_items[0].state = 'completed' }]) {
    const v = structuredClone(value); change(v)
    const old = readRaw(Buffer.from(encodeInline(v)), { arm: 'B', inputPacket: packet })
    const revised = read('\r\n' + encodeInline(v) + '\t')
    const score = rawPrediction => scoreAttempt({ inputPacket: packet, oracle: f.oracle.C1.t1, attempt: { finish_reason: 'stop' }, rawPrediction })
    assert.equal(revised.valid, true)
    assert.deepEqual(score(revised), score(old))
    assert.equal(score(revised).state.snapshot_exact, false)
  }
})
