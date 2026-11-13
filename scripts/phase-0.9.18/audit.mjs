import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function journals(directory) {
  const found = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) found.push(...await journals(path))
    else if (item.isFile() && item.name.endsWith('.jsonl')) found.push(path)
  }
  return found
}

export async function auditNative(directory) {
  const json = async name => JSON.parse(await readFile(join(directory, name), 'utf8'))
  const seed = await json('seed.json'), reopen = await json('reopen.json')
  const { fixture } = await import(seed.gate === 'derived' ? './derived-fixture.mjs' : './fixture.mjs')
  const completions = (await readFile(join(directory, 'completions.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  const files = await journals(join(directory, 'journal'))
  assert.equal(files.length, seed.gate === 'derived' ? 4 : 3, 'Exactly one native Session per model request')
  const logs = new Map()
  for (const file of files) {
    const rows = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse)
    logs.set(rows[0].id, rows)
  }
  const expected = [
    [seed.initial.session.sessionId, fixture.a.prompt, seed.turns[0]],
    [seed.bindB.receipt.session.sessionId, fixture.b.prompt, seed.turns[1]],
    [reopen.initial.session.sessionId, fixture.resume, reopen.turns[0]],
  ]
  if (seed.gate === 'derived') expected.push([reopen.bindControl.receipt.session.sessionId, fixture.resume, reopen.turns[1]])
  const summaries = []
  for (const [index, [sessionId, prompt, result]] of expected.entries()) {
    const rows = logs.get(sessionId)
    assert.ok(rows)
    const users = rows.filter(row => row.type === 'user/message')
    const assistants = rows.filter(row => row.type === 'assistant/message')
    const endings = rows.filter(row => row.type === 'turn/end')
    assert.equal(users.length, 1)
    assert.equal(assistants.length, 1)
    assert.equal(endings.length, 1)
    assert.equal(endings[0].data.reason.kind, 'completed')
    assert.equal(users[0].data.content.map(block => block.text).join(''), prompt)
    assert.equal(assistants[0].data.message.content.map(block => block.text).join(''), result.answer)
    assert.equal(assistants[0].data.usage.inputTokens, completions[index].result.usage.inputTokens)
    assert.equal(assistants[0].data.usage.outputTokens, completions[index].result.usage.outputTokens)
    assert.ok(assistants[0].data.usage.outputTokens <= 512)
    assert.equal(result.context.sha256, createHash('sha256').update(result.context.text).digest('hex'))
    summaries.push({ sessionId, userSeq: users[0].seq, assistantSeq: assistants[0].seq,
      reason: endings[0].data.reason.kind, usage: assistants[0].data.usage })
  }
  const context = JSON.parse(reopen.turns[0].context.text)
  for (const evidence of context.evidence) {
    assert.equal(evidence.session.sessionId, seed.initial.session.sessionId)
    const row = logs.get(evidence.session.sessionId).find(item => item.seq === evidence.localSeq)
    assert.ok(row, 'Every historical coordinate resolves to an actual native event')
    assert.ok(['user/message', 'assistant/message'].includes(row.type))
    const message = row.type === 'user/message' ? row.data : row.data.message
    assert.equal(message.content.map(block => block.text).join(''), evidence.text)
  }
  return { passed: true, sessions: summaries, historicalCoordinates: context.evidence.length }
}
