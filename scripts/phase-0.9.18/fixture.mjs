import assert from 'node:assert/strict'

export const fixture = Object.freeze({
  a: Object.freeze({ objective: 'Prepare the primary launch', criteria: ['Recover the recorded launch settings'],
    prompt: 'Record this synthetic launch decision for later: codename CEDAR-47, local service port 4317. Acknowledge the decision in one sentence.' }),
  b: Object.freeze({ objective: 'Prepare a separate secondary launch', criteria: ['Keep this launch separate'],
    prompt: 'Record this separate synthetic launch decision for later: codename PLUM-92, local service port 9821. Acknowledge the decision in one sentence.' }),
  resume: 'What is the next concrete launch step for the selected task? State its previously recorded codename and local service port. Use only its historical record; do not invent missing settings.',
})

export function assertRecovered(result) {
  assert.match(result.context.text, /CEDAR-47/u)
  assert.match(result.context.text, /4317/u)
  assert.doesNotMatch(result.context.text, /PLUM-92|9821/u)
  assert.equal(result.context.bytes, Buffer.byteLength(result.context.text))
  assert.equal(result.context.window, 'latest-64-facts')
  assert.ok(result.context.sources.length > 0)
  assert.match(result.answer, /CEDAR-47/u)
  assert.match(result.answer, /\b4317\b/u)
  assert.doesNotMatch(result.answer, /PLUM-92|9821/u)
  assert.doesNotMatch(fixture.resume, /CEDAR-47|4317|PLUM-92|9821/u)
}

export async function fakeComplete(messages, signal) {
  signal.throwIfAborted()
  const text = messages.map(message => message.content).join('\n')
  const match = /codename ([A-Z]+-\d+), local service port (\d+)/u.exec(text)
  assert.ok(match, 'The fake transport must recover values from actual request text')
  return { text: `Start launch ${match[1]} on local service port ${match[2]}.`,
    usage: { inputTokens: 100, outputTokens: 16 } }
}
