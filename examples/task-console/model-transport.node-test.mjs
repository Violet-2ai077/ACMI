import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createLoopbackCompletion } from './model-transport.mjs'

const response = () => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Next: verify amber.' } }],
  usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } })
const messages = [{ role: 'system', content: 'bounded context' }, { role: 'user', content: 'next?' }]

async function server(t, handler) {
  const instance = createServer(handler)
  instance.listen(0, '127.0.0.1')
  await once(instance, 'listening')
  t.after(async () => { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)) })
  return `http://127.0.0.1:${instance.address().port}/v1/chat/completions`
}

test('only literal loopback HTTP completion endpoints are accepted', () => {
  for (const endpoint of ['https://127.0.0.1/v1/chat/completions', 'http://localhost/v1/chat/completions',
    'http://example.com/v1/chat/completions', 'http://192.168.1.1/v1/chat/completions',
    'http://user:secret@127.0.0.1/v1/chat/completions', 'http://127.0.0.1/v1/chat/completions?secret=x',
    'http://127.0.0.1/v1/chat/completions#fragment', 'http://127.0.0.1/other']) {
    assert.throws(() => createLoopbackCompletion({ endpoint, model: 'local' }), /endpoint/i)
  }
  assert.equal(typeof createLoopbackCompletion({ endpoint: 'http://[::1]:8080/v1/chat/completions', model: 'local' }), 'function')
})

test('one bounded text request has no tools, retries or streaming', async t => {
  let calls = 0
  const endpoint = await server(t, async (req, res) => {
    calls++
    assert.equal(req.method, 'POST')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { model: 'local', messages, max_tokens: 512,
      temperature: 0, stream: false, cache_prompt: false })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(response()))
  })
  const complete = createLoopbackCompletion({ endpoint, model: 'local' })
  assert.deepEqual(await complete(messages, new AbortController().signal), {
    text: 'Next: verify amber.', usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
  })
  assert.equal(calls, 1)
})

test('redirects and HTTP errors fail once without exposing response content', async t => {
  for (const status of [302, 429, 500]) {
    let calls = 0
    const endpoint = await server(t, (_req, res) => {
      calls++; res.writeHead(status, { Location: 'http://example.com/secret' }); res.end('PRIVATE_RESPONSE')
    })
    await assert.rejects(createLoopbackCompletion({ endpoint, model: 'local' })(messages), error =>
      /HTTP/.test(error.message) && !error.message.includes('PRIVATE_RESPONSE'))
    assert.equal(calls, 1)
  }
})

test('malformed, non-text, empty, truncated, tool and invalid usage responses are rejected', async t => {
  const invalid = [
    x => { x.choices[0].finish_reason = 'length' },
    x => { x.choices[0].message.content = '' },
    x => { x.choices[0].message.content = [{ type: 'text', text: 'x' }] },
    x => { x.choices[0].message.role = 'tool' },
    x => { x.choices[0].message.tool_calls = [{ name: 'forbidden' }] },
    x => { x.choices[0].message.function_call = { name: 'forbidden' } },
    x => { x.choices[0].message.reasoning_content = 'hidden reasoning' },
    x => { x.usage.completion_tokens = 513; x.usage.total_tokens = 525 },
    x => { x.usage.prompt_tokens = -1 },
    x => { x.usage.completion_tokens = 1.5 },
    x => { x.usage.total_tokens = 999 },
    x => { delete x.usage },
    x => { x.choices.push(x.choices[0]) },
  ]
  for (const mutate of invalid) {
    const payload = response(); mutate(payload)
    const endpoint = await server(t, (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) })
    await assert.rejects(createLoopbackCompletion({ endpoint, model: 'local' })(messages), /response|usage/i)
  }
})

test('response byte budget, deadline and cancellation bound stalled requests', async t => {
  const huge = await server(t, (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('x'.repeat(2048)) })
  await assert.rejects(createLoopbackCompletion({ endpoint: huge, model: 'local', maxResponseBytes: 1024 })(messages), /budget/i)
  const stalled = await server(t, () => {})
  await assert.rejects(createLoopbackCompletion({ endpoint: stalled, model: 'local', timeoutMs: 30 })(messages), /timeout/i)
  const controller = new AbortController()
  const promise = createLoopbackCompletion({ endpoint: stalled, model: 'local' })(messages, controller.signal)
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
})

test('serialized request budget rejects before connecting', async t => {
  let calls = 0
  const endpoint = await server(t, (_req, res) => { calls++; res.end() })
  const complete = createLoopbackCompletion({ endpoint, model: 'local' })
  await assert.rejects(complete([{ role: 'system', content: 'x'.repeat(48 * 1024) }, messages[1]]), /request.*budget/i)
  // JSON escaping, rather than just source UTF-8 length, also consumes the wire budget.
  await assert.rejects(complete([{ role: 'system', content: '\u0001'.repeat(9000) }, messages[1]]), /request.*budget/i)
  assert.equal(calls, 0)
})

test('deadline remains active while an HTTP response body is incomplete', async t => {
  let calls = 0
  const endpoint = await server(t, (_req, res) => {
    calls++
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write('{"choices":[')
  })
  await assert.rejects(createLoopbackCompletion({ endpoint, model: 'local', timeoutMs: 30 })(messages), /timeout/i)
  assert.equal(calls, 1)
})
