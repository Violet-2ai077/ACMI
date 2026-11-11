import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import { splitAssignment } from '../../dist/assignment-inline.js'
import { splitRoles } from '../../dist/role-attribution.js'
import { CausalAttribution } from '../../dist/inline-attribution.js'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { wire } from '../../../../scripts/phase-0.9.11/design.mjs'
import { catalogs, frozen, inputs, roleWire } from '../../../../scripts/phase-0.9.12/design.mjs'
import { assignmentHost } from './assignment-native-host.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-role-pairs.mjs <pinned-server> <pinned-weights> <new-run-dir>')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.deepEqual(frozen, {
  inputs: '9ee177b5851e3e5663630d9cd65fdfe38377e8582a097a3798e6f59c36c7c57e',
  truth: '66defd93c493880dc28ff6343ed0ba1ac035b1f0f92adaec8787bc1a9c83e852',
  catalog: '5f9f52d8bed203a821d98ad4bdfb06b98816df79a0c46bd727884073e544d695',
})
const started = performance.now(), total = AbortSignal.timeout(30 * 60 * 1000)
const out = resolve(root)
mkdirSync(out)
const isolated = join(out, 'isolated-dsh')
mkdirSync(isolated)
let host, backend, stopped = null, records = 0, requested = 0, runtimeStopped = true
const split = (raw, stop, cut) => (cut.arm === 'A' ? splitAssignment : splitRoles)(raw, stop, cut)
const buildPacket = (entry, results) => (entry.arm === 'A' ? wire : roleWire)(entry, results)

try {
  if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
  if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
  backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
  host = await assignmentHost(acmi, split, CausalAttribution, isolated, async (packet, request, signal) => {
    total.throwIfAborted()
    assert(requested < 24, '0.9.12 generation fence')
    requested++
    return backend.infer(packet, request, signal ? AbortSignal.any([signal, total]) : total)
  }, cfg.model, { buildPacket })
  for (const input of inputs) {
    const row = await host.run(input, catalogs.get(input.id))
    appendFileSync(join(out, 'native-results.jsonl'), JSON.stringify(row) + '\n', { flush: true })
    records++
    console.log(records + '/' + inputs.length + ' ' + input.id + ' ' + row.native.end + ' steps=' + row.steps.length)
    if (row.leaked || !Object.values(row.unchanged).every(Boolean)) throw new Error('AUTHORITY_OR_LEAK_STOP')
    if (row.adapterCalls !== row.steps.length || !row.steps.length) throw new Error('TRANSPORT_OR_NATIVE_STOP')
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
