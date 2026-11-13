import assert from 'node:assert/strict'
import { fixture as retrievalFixture } from './fixture.mjs'

// Frozen before real derived-action execution; independent of the retrieval gate.
export const fixture = Object.freeze({
  a: retrievalFixture.a,
  b: retrievalFixture.b,
  resume: "Using only the selected task's historical record, derive the next launch command. Set --name to the recorded codename and --port to the recorded local service port plus one. Reply with exactly one line: serve --name <saved-codename> --port <saved-port-plus-one>. If either recorded value is missing, reply with exactly MISSING_CONTEXT instead. Do not guess or use another task's settings.",
})

export function assertRecovered(result) {
  assert.equal(result.answer.trim(), 'serve --name CEDAR-47 --port 4318')
  assert.match(result.context.text, /CEDAR-47/u)
  assert.match(result.context.text, /\b4317\b/u)
  assert.doesNotMatch(result.context.text, /PLUM-92|9821/u)
  assert.equal(result.context.bytes, Buffer.byteLength(result.context.text))
  assert.equal(result.context.window, 'latest-64-facts')
  assert.ok(result.context.sources.length > 0)
  assert.doesNotMatch(fixture.resume, /CEDAR-47|4317|4318|PLUM-92|9821/u)
}

export function assertMissing(result) {
  assert.equal(result.answer.trim(), 'MISSING_CONTEXT')
  assert.equal(result.context.sources.length, 0)
  assert.doesNotMatch(result.context.text, /CEDAR-47|4317|4318|PLUM-92|9821/u)
}

export async function fakeComplete(messages, signal) {
  signal.throwIfAborted()
  const text = messages.map(message => message.content).join('\n')
  const match = /codename ([A-Z]+-\d+), local service port (\d+)/u.exec(text)
  const derived = messages.at(-1).content === fixture.resume
  return { text: derived
    ? match ? `serve --name ${match[1]} --port ${Number(match[2]) + 1}` : 'MISSING_CONTEXT'
    : `Recorded ${match[1]} on local service port ${match[2]}.`,
  usage: { inputTokens: 100, outputTokens: 16 } }
}
