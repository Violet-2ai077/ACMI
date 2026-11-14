import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freezeDevelopment } from '../gate2/freeze-development.mjs'
import { openGuardedRun } from '../gate2/send-boundary.mjs'
import { GATE2_EVIDENCE_ROOT, openRunLedger } from '../gate2/run-ledger.mjs'
import { importRun } from '../execution/report.mjs'
import { executeSchedule } from '../execution/live.mjs'
import { encodeInline } from '../protocol/wire.mjs'
import { VERSION } from '../protocol/contracts.mjs'

mkdirSync(GATE2_EVIDENCE_ROOT, { recursive: true })
const root = mkdtempSync(join(GATE2_EVIDENCE_ROOT, 'revision-boundary-'))
const revision = { version: 'gate2-protocol-revision-v1', diagnostic_policy: 'D-180-LOCAL-v1', inline_profile: 'B-inline-v1-ws1', owner_authorization: 'owner-2026-11-15-offline-revision' }
const runtime = { version: 'gate2-runtime-v1', model_snapshot: 'synthetic', model_identity_kind: 'mutable-service-alias', node_version: process.version,
  spending_policy: { mode: 'uncapped', authorization_ref: 'owner-offline', scheduled_calls: 576 },
  route: { version: 'gate2-dsh-route-v1', provider: 'synthetic', api: 'openai-completions', endpoint: 'https://synthetic.invalid/', model_alias: 'synthetic', reasoning_effort: 'max', thinking_format: 'deepseek', max_tokens_field: 'max_tokens', assistant_reasoning_content_required: true, output_tokens_declared: 32768 },
  max_output_tokens: 16384, max_input_bytes: 131072, max_response_bytes: 1048576, timeout_ms: 180000, currency: 'USD', protocol_revision: revision }
const wire = text => 'data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: { content: text, reasoning_content: 'synthetic' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n'

test('raw-first offline boundary retains pre-send validation and exposes stage accounting without live opt-in', async () => {
  const bundle = freezeDevelopment({ root, packageId: 'raw-first-synthetic', runtime, purpose: 'synthetic-test' })
  const options = { bundle, root, runId: 'raw-first-run', mode: 'offline',
    offlineStorageProtocol: 'raw-first-transaction-v1', credentialProvider: () => 'SYNTHETIC',
    fetchImpl: async () => new Response(wire('synthetic answer'), { headers: { 'content-type': 'text/event-stream' } }) }
  const run = openGuardedRun(options), result = await run.execute(run.next())
  assert.equal(JSON.parse(readFileSync(join(run.path, 'manifest.json'))).version, 'gate2-run-v5')
  assert.equal(result.transport.accounting.raw_chunks_committed, 1)
  assert.equal(result.transport.accounting.decoder.done_events, 1)
  assert.ok(run.snapshot().physical_seq < run.snapshot().seq)
  assert.ok(result.offline_evidence_accounting.prepare_ms >= 0)
  assert.ok(result.offline_evidence_accounting.pre_send_validation_ms > 0)
  assert.ok(result.offline_evidence_accounting.attempt_wall_ms >= result.transport.latency.total_ms)
  assert.equal(result.offline_evidence_accounting.result_file_completed_ms, null)
  assert.equal(openGuardedRun({ ...options, resume: true }).snapshot().attempts.length, 1)
  assert.throws(() => openGuardedRun({ ...options, mode: 'live', fetchImpl: undefined }), /offline storage/)
})
function envelope(p) {
  return { answer: p.unit_ids.map((id, i) => ({ block_id: 'b' + i, decision_ids: ['d' + i], task_ids: [], unresolved_reason: 'insufficient_context', text: 'Synthetic answer' })),
    work_state: { schema_version: VERSION, turn_id: p.turn_id, base_state_id: p.base_state_id, proposed_active_task_ids: [], focus_task_id: null, status_updates: [], task_memory: [],
      decisions: p.unit_ids.map((id, i) => ({ decision_id: 'd' + i, unit_id: id, actions: [{ op: 'UNRESOLVED' }], task_ids: [], resolved_scope_quotes: [], unresolved_scope_quotes: [p.sourceMap[id]],
        unresolved: { reason: 'insufficient_context', candidate_task_ids: [], missing_evidence: 'synthetic' }, evidence: [{ source_id: id, quote: p.sourceMap[id] }], self_reported_confidence: 'not_reported' })) } }
}

test('binary streaming guarded path preserves prepared packets, request bytes and resumed histories', async () => {
  const bundle = freezeDevelopment({ root, packageId: 'binary-context-synthetic', runtime, purpose: 'synthetic-test' })
  const options = (runId, storage) => ({ bundle, root, runId, mode: 'offline', offlineStorageProtocol: storage,
    credentialProvider: () => 'SYNTHETIC', fetchImpl: async () => new Response(wire('synthetic answer'), { headers: { 'content-type': 'text/event-stream' } }) })
  const a = options('binary-reference', 'raw-first-transaction-v1'), b = options('binary-candidate', 'gate2-transaction-binary-v1')
  let old = openGuardedRun(a), next = openGuardedRun(b), closedHistory = 0, diagnostic = 0
  for (let i = 0; i < 62; i++) {
    assert.deepEqual(next.next(), old.next())
    const x = old.prepare(old.next()), y = next.prepare(next.next())
    assert.deepEqual(y.packet, x.packet); assert.deepEqual(y.request.bytes, x.request.bytes)
    if (y.packet.messages.some(m => m.role === 'assistant')) closedHistory++
    if (next.next().arm === 'D') diagnostic++
    const rx = await old.execute(old.next()), ry = await next.execute(next.next())
    assert.equal(ry.settlement_outcome, rx.settlement_outcome)
    assert.equal(ry.run_disposition, rx.run_disposition)
    if (i === 20) { old = openGuardedRun({ ...a, resume: true }); next = openGuardedRun({ ...b, resume: true }) }
  }
  assert.ok(closedHistory > 0); assert.ok(diagnostic > 0)
  assert.deepEqual(next.snapshot().attempts.map(a => a.coordinate), old.snapshot().attempts.map(a => a.coordinate))
  assert.throws(() => openGuardedRun({ ...b, mode: 'live', fetchImpl: undefined }), /offline storage/)
})

test('guard and report bind revisions, continue only settled D2, preserve schedule and B provenance', async () => {
  const bundle = freezeDevelopment({ root, packageId: 'synthetic-package', runtime, purpose: 'synthetic-test' })
  const legacy = freezeDevelopment({ root, packageId: 'legacy-material-check', runtime: { ...runtime, protocol_revision: undefined }, purpose: 'synthetic-test' })
  const files = b => JSON.parse(readFileSync(b.manifestPath)).files.filter(f => ['public', 'oracle', 'plan', 'prompt'].includes(f.role)).map(f => [f.path, f.sha256])
  assert.deepEqual(files(bundle), files(legacy))
  const bound = JSON.parse(readFileSync(bundle.manifestPath)).files.map(f => f.path)
  assert.ok(bound.includes('evaluator/execution/report.mjs'))
  assert.ok(bound.includes('evaluator/tests/gate2-deadline-revision.node-test.mjs'))
  assert.ok(bound.includes('evaluator/protocol-revision-approval.md'))
  let now = 0, timeout, run, sends = 0, d2 = 0, bSeen = 0
  const clock = { now: () => now, setTimeout(fn, ms) { if (ms === 180000) timeout = fn; return fn }, clearTimeout() {} }
  const options = { bundle, root, runId: 'synthetic-run', mode: 'offline', clock, credentialProvider: () => 'SYNTHETIC',
    fetchImpl: async () => {
      sends++
      const a = run.snapshot().attempts.at(-1), c = a.coordinate
      if (c.arm === 'D' && c.stage === 'marker') {
        d2++
        let release
        return { status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
          read: () => new Promise(r => { release = r; queueMicrotask(() => { now += 180000; timeout() }) }),
          cancel: () => { release({ done: true }); return Promise.resolve() }
        }) } }
      }
      const pre = JSON.parse(Buffer.from(a.chunks[0].bytes_base64, 'base64'))
      const text = c.arm === 'B' ? '\r\n' + encodeInline(envelope(pre.input_packet)) + '\n' : 'synthetic answer'
      if (c.arm === 'B') bSeen++
      return new Response(wire(text), { headers: { 'content-type': 'text/event-stream' } })
    } }
  run = openGuardedRun(options)
  assert.equal(JSON.parse(readFileSync(join(run.path, 'manifest.json'))).version, 'gate2-run-v4')
  let steps = 0
  while (steps < 62) {
    const next=run.next()
    if(next.arm==='B'&&next.track==='CLOSED-LOOP'&&next.turn_id!=='t1') {
      const history=run.prepare(next).packet.messages.filter(m=>m.role==='assistant')
      assert.ok(history.some(m=>m.content.startsWith('\r\n<|acmi:')))
    }
    const r = await run.execute(run.next()); steps++
    if (r.coordinate.arm === 'D' && r.coordinate.stage === 'marker') {
      assert.equal(r.settlement_outcome, 'diagnostic_censored')
      assert.equal(r.run_disposition, 'continue_next_scheduled_coordinate')
      run = openGuardedRun({ ...options, resume: true })
    }
  }
  assert.ok(d2 > 0); assert.ok(bSeen > 0); assert.equal(sends, steps)
  assert.equal(run.snapshot().halted, false)
  assert.equal(JSON.parse(readFileSync(join(run.path, 'manifest.json'))).version, 'gate2-run-v4')
  const report = importRun({ bundle, root, runId: 'synthetic-run' })
  writeFileSync(join(root, 'synthetic-prefix-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
  assert.equal(report.version, 'gate2-live-import-v2')
  assert.equal(report.scheduled_generations, 576)
  assert.equal(report.diagnostic_groups.reduce((n, g) => n + g.planned_pairs, 0), 36)
  assert.equal(report.diagnostic_groups.reduce((n, g) => n + g.D2.deadline_censored, 0), d2)
  for (const row of report.rows.filter(r => r.settlement.outcome === 'diagnostic_censored')) assert.equal(row.score, null)
  for (const row of report.rows.filter(r => r.coordinate.arm === 'B')) {
    assert.equal(row.marker_schema_valid, true)
    assert.equal(row.legacy_strict_v1_conformant, false)
    assert.equal(row.inline_profile, revision.inline_profile)
  }
  // A request record without a terminal cannot establish whether dispatch
  // occurred. Do not turn a crashed reservation into a free/unattempted slot.
  while (!(run.next().arm === 'D' && run.next().stage === 'marker')) await run.execute(run.next())
  const c = run.next(), prepared = run.prepare(c)
  const manifest = JSON.parse(readFileSync(join(run.path, 'manifest.json')))
  const ledger = openRunLedger({ root, runId: 'synthetic-run', resume: true, freezeHash: bundle.expectedManifestHash, limits: manifest.limits, evidenceKind: manifest.evidenceKind, revision })
  const id = ledger.reserve({ coordinate: c, requestBytes: prepared.request.bytes, answerHash: prepared.compiled.answer_hash, maxCostMicros: null })
  for (const e of [{ kind: 'pre_send', freeze_hash: bundle.expectedManifestHash, coordinate: c, input_packet: prepared.packet }, { kind: 'request', sha256: prepared.request.sha256 }]) ledger.capture({ attemptId: id, channel: 'transport', bytes: JSON.stringify(e), elapsedMs: 0 })
  const interrupted = importRun({ bundle, root, runId: 'synthetic-run' })
  writeFileSync(join(root, 'synthetic-interrupted-report.json'), JSON.stringify(interrupted, null, 2), { flag: 'wx' })
  assert.equal(interrupted.diagnostic_groups.reduce((n, g) => n + g.D2.dispatch_unknown, 0), 1)
  assert.equal(interrupted.rows.at(-1).dispatch_status, 'unknown')
  process.stdout.write('REVISION_SYNTHETIC_EVIDENCE ' + root + '\n')
})

test('runner follows explicit durable disposition and does not infer permission from timeout', async () => {
  let n = 0
  const run = { next: () => n < 2 ? { turn_id: 't' + n } : null, execute: async () => { n++; return { run_disposition: 'continue_next_scheduled_coordinate', settlement_outcome: 'diagnostic_censored', transport: { outcome: 'failed', error_code: 'timeout', evidence_complete: false } } } }
  assert.equal(await executeSchedule(run), 'completed_with_diagnostic_censoring')
  assert.equal(n, 2)
})

test('new revision stays offline-only and rejects altered runtime deadline', () => {
  const bundle = freezeDevelopment({ root, packageId: 'bad-deadline', runtime: { ...runtime, timeout_ms: 360000 }, purpose: 'synthetic-test' })
  assert.throws(() => openGuardedRun({ bundle, root, runId: 'bad', mode: 'offline', fetchImpl: () => assert.fail(), credentialProvider: () => assert.fail() }), /revision|deadline/)
})
