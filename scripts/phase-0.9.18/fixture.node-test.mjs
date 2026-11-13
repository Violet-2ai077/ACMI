import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRecovered, fakeComplete, fixture } from './fixture.mjs'

test('continuation prompt does not supply the answer; fake transport reads only request text', async () => {
  assert.doesNotMatch(fixture.resume, /CEDAR-47|4317|PLUM-92|9821/u)
  const signal = new AbortController().signal
  const result = await fakeComplete([{ role: 'user', content: fixture.b.prompt }], signal)
  assert.match(result.text, /PLUM-92.*9821/u)
  await assert.rejects(fakeComplete([{ role: 'user', content: fixture.resume }], signal))
})

test('semantic gate rejects missing facts and distractor contamination', () => {
  const text = fixture.a.prompt
  const good = { answer: 'Start CEDAR-47 on port 4317.',
    context: { text, bytes: Buffer.byteLength(text), sources: [{}], window: 'latest-64-facts' } }
  assertRecovered(good)
  assert.throws(() => assertRecovered({ ...good, answer: 'Start CEDAR-47.' }))
  assert.throws(() => assertRecovered({ ...good, answer: good.answer + ' PLUM-92' }))
  assert.throws(() => assertRecovered({ ...good, context: { ...good.context, text: text + ' 9821' } }))
})
