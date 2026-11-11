import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import { splitAssignment } from '../../dist/assignment-inline.js'
import { CausalAttribution } from '../../dist/inline-attribution.js'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { catalogs, frozen, inputs } from '../../../../scripts/phase-0.9.11/design.mjs'
import { assignmentHost } from './assignment-native-host.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-assignment-pilot.mjs <pinned-server> <pinned-weights> <new-run-dir>')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.deepEqual(frozen, {
  inputs: 'ab64b348dc1fd4209633c84f68448ece0668f1a929f0bb66f7495ac76995cca6',
  truth: '908dd5942411d42066041c6d70952bdbf8368809d24c9e18eb9a5305d4ca9d7c',
  catalog: '272249b2c27e18e1bd1e477f69142b65ea74cf773e461e8a11e6316b7671c0c0',
})
assert.equal(inputs.length, 16)
const started = performance.now()
const total = AbortSignal.timeout(30 * 60 * 1000)
const out = resolve(root)
mkdirSync(out)
const isolate = join(out, 'isolated-dsh')
mkdirSync(isolate)
let host, backend, stopped = null, records = 0, calls = 0, runtimeStopped = true
try {
  if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
  if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
  backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
  host = await assignmentHost(acmi, splitAssignment, CausalAttribution, isolate, async (packet, request, signal) => {
    total.throwIfAborted()
    assert(calls < 18, '0.9.11 generation fence')
    calls++
    return backend.infer(packet, request, signal ? AbortSignal.any([total, signal]) : total)
  }, cfg.model)
  for (const entry of inputs) {
    const row = await host.run(entry, catalogs.get(entry.id))
    appendFileSync(join(out, 'native-results.jsonl'), JSON.stringify(row) + '\n', { flush: true })
    records++
    console.log(records + '/16 ' + entry.id + ' ' + row.native.end + ' steps=' + row.steps.length)
    if (row.leaked || !Object.values(row.unchanged).every(Boolean)) throw new Error('AUTHORITY_OR_LEAK_STOP')
    if (row.adapterCalls !== row.steps.length || !row.steps.length) throw new Error('TRANSPORT_OR_NATIVE_STOP')
  }
} catch (e) {
  stopped = e.message
} finally {
  try { await host?.close() } catch { stopped ??= 'DSH_DISPOSAL_FAILED' }
  runtimeStopped = backend ? await backend.close() : true
  const summary = { provenance: 'actual_pinned_local_model_via_stock_dsh', model: cfg.model, dshVersion: cfg.dshVersion,
    frozen, records, requested: calls, stopped, runtimeStopped, backend: backend?.metrics() ?? null,
    wallMs: Math.round(performance.now() - started) }
  writeFileSync(join(out, 'run-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(summary))
  if (stopped || !runtimeStopped) process.exitCode = 1
}
