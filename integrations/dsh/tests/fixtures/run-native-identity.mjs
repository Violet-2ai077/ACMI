import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import * as acmi from '../../dist/index.js'
import cfg from '../../../../scripts/phase-0.9.9/config.json' with { type: 'json' }
import { conditions } from '../../../../scripts/phase-0.9.9/cases.mjs'
import { startLoopback } from '../../../../scripts/phase-0.9.9/loopback.mjs'
import { createNativeIdentityHost } from './native-identity-host.mjs'

const [server, model, result, ...extra] = process.argv.slice(2)
assert(server && model && result && !extra.length, 'Usage: node run-native-identity.mjs <pinned-server> <pinned-weights> <new-run-directory>')
const hash = s => createHash('sha256').update(s).digest('hex')
assert.equal(acmi.DSH_VERSION, cfg.dshVersion)
assert.equal(conditions.length, cfg.maxCalls)
assert.equal(hash(JSON.stringify(conditions)), cfg.caseDigest)
const out = resolve(result)
const exe = realpathSync(server), weights = realpathSync(model)
mkdirSync(out)
const root = join(out, 'isolated-dsh')
mkdirSync(root)
const receipts = []
let backend, host, stopped = null, runtimeStopped = false, nativeCalls = 0
try {
  backend = await startLoopback(exe, weights, out)
  host = await createNativeIdentityHost(acmi, root, (request, signal) => backend.infer(request, signal), { runtimeModel: cfg.model })
  const marker = openSync(join(dirname(weights), 'phase-0.9.9-consumed.json'), 'wx')
  try {
    writeSync(marker, JSON.stringify({ caseDigest: cfg.caseDigest, model: cfg.model, out }) + '\n')
    fsyncSync(marker)
  } finally { closeSync(marker) }
  for (const { family, story, mode, expectedIndex } of conditions) {
    const record = await host.runCase(story, mode)
    assert.equal(record.calls, 1)
    assert.equal(record.priorVisible, mode === 'on' && !story.denied)
    const result = { id: story.id, family, mode, expectedIndex, ...record }
    receipts.push(result)
    const fd = openSync(join(out, 'native-results.jsonl'), 'a')
    try { writeSync(fd, JSON.stringify(result) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
    if (receipts.length % 4 === 0) console.log('dsh real turns: ' + receipts.length + '/' + conditions.length)
  }
} catch (error) {
  stopped = String(error?.message ?? 'native run failed').slice(0, 500)
} finally {
  nativeCalls = host?.calls() ?? 0
  try { await host?.close() } catch { stopped ??= 'isolated dsh disposal failed' }
  runtimeStopped = backend ? await backend.close() : true
  const report = { provenance: 'actual_model_via_stock_dsh_agent_loop', dshVersion: cfg.dshVersion, model: cfg.model,
    modelSha256: cfg.modelSha256, caseDigest: cfg.caseDigest, nativeCalls, completed: receipts.length, stopped, runtimeStopped,
    status: !stopped && runtimeStopped && receipts.length === cfg.maxCalls ? 'completed' : 'stopped',
    backend: backend?.metrics() ?? null }
  writeFileSync(join(out, 'run-summary.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(report))
  if (report.status !== 'completed') process.exitCode = 1
}
