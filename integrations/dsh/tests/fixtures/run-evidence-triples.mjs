import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import { splitRoles } from '../../dist/role-attribution.js'
import { CausalAttribution } from '../../dist/inline-attribution.js'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { catalogs, evidenceWire, frozen, inputs } from '../../../../scripts/phase-0.9.13/design.mjs'
import { assignmentHost } from './assignment-native-host.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-evidence-triples.mjs <pinned-server> <pinned-weights> <new-run-dir>')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.deepEqual(frozen, {
  inputs: '61741f0cbd959e861900b1aa12814ccc375bccdd157cae4ead5f645d11019d9c',
  truth: '354b7f52928b8bc11630fffde7868b69c198a8b880a7b0dca3a1d66806982bb0',
  catalog: 'a211a02738929d442d254211d89bfe387c5863a40d7020da2d1c4f741f609064',
})
assert.equal(inputs.length, 24)
const started = performance.now(), total = AbortSignal.timeout(30 * 60 * 1000)
const out = resolve(root)
mkdirSync(out)
const isolate = join(out, 'isolated-dsh')
mkdirSync(isolate)
let host, backend, stopped = null, records = 0, requested = 0, runtimeStopped = true
const append = (file, value) => appendFileSync(join(out, file), JSON.stringify(value) + '\n', { flush: true })
try {
  if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
  if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
  backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
  host = await assignmentHost(acmi, splitRoles, CausalAttribution, isolate, async (packet, request, signal) => {
    total.throwIfAborted()
    assert(requested < 24, '0.9.13 generation fence')
    requested++
    const result = await backend.infer(packet, request, signal ? AbortSignal.any([signal, total]) : total)
    append('completion-sidecar.jsonl', { ...request, ...result })
    return result
  }, cfg.model, { buildPacket: evidenceWire })
  for (const input of inputs) {
    assert(!input.toolAvailable, 'Unexpected tool route')
    const row = await host.run(input, catalogs.get(input.id))
    append('native-results.jsonl', row)
    records++
    console.log(records + '/24 ' + input.id + ' ' + row.native.end + ' steps=' + row.steps.length)
    if (row.leaked || !Object.values(row.unchanged).every(Boolean) || row.native.calls.length) throw new Error('AUTHORITY_OR_LEAK_STOP')
    if (row.adapterCalls !== 1 || row.steps.length !== 1) throw new Error('TRANSPORT_OR_NATIVE_STOP')
  }
} catch (e) {
  stopped = e.message
} finally {
  try { await host?.close() } catch { stopped ??= 'DSH_DISPOSAL_FAILED' }
  runtimeStopped = backend ? await backend.close() : true
  const summary = { provenance: 'actual_pinned_local_model_via_stock_dsh', model: cfg.model, dshVersion: cfg.dshVersion,
    frozen, records, requested, stopped, runtimeStopped, backend: backend?.metrics() ?? null,
    wallMs: Math.round(performance.now() - started) }
  writeFileSync(join(out, 'run-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(summary))
  if (stopped || !runtimeStopped) process.exitCode = 1
}
