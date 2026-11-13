import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readInput } from '../console.mjs'
import { runModelCommands } from '../model-console.mjs'
import { parseModelOptions } from '../model-run.mjs'

const taskId = '11111111-1111-4111-8111-111111111111'
const modelOptions = { endpoint: 'http://127.0.0.1:8080/v1/chat/completions', model: 'synthetic-test' }
const args = ['--workspace', 'W', '--journal', 'J', '--graph', 'G', '--endpoint', modelOptions.endpoint, '--model', modelOptions.model]
const entry = fileURLToPath(new URL('../model-run.mjs', import.meta.url))

test('model CLI requires explicit roots, loopback endpoint, and model', () => {
  assert.deepEqual(parseModelOptions(args), { roots: { workspaceRoot: 'W', journalRoot: 'J', graphRoot: 'G', compression: 'none' },
    modelOptions, init: false, help: false })
  assert.equal(parseModelOptions([...args, '--init', '--compression', 'zstd']).init, true)
  assert.equal(parseModelOptions(['--help']).help, true)
  for (const bad of [[], args.slice(0, -2), [...args, '--unknown'], [...args, '--compression', 'gzip'],
    args.map(value => value === modelOptions.endpoint ? 'https://example.org/v1/chat/completions' : value),
    args.map(value => value === modelOptions.endpoint ? 'http://127.0.0.1:8080/wrong' : value)]) {
    assert.throws(() => parseModelOptions(bad), error => error.code === 'invalid_arguments')
  }
})

test('CLI help is usable without initializing or opening a runtime', () => {
  const result = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--endpoint/)
})

test('CLI EOF never initializes', () => {
  const result = spawnSync(process.execPath, [entry, ...args, '--init'], { input: '', encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /cancelled.*initialize/)
  assert.doesNotMatch(result.stdout, /startup/)
})

function fixture() {
  const calls = [], output = []
  let sessionNumber = 1, bound = true, preview
  const host = {
    async status() { return { session: { sessionId: `session-${sessionNumber}`, incarnation: '0' },
      binding: { taskId: bound ? taskId : null }, recovery: 'ready' } },
    async modelTurn(prompt, options, signal) {
      calls.push({ prompt, options, aborted: signal.aborted })
      return { answer: 'Synthetic answer', context: { text: 'private history', bytes: 15, sha256: 'digest', sources: [], window: { limit: 64 } }, next: 4 }
    },
    async newSession() { sessionNumber++; bound = false; return (await host.status()).session },
    async preview(command) { preview = command; return { token: 'token', command } },
    async confirm(token, yes) { if (!yes) return; if (preview.kind === 'continue') bound = true; return { taskId } },
    async history() { return { events: [] } },
  }
  return { host, calls, output }
}

async function run(lines, setup = () => {}) {
  const f = fixture(), controller = new AbortController(), prompts = []
  setup(f, controller)
  const ask = async (prompt, fresh) => { prompts.push({ prompt, fresh }); return lines.shift() }
  await runModelCommands(f.host, ask, controller.signal, modelOptions, (label, value) => f.output.push({ label, value }))
  return { ...f, prompts }
}

test('ask discloses destination and budget then requires exact fresh yes', async () => {
  const result = await run(['ask What next?', 'yes', 'exit'])
  assert.deepEqual(result.calls, [{ prompt: 'What next?', options: { maxContextBytes: 16384 }, aborted: false }])
  assert.equal(result.prompts.find(item => item.fresh)?.fresh, true)
  assert.deepEqual(result.output.find(item => item.label === 'model-preview').value, {
    endpoint: modelOptions.endpoint, model: modelOptions.model, taskId, maxContextBytes: 16384,
    historyWindow: 'latest 64 assigned facts; overflow fails, never silently truncates', prompt: 'What next?',
  })
  assert.doesNotMatch(JSON.stringify(result.output), /private history/)
  assert.ok(result.output.some(item => item.label === 'answer'))
})

test('declined, EOF, or aborted confirmation does not invoke model', async () => {
  for (const confirmation of ['YES', ' yes', '', undefined]) {
    const result = await run(['ask Next?', confirmation, 'exit'])
    assert.equal(result.calls.length, 0)
  }
  const f = fixture(), controller = new AbortController()
  let reads = 0
  await runModelCommands(f.host, async () => { if (++reads === 1) return 'ask Next?'; controller.abort(); return 'yes' },
    controller.signal, modelOptions, () => {})
  assert.equal(f.calls.length, 0)
})

test('each executed ask requires a new Session and confirmed explicit binding', async () => {
  const result = await run(['ask First?', 'yes', 'ask Second?', 'session new', 'ask Unbound?',
    `continue ${taskId}`, 'yes', 'ask Third?', 'yes', 'exit'])
  assert.deepEqual(result.calls.map(call => call.prompt), ['First?', 'Third?'])
  assert.ok(result.output.some(item => item.value.code === 'fresh_session_required'))
  assert.ok(result.output.some(item => item.value.code === 'binding_required'))
})

test('failed turn is not retried and instructs operator to inspect and reopen', async () => {
  const result = await run(['ask First?', 'yes', 'ask Again?', 'exit'], f => {
    f.host.modelTurn = async () => { f.calls.push('attempt'); throw new Error('secret request content') }
  })
  assert.equal(result.calls.length, 1)
  assert.match(JSON.stringify(result.output), /unknown.*reopen/i)
  assert.doesNotMatch(JSON.stringify(result.output), /secret request content/)
})

test('sample is disabled; help never advertises scripted sampling', async () => {
  const result = await run(['sample', 'help', 'exit'], f => {
    f.host.sample = () => assert.fail('sample must not execute')
  })
  assert.ok(result.output.some(item => item.value.code === 'invalid_command'))
  assert.doesNotMatch(JSON.stringify(result.output.find(item => item.label === 'help')), /sample/)
})

test('real input reader rejects a yes buffered together with ask', async () => {
  const f = fixture(), input = new PassThrough(), controller = new AbortController()
  const running = runModelCommands(f.host, readInput(input, controller.signal), controller.signal, modelOptions, () => {})
  input.end('ask Next?\nyes\nexit\n')
  await running
  assert.equal(f.calls.length, 0)
})

test('real input reader accepts yes arriving after the model confirmation prompt', async () => {
  const f = fixture(), input = new PassThrough(), controller = new AbortController()
  const ask = readInput(input, controller.signal)
  const running = runModelCommands(f.host, async (prompt, fresh) => {
    const answer = ask(prompt, fresh)
    if (fresh) setImmediate(() => input.write('yes\n'))
    return answer
  }, controller.signal, modelOptions, label => { if (label === 'answer') input.end('exit\n') })
  input.write('ask Next?\n')
  await running
  assert.equal(f.calls.length, 1)
})

test('failed turn remains blocked even after a new Session and binding', async () => {
  const result = await run(['ask First?', 'yes', 'session new', `continue ${taskId}`, 'yes', 'ask Again?', 'exit'], f => {
    f.host.modelTurn = async () => { f.calls.push('attempt'); throw new Error('timeout') }
  })
  assert.equal(result.calls.length, 1)
  assert.ok(result.output.some(item => item.value.code === 'model_outcome_unknown'))
})

test('recovery-blocked status prevents confirmation and network dispatch', async () => {
  const result = await run(['ask Next?', 'exit'], f => {
    f.host.status = async () => ({ recovery: 'recovery_blocked' })
  })
  assert.equal(result.calls.length, 0)
  assert.equal(result.prompts.filter(item => item.fresh).length, 0)
  assert.ok(result.output.some(item => item.value.code === 'recovery_blocked'))
})
