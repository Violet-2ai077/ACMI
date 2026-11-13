import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { openModelRuntime } from './model-runtime.mjs'

const options = { endpoint: 'http://127.0.0.1:8080/v1/chat/completions', model: 'fixture' }
const result = { text: 'Inspect amber checkpoint.', usage: { inputTokens: 24, outputTokens: 5, totalTokens: 29 } }
const signal = () => new AbortController().signal
const request = (authorize = () => {}) => ({ prompt: 'What should happen next?',
  context: JSON.stringify({ objective: 'Complete amber', facts: ['amber checkpoint: 17'] }), authorize })

async function fixture(t, complete) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-model-native-')))
  const roots = { workspaceRoot: join(base, 'workspace'), journalRoot: join(base, 'journal'), graphRoot: join(base, 'graph'), compression: 'none' }
  for (const path of [roots.workspaceRoot, roots.journalRoot, roots.graphRoot]) await mkdir(path)
  const runtime = await openModelRuntime(roots, { ...options, complete })
  t.after(async () => { await runtime.dispose(); await rm(base, { recursive: true, force: true }) })
  return { runtime, session: await runtime.createSession(signal()) }
}

test('fresh native Agent loop emits actual prompt, assistant, usage and completed turn once', async t => {
  const order = [], calls = []
  const { runtime, session } = await fixture(t, async (messages, providerSignal) => {
    order.push('complete'); calls.push(messages); assert.equal(providerSignal.aborted, false); return result
  })
  const input = request(() => order.push('authorize'))
  assert.equal(await runtime.runModel(session, input, signal()), result.text)
  assert.deepEqual(order, ['authorize', 'authorize', 'complete', 'authorize'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].role, 'system')
  assert.ok(calls[0][0].content.includes(input.context))
  assert.deepEqual(calls[0][1], { role: 'user', content: input.prompt })
  const events = session.snapshotEvents()
  assert.equal(events.filter(e => e.type === 'user/message').length, 1)
  assert.equal(events.find(e => e.type === 'user/message').data.content[0].text, input.prompt)
  const assistant = events.filter(e => e.type === 'assistant/message')
  assert.equal(assistant.length, 1)
  assert.deepEqual(assistant[0].data.message.content, [{ type: 'text', text: result.text }])
  assert.deepEqual(assistant[0].data.usage, result.usage)
  assert.equal(events.findLast(e => e.type === 'turn/end').data.reason.kind, 'completed')
  assert.ok(!events.some(e => e.type === 'tool/call' || e.type === 'tool/result'))
  assert.ok(!JSON.stringify(events).includes('amber checkpoint: 17'), 'historical context is not persisted as native prompt history')
  assert.equal(runtime.isIdle(session), true)
  await assert.rejects(runtime.runModel(session, input, signal()), /fresh/i)
  assert.equal(calls.length, 1)
})

test('existing native history never enters a provider request', async t => {
  let calls = 0
  const { runtime, session } = await fixture(t, async () => { calls++; return result })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'FOREIGN_HISTORY' }] }), { surfaceOp: 'append' })
  await assert.rejects(runtime.runModel(session, request(), signal()), /fresh/i)
  assert.equal(calls, 0)
})

test('authorization rejection before send and after response never emits assistant text', async t => {
  for (const rejectAt of [1, 2, 3]) {
    let calls = 0, checks = 0
    const { runtime, session } = await fixture(t, async () => { calls++; return result })
    await assert.rejects(runtime.runModel(session, request(() => {
      if (++checks === rejectAt) throw new Error('Authorization revoked')
    }), signal()), /Authorization revoked/)
    assert.equal(calls, rejectAt === 3 ? 1 : 0)
    assert.ok(!session.snapshotEvents().some(e => e.type === 'assistant/message'))
    assert.equal(runtime.isIdle(session), true)
  }
})

test('cancellation drains native turn even when injected completion ignores its signal', async t => {
  const controller = new AbortController()
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const { runtime, session } = await fixture(t, async () => { entered(); return new Promise(() => {}) })
  const running = runtime.runModel(session, request(), controller.signal)
  await started
  controller.abort()
  await assert.rejects(running, { name: 'AbortError' })
  assert.equal(runtime.isIdle(session), true)
  assert.ok(session.snapshotEvents().some(e => e.type === 'turn/end'))
  assert.ok(!session.snapshotEvents().some(e => e.type === 'assistant/message'))
  await runtime.closeSession(session, signal())
})

test('failed or invalid completion never retries and native turn settles', async t => {
  for (const complete of [async () => { throw new Error('Transport failed') }, async () => ({ text: 'x', usage: { inputTokens: 1, outputTokens: 513 } })]) {
    let calls = 0
    const { runtime, session } = await fixture(t, async (...args) => { calls++; return complete(...args) })
    await assert.rejects(runtime.runModel(session, request(), signal()))
    assert.equal(calls, 1)
    assert.equal(runtime.isIdle(session), true)
    assert.ok(!session.snapshotEvents().some(e => e.type === 'assistant/message'))
  }
})

test('runtime disposal cancels and drains a pending native request', async t => {
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const { runtime, session } = await fixture(t, async () => { entered(); return new Promise(() => {}) })
  const running = runtime.runModel(session, request(), signal())
  const rejected = assert.rejects(running)
  await started
  await runtime.dispose()
  await rejected
  assert.ok(session.snapshotEvents().some(e => e.type === 'turn/end'))
})
