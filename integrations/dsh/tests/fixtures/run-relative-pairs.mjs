import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as acmi from '../../dist/index.js'
import { readAssignmentFrame, safeAssignmentText } from '../../dist/assignment-inline.js'
import { splitRoles } from '../../dist/role-attribution.js'
import { CausalAttribution } from '../../dist/inline-attribution.js'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { frozen, inputs, catalogs, packetFor } from '../../../../scripts/phase-0.9.15/design.mjs'
import pin from '../../../../scripts/phase-0.9.15/frozen.json' with { type: 'json' }
import { projectRelative } from '../../../../scripts/phase-0.9.15/proposal.mjs'
import { assignmentHost } from './assignment-native-host.mjs'

export async function runTextPairs({ exe, weights, root, inputs, catalogs, packetFor, frozen, pin, project }) {
  assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
  assert.deepEqual(frozen, pin)
  assert.equal(inputs.length, 24)
  const started = performance.now(), total = AbortSignal.timeout(30 * 60 * 1000)
  const out = resolve(root), isolate = join(out, 'isolated-dsh')
  mkdirSync(out)
  mkdirSync(isolate)
  const append = (name, row) => appendFileSync(join(out, name + '.jsonl'), JSON.stringify(row) + '\n', { flush: true })
  const anchors = new Map()
  const split = (raw, stop, cut) => project(raw, stop, cut, { readAssignmentFrame, safeAssignmentText, splitRoles })
  let host, backend, stopped = null, records = 0, requested = 0, runtimeStopped = true

  try {
    if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
    if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
    backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
    host = await assignmentHost(acmi, split, CausalAttribution, isolate, async (packet, request, signal) => {
      total.throwIfAborted()
      assert(requested < 24 && request.id === inputs[requested].id && anchors.has(request.id), 'GENERATION_FENCE')
      requested++
      const result = await backend.infer(packet, request, signal ? AbortSignal.any([signal, total]) : total)
      append('completion-sidecar', { ...request, ...result })
      return result
    }, cfg.model, {
      buildPacket(entry, results, source) {
        assert(!anchors.has(entry.id) && results === null, 'UNEXPECTED_ANCHOR_REUSE')
        const { packet, receipt } = packetFor(entry, source)
        anchors.set(entry.id, receipt)
        append('anchor-receipts', receipt)
        return packet
      },
      proposalContext(entry, source) {
        const receipt = anchors.get(entry.id)
        assert.deepEqual(receipt?.source, source)
        return { anchorRef: receipt.modelAnchorRef }
      },
      gateOperations(ops) {
        assert.equal(ops.length, 0, 'TEXT_ONLY_ACTION_FENCE')
        return []
      },
    })
    for (const input of inputs) {
      assert.equal(input.toolAvailable, false)
      const row = await host.run(input, catalogs.get(input.id))
      append('native-results', row)
      records++
      console.log(records + '/24 ' + input.id + ' ' + row.native.end + ' steps=' + row.steps.length)
      if (row.leaked || !Object.values(row.unchanged).every(Boolean) || row.native.calls.length || row.native.results.length
        || row.steps.some(s => s.withheld === 'UNSAFE_ANSWER')) throw new Error('AUTHORITY_OR_LEAK_STOP')
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [exe, weights, root, ...extra] = process.argv.slice(2)
  assert(exe && weights && root && !extra.length, 'Usage: node run-relative-pairs.mjs <pinned-server> <pinned-weights> <new-run-dir>')
  await runTextPairs({ exe, weights, root, inputs, catalogs, packetFor, frozen, pin,
    project: (raw, stop, cut, options) => cut.arm === 'A' ? splitRoles(raw, stop, cut) : projectRelative(raw, stop, cut, options) })
}
