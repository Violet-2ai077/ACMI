import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { provisionContinuationRoots } from '@acmi/dsh-integration'
import { ConsoleError, display, errorCode, readInput, showReceipts } from './console.mjs'
import { runModelCommands } from './model-console.mjs'
import { createLoopbackCompletion } from './model-transport.mjs'

const usage = 'node examples/task-console/model-run.mjs --workspace PATH --journal PATH --graph PATH --endpoint http://127.0.0.1:PORT/v1/chat/completions --model NAME [--compression none|zstd] [--init] [--help]'

export function parseModelOptions(args) {
  let values
  try {
    ({ values } = parseArgs({ args, options: { workspace: { type: 'string' }, journal: { type: 'string' },
      graph: { type: 'string' }, compression: { type: 'string', default: 'none' }, endpoint: { type: 'string' },
      model: { type: 'string' }, init: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } } }))
    const { workspace, journal, graph, compression, endpoint, model, help } = values
    if (!help) {
      if (!workspace || !journal || !graph || !['none', 'zstd'].includes(compression)) throw new Error('Invalid roots')
      // Construction validates destination and budget without opening a socket.
      createLoopbackCompletion({ endpoint, model })
    }
  } catch { throw new ConsoleError('invalid_arguments') }
  const { workspace, journal, graph, compression, endpoint, model, init, help } = values
  return { roots: { workspaceRoot: workspace, journalRoot: journal, graphRoot: graph, compression },
    modelOptions: { endpoint, model }, init, help }
}

async function closeHost(host) {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 10_000)
  try {
    const result = await host.close(deadline.signal)
    display('shutdown', result)
    if (!result.saved) process.exitCode = 1
  } finally { clearTimeout(timer) }
}

async function main() {
  const { roots, modelOptions, init, help } = parseModelOptions(process.argv.slice(2))
  if (help) { display('usage', usage); return }
  const controller = new AbortController()
  const stop = () => { controller.abort(); process.stdin.destroy() }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const ask = readInput(process.stdin, controller.signal)
  let host
  try {
    display('model', { ...modelOptions, synthetic: true, automaticRequests: false,
      note: 'Synthetic test data only. Confirmed asks send plain Task history to this loopback endpoint.' })
    if (init) {
      display('initialize', roots)
      const answer = await ask('Type exactly yes to initialize these existing empty roots; anything else cancels.', true)
      if (controller.signal.aborted || answer !== 'yes') { display('cancelled', 'initialize'); return }
      await provisionContinuationRoots(roots)
    }
    if (controller.signal.aborted) return
    const { openModelConsoleHost } = await import('./model-runtime.mjs')
    const start = performance.now()
    host = await openModelConsoleHost(roots, modelOptions)
    display('startup', { elapsedMs: Math.round(performance.now() - start), synthetic: true, modelEnabled: true })
    display('status', await host.status())
    try { await showReceipts(host) } catch (error) { display('error', { code: errorCode(error), stage: 'receipts' }) }
    await runModelCommands(host, ask, controller.signal, modelOptions)
  } catch (error) {
    display('error', { code: errorCode(error), stage: host ? 'console' : init ? 'initialize_or_open' : 'open',
      hint: 'Check the dedicated canonical roots, pair, and local endpoint. No store is automatically repaired or migrated.' })
    process.exitCode = 1
  } finally {
    process.stdin.destroy()
    if (host) await closeHost(host)
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main() } catch (error) {
    display('error', { code: errorCode(error) })
    if (errorCode(error) === 'invalid_arguments') display('usage', usage)
    process.exitCode = 1
  }
}
