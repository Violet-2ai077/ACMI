import assert from 'node:assert/strict'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openConsoleHost } from '../../examples/task-console/dsh.mjs'

const require = createRequire(new URL('../../examples/task-console/dsh.mjs', import.meta.url))
const { provisionContinuationRoots } = await import(pathToFileURL(require.resolve('@acmi/dsh-integration')).href)
const [mode, directory, endpoint, model, gate = 'retrieval'] = process.argv.slice(2)
assert.ok(['retrieval', 'derived'].includes(gate))
const { assertRecovered, assertMissing, fakeComplete, fixture } = await import(gate === 'derived' ? './derived-fixture.mjs' : './fixture.mjs')
assert.ok(['walkthrough-seed', 'walkthrough-reopen', 'fake-seed', 'fake-reopen', 'real-seed', 'real-reopen'].includes(mode))
const roots = { workspaceRoot: join(directory, 'workspace'), journalRoot: join(directory, 'journal'),
  graphRoot: join(directory, 'graph'), compression: 'none' }
const seed = mode.endsWith('-seed')
const walkthrough = mode.startsWith('walkthrough-')
const signal = AbortSignal.timeout(380_000)
const report = { mode, gate, pid: process.pid, startedAt: new Date().toISOString(), roots, turns: [] }
let host
let calls = 0

async function explicit(command) {
  const { token, ...preview } = await host.preview(command)
  const receipt = await host.confirm(token, true)
  assert.ok(receipt)
  return { preview, receipt }
}

try {
  if (seed) await provisionContinuationRoots(roots)
  if (walkthrough) host = await openConsoleHost(roots)
  else {
    const runtime = await import('../../examples/task-console/model-runtime.mjs')
    const { createLoopbackCompletion } = await import('../../examples/task-console/model-transport.mjs')
    const complete = mode.startsWith('fake-') ? fakeComplete : createLoopbackCompletion({ endpoint, model })
    host = await runtime.openModelConsoleHost(roots, { endpoint, model, async complete(messages, requestSignal) {
      assert.ok(++calls <= (seed || gate === 'derived' ? 2 : 1), 'No additional model call or retry is permitted')
      const call = { pid: process.pid, ordinal: calls, at: new Date().toISOString(), messages }
      await appendFile(join(directory, 'requests.jsonl'), JSON.stringify(call) + '\n')
      const result = await complete(messages, requestSignal)
      await appendFile(join(directory, 'completions.jsonl'), JSON.stringify({ ...call, result }) + '\n')
      return result
    } })
  }
  report.initial = await host.status()
  assert.equal(report.initial.binding.taskId, null)
  assert.equal(report.initial.history, 'history_ready')
  if (seed) {
    report.a = await explicit({ kind: 'create', ...{ objective: fixture.a.objective, criteria: fixture.a.criteria } })
    report.bindA = await explicit({ kind: 'continue', taskId: report.a.receipt.taskId })
    if (walkthrough) report.sample = await host.sample(signal)
    else {
      report.turns.push(await host.modelTurn(fixture.a.prompt, {}, signal))
      report.b = await explicit({ kind: 'create', objective: fixture.b.objective, criteria: fixture.b.criteria })
      report.secondSession = await host.newSession(signal)
      report.bindB = await explicit({ kind: 'continue', taskId: report.b.receipt.taskId })
      report.turns.push(await host.modelTurn(fixture.b.prompt, {}, signal))
    }
  } else {
    const previous = JSON.parse(await readFile(join(directory, 'seed.json'), 'utf8'))
    assert.notEqual(process.pid, previous.pid, 'Reopen must run in another process')
    assert.notEqual(report.initial.session.sessionId, previous.initial.session.sessionId)
    report.taskId = previous.a.receipt.taskId
    report.bindA = await explicit({ kind: 'continue', taskId: report.taskId })
    assert.equal(report.bindA.receipt.taskId, previous.a.receipt.taskId)
    report.historyBefore = await host.history(report.taskId, 64)
    assert.ok(report.historyBefore.events.length > 0)
    if (!walkthrough) {
      const result = await host.modelTurn(fixture.resume, {}, signal)
      report.turns.push(result)
      assertRecovered(result)
      report.historyAfter = await host.history(report.taskId, 64)
      assert.ok(report.historyAfter.events.length > report.historyBefore.events.length)
      if (gate === 'derived') {
        await host.newSession(signal)
        report.control = await explicit({ kind: 'create', objective: 'Prepare an unconfigured launch',
          criteria: ['Do not invent missing historical settings'] })
        report.bindControl = await explicit({ kind: 'continue', taskId: report.control.receipt.taskId })
        const controlResult = await host.modelTurn(fixture.resume, {}, signal)
        report.turns.push(controlResult)
        assertMissing(controlResult)
      }
    }
  }
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = { name: error.name, message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  if (host) {
    report.shutdown = await host.close(AbortSignal.timeout(10_000))
    if (!report.shutdown.saved) { report.passed = false; process.exitCode = 1 }
  }
  report.finishedAt = new Date().toISOString()
  report.calls = calls
  await writeFile(join(directory, seed ? 'seed.json' : 'reopen.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ mode, pid: process.pid, passed: report.passed, error: report.error }) + '\n')
}
