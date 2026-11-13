import assert from 'node:assert/strict'
import test from 'node:test'
import { assertMissing, assertRecovered, fakeComplete, fixture } from './derived-fixture.mjs'

test('derived gate is answer-free and requires the derived command, not copied settings', () => {
  assert.doesNotMatch(fixture.resume, /CEDAR-47|4317|4318|PLUM-92|9821/u)
  const text = fixture.a.prompt
  const good = { answer: 'serve --name CEDAR-47 --port 4318',
    context: { text, bytes: Buffer.byteLength(text), sources: [{}], window: 'latest-64-facts' } }
  assertRecovered(good)
  assert.throws(() => assertRecovered({ ...good, answer: 'serve --name CEDAR-47 --port 4317' }))
  assert.throws(() => assertRecovered({ ...good, answer: 'Use CEDAR-47 on port 4318.' }))
  assert.throws(() => assertRecovered({ ...good, answer: 'serve --name PLUM-92 --port 9822' }))
})

test('same derived prompt yields strict missing-context control without history', async () => {
  const result = await fakeComplete([{ role: 'user', content: fixture.resume }], new AbortController().signal)
  assertMissing({ answer: result.text, context: { text: '{}', sources: [] } })
  assert.throws(() => assertMissing({ answer: 'MISSING_CONTEXT', context: { text: '{}', sources: [{}] } }))
  assert.throws(() => assertMissing({ answer: 'serve --name CEDAR-47 --port 4318', context: { text: '{}', sources: [] } }))
})
