import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { provisionContinuationRoots } from '@acmi/dsh-integration'
import { ConsoleError, display, errorCode, readInput, runCommands, showReceipts } from './console.mjs'
import { openConsoleHost } from './dsh.mjs'

const usage = 'node run.mjs --workspace PATH --journal PATH --graph PATH [--compression none|zstd] [--init]'

function parseOptions() {
  let values
  try {
    ({ values } = parseArgs({ options: { workspace: { type: 'string' }, journal: { type: 'string' },
      graph: { type: 'string' }, compression: { type: 'string', default: 'none' },
      init: { type: 'boolean' }, help: { type: 'boolean' } } }))
  } catch { throw new ConsoleError('invalid_arguments') }
  const { workspace, journal, graph, compression, init, help } = values
  if (!help && (!workspace || !journal || !graph || !['none', 'zstd'].includes(compression))) throw new ConsoleError('invalid_arguments')
  return { roots: { workspaceRoot: workspace, journalRoot: journal, graphRoot: graph, compression }, init, help }
}

async function closeHost(host) {
  const deadline = new AbortController()
  // Keep the observation deadline alive even if the writer is waiting with no active I/O handle.
  const timer = setTimeout(() => deadline.abort(), 10_000)
  try {
    const result = await host.close(deadline.signal)
    display('shutdown', result)
    if (!result.saved) process.exitCode = 1
  } finally { clearTimeout(timer) }
  // Never force process exit. The Host still owns any ongoing cleanup and both leases.
}

async function main() {
  const { roots, init, help } = parseOptions()
  if (help) { display('usage', usage); return }
  const controller = new AbortController()
  const stop = () => { controller.abort(); process.stdin.destroy() }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const ask = readInput(process.stdin, controller.signal)
  let host
  try {
    if (init) {
      display('initialize', roots)
      if (await ask('Type exactly yes to initialize these existing empty roots; anything else cancels.', true) !== 'yes') {
        display('cancelled', 'initialize')
        return
      }
      await provisionContinuationRoots(roots)
    }
    if (controller.signal.aborted) return
    const start = performance.now()
    host = await openConsoleHost(roots)
    const status = await host.status()
    display('startup', { elapsedMs: Math.round(performance.now() - start), synthetic: true })
    display('status', status)
    try { await showReceipts(host) } catch (error) { display('error', { code: errorCode(error), stage: 'receipts' }) }
    await runCommands(host, ask, controller.signal)
  } catch (error) {
    const code = errorCode(error)
    display('error', { code, stage: host ? 'console' : init ? 'initialize_or_open' : 'open',
      ...(!host && code !== 'busy' ? {
        hint: 'Check the canonical roots and pair. Possible initialization_incomplete or unavailable; no marker is repaired, overwritten, or backfilled.',
      } : {}) })
    process.exitCode = 1
  } finally {
    process.stdin.destroy()
    if (host) await closeHost(host)
  }
}

try { await main() } catch (error) {
  display('error', { code: errorCode(error) })
  if (errorCode(error) === 'invalid_arguments') display('usage', usage)
  process.exitCode = 1
}
