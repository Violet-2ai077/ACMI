import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import * as protocol from '../../dist/inline-attribution.js'
import { input, truth, hashes } from '../../../../scripts/phase-0.9.10/corpus.mjs'
import { startBackend } from '../../../../scripts/phase-0.9.10/backend.mjs'
import cfg from '../../../../scripts/phase-0.9.10/config.json' with { type: 'json' }
import { createInlineNativeHost } from './inline-native-host.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-inline-attribution.mjs <pinned-llama-server> <pinned-weights> <new-run-directory>')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.equal(hashes.inputs, cfg.caseDigest)
assert.equal(hashes.groundTruth, cfg.truthDigest)
const started = performance.now()
const out = resolve(root)
mkdirSync(out)
const isolated = join(out, 'isolated-dsh')
mkdirSync(isolated)
const append = record => appendFileSync(join(out, 'native-results.jsonl'), JSON.stringify(record) + '\n', { flush: true })
const write = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const catalogs = new Map(truth.map(({ id, workspace, tasks }) => [id, { workspace, tasks }]))
const pilot = [], failures = []
let host, backend, stopped, closed = true, mainTurns = 0, controls = 0, permutations = 0, pilotPassed = false

function pilotIssues(entry, record) {
  const first = record.steps[0]
  const expectedTools = entry.family === 'multi-tool' && entry.turn === 4 ? 2 : 0
  const issues = []
  if (record.calls !== 1 || record.steps.length !== 1 || !first?.proposal || first.generation !== first.proposal.generation) {
    issues.push('SAME_GENERATION_OR_VALIDATION')
  }
  if (record.native.end !== 'completed' || record.native.assistant.length !== 1) issues.push('NATIVE_TURN')
  if (record.native.calls.length !== expectedTools || record.native.results.length !== expectedTools
    || record.native.results.some(r => r.isError || !r.inherits)
    || (expectedTools && record.native.results.map(r => r.text).join('|') !== 'amber=17|indigo=29')) issues.push('NATIVE_TOOL')
  if (record.metadataLeak || !Object.values(record.unchanged).every(Boolean)) issues.push('AUTHORITY_OR_LEAK')
  return issues
}

try {
  if (!existsSync(weights)) throw new Error('BLOCKED_MODEL_ARTIFACT_UNAVAILABLE')
  if (!existsSync(exe)) throw new Error('BLOCKED_RUNTIME_ARTIFACT_UNAVAILABLE')
  backend = await startBackend(realpathSync(exe), realpathSync(weights), out, started)
  host = await createInlineNativeHost(acmi, protocol, isolated, backend.infer, { model: cfg.model, catalogs })
  for (const entry of input.filter(e => e.split === 'pilot')) {
    const r = await host.run(entry, 'B', 'pilot')
    append(r)
    pilot.push(r)
    const reasons = pilotIssues(entry, r)
    if (reasons.length) failures.push({ id: entry.id, reasons, adapter: r.steps[0]?.error ?? r.error })
    if (!r.steps.length || (r.steps[0].proposal && reasons.length)) throw new Error('PILOT_RUNTIME_STOP')
    console.log('Pilot ' + pilot.length + '/24 ' + r.id + ' ' + (reasons.join(',') || 'ok'))
  }
  pilotPassed = pilot.length === 24 && failures.length === 0
  write('pilot-gate.json', { passed: pilotPassed, completedRecords: pilot.length, failures })
  if (!pilotPassed) throw new Error('PILOT_GATE_FAILED')

  for (const entry of input.filter(e => e.split === 'main' && e.variant === 'base')) {
    for (const arm of entry.arms) {
      if (arm === 'C') {
        const answer = await host.run(entry, 'A', 'control')
        append({ ...answer, arm: 'C', stage: 'answer' })
        if (answer.native.end !== 'completed') throw new Error('CONTROL_NATIVE_TURN')
        const attribution = await host.control(entry, answer)
        append({ id: entry.id, group: 'control', arm: 'C', stage: 'attribution', steps: [attribution] })
        controls++
      } else {
        const r = await host.run(entry, arm, 'main')
        append(r)
        if (r.native.end !== 'completed') throw new Error('MAIN_NATIVE_TURN')
        mainTurns++
      }
    }
    if (mainTurns % 16 === 0) console.log('Main A/B turns: ' + mainTurns + '/160; C=' + controls + '/20')
  }
  for (const entry of input.filter(e => e.variant !== 'base')) {
    const r = await host.run(entry, 'B', 'main', true)
    append(r)
    if (r.native.end !== 'completed') throw new Error('PERMUTATION_NATIVE_TURN')
    permutations++
  }
} catch (error) {
  stopped = String(error.message).slice(0, 200)
} finally {
  try { await host?.close() } catch { stopped ??= 'DSH_DISPOSAL_FAILED' }
  closed = backend ? await backend.close() : true
  if (!existsSync(join(out, 'pilot-gate.json'))) write('pilot-gate.json', { passed: false, completedRecords: pilot.length, failures })
  const results = { provenance: 'actual_model_via_stock_dsh_agent_loop', model: cfg.model, dshVersion: cfg.dshVersion, hashes,
    pilot: pilot.length, pilotPassed, mainTurns, controls, permutations, runtimeStopped: closed, stopped: stopped ?? null,
    backend: backend?.metrics() ?? null, wallMs: Math.round(performance.now() - started) }
  write('run-summary.json', results)
  console.log(readFileSync(join(out, 'run-summary.json'), 'utf8'))
  if (stopped || !closed) process.exitCode = 1
}
