import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import { splitRoles } from '../../dist/role-attribution.js'
import { CausalAttribution } from '../../dist/inline-attribution.js'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { catalogs, frozen, inputs, launches } from '../../../../scripts/phase-0.9.14/design.mjs'
import { makeAnchorCase } from '../../../../scripts/phase-0.9.14/controller.mjs'
import { assignmentHost } from './assignment-native-host.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-anchor-pairs.mjs <pinned-server> <pinned-weights> <new-run-dir>')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.deepEqual(frozen, {
  inputs: 'f90eecb6dfd93360a296322a80d5f5271bf527e5c2cd4e15eea7448eeed8258f',
  truth: '219074728ed6d1ccf6b3237b109d322d9628a26ee653f86d8fdf03acda7efcd5',
  catalog: 'f7db4c9daed7ea03a6f30dbaa5d021fb68b78d5302c6802fb7eb7d242b2ae649',
  launches: '6fd63fd8c2f4375d9d309658313b348fc16f50dff8e028d7e37d992040bea234',
})
assert.equal(inputs.length, 24)
const started = performance.now(), total = AbortSignal.timeout(30 * 60 * 1000)
const out = resolve(root)
mkdirSync(out)
const isolate = join(out, 'isolated-dsh')
mkdirSync(isolate)
const append = (file, row) => appendFileSync(join(out, file), JSON.stringify(row) + '\n', { flush: true })
const controllers = new Map(), anchors = new Map()
let host, backend, stopped = null, records = 0, requested = 0, runtimeStopped = true
try {
  if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
  if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
  backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
  host = await assignmentHost(acmi, splitRoles, CausalAttribution, isolate, async (packet, request, signal) => {
    total.throwIfAborted()
    assert(requested < 24 && anchors.has(request.id), '0.9.14 generation fence')
    requested++
    const result = await backend.infer(packet, request, signal ? AbortSignal.any([signal, total]) : total)
    append('completion-sidecar.jsonl', { ...request, ...result })
    return result
  }, cfg.model, {
    buildPacket(entry, results, source) {
      assert(!anchors.has(entry.id) && results === null, 'Unexpected anchor reuse')
      const { packet, receipt } = controllers.get(entry.id)(source)
      anchors.set(entry.id, receipt)
      append('anchor-receipts.jsonl', receipt)
      return packet
    },
    gateOperations(ops) {
      assert.equal(ops.length, 0, 'Unexpected model effect in text-only run')
      return []
    },
  })
  for (const input of inputs) {
    assert(!input.toolAvailable, 'Unexpected native tool route')
    controllers.set(input.id, makeAnchorCase(input, catalogs.get(input.id), launches.get(input.id)))
    const row = await host.run(input, catalogs.get(input.id))
    append('native-results.jsonl', row)
    records++
    console.log(records + '/24 ' + input.id + ' ' + row.native.end + ' steps=' + row.steps.length)
    if (row.leaked || !Object.values(row.unchanged).every(Boolean) || row.native.calls.length || row.native.results.length) {
      throw new Error('AUTHORITY_OR_LEAK_STOP')
    }
    if (row.adapterCalls !== 1 || row.steps.length !== 1 || row.native.user?.id !== anchors.get(input.id)?.source.nativeUserId) {
      throw new Error('TRANSPORT_OR_NATIVE_STOP')
    }
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
