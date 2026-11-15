import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, cpSync, appendFileSync, openSync, closeSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { hash } from '../protocol/contracts.mjs'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { scanTransactions, BINARY_STORAGE } from '../gate2/transaction-frame.mjs'
import { operationTable, fixedResourceProof } from './fixed-workload-contract.mjs'
import { inventoryJournal } from './capacity-workload-inventory.mjs'
import { V4_SHA } from './prepare-transaction-performance.mjs'

const gate = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2'
const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const prior = join(gate, 'offline-capacity-performance-prep-20261115/review-final')
const synthetic = join(gate, 'revision-boundary-uzbkZE/binary-context-synthetic')
const save = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', flush: true })
const walk = p => readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(p, e.name)) : [join(p, e.name)])
const opts = (root, runId) => {
  const m = JSON.parse(readFileSync(join(root, runId, 'manifest.json')))
  return { root, runId, resume: true, freezeHash: m.freezeHash, limits: m.limits,
    revision: m.revision, evidenceKind: m.evidenceKind, storageProtocol: m.storageProtocol }
}
const logicalState = s => ({ attempts: s.attempts, halted: s.halted, budget: s.budget, seq: s.seq })

async function guarded(root, originalV4, factoryPath) {
  const arm = originalV4 ? 'v4' : 'v6', dir = join(root, arm + '-bridge'); mkdirSync(dir)
  const boundaryPath = join(sourceRoot, 'gate2/send-boundary.mjs')
  const original = readFileSync(boundaryPath, 'utf8')
  const adapterPath = join(sourceRoot, 'execution/guarded-comparator-adapter.mjs')
  const facade = `import { openRunLedger as factory } from ${JSON.stringify(pathToFileURL(factoryPath).href)}\n`
    + `import { createLedgerAdapter } from ${JSON.stringify(pathToFileURL(adapterPath).href)}\n`
    + `export const calls = []\nexport const openRunLedger = options => createLedgerAdapter(factory, options, { originalV4: ${originalV4}, calls })\n`
  writeFileSync(join(dir, 'facade.mjs'), facade, { flag: 'wx', flush: true })
  assert.equal(original.split("from './run-ledger.mjs'").length, 2)
  assert.equal(original.split('new Date().toISOString()').length, 2)
  // Derived comparison source only. Original freeze checks remain intact and execute from sourceRoot.
  const derived = original.replaceAll(/from '([^']+)'/g, (_, spec) => {
    const target = spec === './run-ledger.mjs' ? join(dir, 'facade.mjs') : resolve(dirname(boundaryPath), spec)
    return 'from ' + JSON.stringify(pathToFileURL(target).href)
  }).replace('new Date().toISOString()', "'2026-11-15T00:00:00.000Z'")
  writeFileSync(join(dir, 'boundary.mjs'), derived, { flag: 'wx', flush: true })
  const manifestPath = join(synthetic, 'manifest.json'), frozen = readFileSync(manifestPath)
  assert.equal(hash(frozen), '81fbcdc269c950288fd02b1dc433a6e013e8289f61ae20f12997b06d49abd6a2')
  const composite = { original_boundary_sha256: hash(original), derived_boundary_sha256: hash(derived),
    factory_sha256: hash(readFileSync(factoryPath)), adapter_sha256: hash(readFileSync(adapterPath)), facade_sha256: hash(facade),
    fixture_manifest_sha256: hash(frozen), changes: ['ledger factory -> explicit pinned adapter', 'fixture UTC timestamp fixed equally'],
    freeze_verification_removed: false, claim: 'Derived offline comparator, not original frozen runtime identity.' }
  save(join(dir, 'composite-contract.json'), composite)
  const { openGuardedRun } = await import(pathToFileURL(join(dir, 'boundary.mjs')))
  const { calls } = await import(pathToFileURL(join(dir, 'facade.mjs')))
  const operations = [], deliveries = []
  let step = -1, readCalls = 0, eof = 0, fetches = 0
  const wire = Buffer.from('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0,
    delta: { content: 'synthetic answer', reasoning_content: 'synthetic' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n')
  const options = { bundle: { manifestPath, expectedManifestHash: hash(frozen) }, root, runId: arm + '-guarded', mode: 'offline',
    offlineStorageProtocol: originalV4 ? 'raw-first-transaction-v1' : BINARY_STORAGE,
    credentialProvider: () => 'SYNTHETIC', clock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} },
    fetchImpl: async () => {
      fetches++; let sent = false
      return { status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
        read: async () => { readCalls++; if (sent) { eof++; return { done: true } } sent = true
          deliveries.push({ step, index: 0, byte_length: wire.length, sha256: hash(wire) }); return { done: false, value: wire } },
        cancel: async () => {} }) } }
    } }
  const record = (kind, fn) => {
    const first = calls.length, result = fn()
    operations.push({ id: operations.length, step, kind, ledger_first: first, ledger_last: calls.length }); return result
  }
  let run = record('open', () => openGuardedRun(options))
  const outputs = []
  for (step = 0; step < 62; step++) {
    const coordinate = record('next', () => run.next())
    const p = record('prepare_and_compile', () => run.prepare(coordinate))
    const first = calls.length, r = await run.execute(coordinate)
    operations.push({ id: operations.length, step, kind: 'execute_including_second_prepare_compile', ledger_first: first, ledger_last: calls.length })
    assert.equal(r.settlement_outcome, 'success'); assert.equal(r.run_disposition, 'continue_next_scheduled_coordinate')
    outputs.push({ coordinate, packet_hash: hash(p.packet), request_sha256: p.request.sha256,
      answer_hash: p.compiled.answer_hash ?? null, settlement: r.settlement_outcome, disposition: r.run_disposition,
      content: r.transport.content, reasoning: r.transport.reasoning,
      closed_history: p.packet.messages.filter(m => m.role === 'assistant').length })
    if (step === 20) run = record('reopen', () => openGuardedRun({ ...options, resume: true }))
  }
  const state = record('full_snapshot', () => run.snapshot())
  save(join(root, arm + '-guarded-results.json'), outputs)
  operations.push({ id: operations.length, step: null, kind: 'persist_fsync_results', ledger_first: calls.length, ledger_last: calls.length })
  const result = { profile: 'P-G', arm, synthetic: true, performance_evaluation: false, steps: 62,
    reads: deliveries.length, read_calls: readCalls, eof_reads: eof, fetches, deliveries, operations, ledger_calls: calls,
    output_hash: hash(outputs), state_hash: hash(logicalState(state)),
    diagnostic_steps: outputs.filter(o => o.coordinate.arm === 'D').length,
    closed_history_steps: outputs.filter(o => o.closed_history > 0).length,
    full_scans: calls.reduce((n, c) => n + c.full_scans, 0),
    append_calls: calls.reduce((n, c) => n + c.append_calls, 0), flush_requests: calls.reduce((n, c) => n + c.flush_requests, 0),
    journal_bytes: statSync(join(run.path, originalV4 ? 'events.jsonl' : 'transactions.bin')).size, composite }
  save(join(root, arm + '-guarded-operations.json'), result)
  return { result, state, outputs }
}

export async function verifyFixedWorkloads(output) {
  const root = resolve(output)
  assert.equal(dirname(root), resolve(gate, 'offline-workload-bridge-prep-20261115'))
  assert.match(basename(root), /^verification(?:-[a-z0-9]+)?$/); mkdirSync(root)
  globalThis.fetch = () => { throw Error('Network prohibited: offline correctness only') }
  const baselinePath = join(prior, 'baseline-source/gate2/run-ledger.mjs')
  assert.equal(hash(readFileSync(baselinePath)), V4_SHA)
  const { openRunLedger: originalV4 } = await import(pathToFileURL(baselinePath))
  const live = join(gate, 'live-20261115-r4/development')
  const inventory = await inventoryJournal(live, 'f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924')
  const raw = readFileSync(join(live, 'events.jsonl')), events = raw.toString('utf8').trimEnd().split('\n').map(JSON.parse)
  const last = events.findLastIndex(e => e.kind === 'reserve'), pl = operationTable(events.slice(last), 'P-L'), ph = operationTable(events, 'P-H')
  save(join(root, 'P-L-operations.json'), pl); save(join(root, 'P-H-operations.json'), ph)
  // Full archived original writer result versus new candidate writer. No v4 quadratic writer rerun.
  const plRoot = join(root, 'pl'); mkdirSync(plRoot)
  cpSync(join(gate, 'offline-ro-rs-20261115/pair-1-v4'), join(plRoot, 'pair-1-v4'), { recursive: true, errorOnExist: true, force: false })
  const referenceL = originalV4(opts(plRoot, 'pair-1-v4')).snapshot()
  const m = JSON.parse(readFileSync(join(live, 'manifest.json')))
  const l = openRunLedger({ root: plRoot, runId: 'candidate', freezeHash: m.freezeHash, limits: m.limits,
    revision: m.revision, evidenceKind: 'offline-boundary-test', storageProtocol: BINARY_STORAGE })
  for (const op of pl.operations) {
    const es = op.event_indices.map(i => events[last + i])
    if (op.kind === 'reserve') { const v = es[0].value; l.reserve({ coordinate: v.coordinate,
      requestBytes: Buffer.from(v.request_base64, 'base64'), maxCostMicros: v.maxCostMicros, answerHash: v.answer_sha256 }) }
    if (op.kind === 'capture') l.captureBatch(es.map(e => ({ attemptId: e.value.attemptId, channel: e.value.channel,
      bytes: Buffer.from(e.value.bytes_base64, 'base64'), elapsedMs: e.value.elapsedMs })))
    if (op.kind === 'settle') l.settle(es[0].value)
    if (op.kind === 'audit') l.snapshot()
  }
  const reopenedL = openRunLedger(opts(plRoot, 'candidate')).snapshot()
  assert.deepEqual(logicalState(reopenedL), logicalState(referenceL))
  save(join(root, 'P-L-equivalence.json'), { original_v4_sha256: V4_SHA, full_attempt_equal: true,
    reads: pl.reads, logical_events: pl.events, output_hash: hash(logicalState(referenceL)),
    original_writer: 'Archived first original v4 run, copied and audited; not rerun.', candidate_writer: 'Executed once, no timing collected.' })
  console.log('P-L correctness complete; no timing comparison')

  // Incrementally expose byte-identical committed prefixes to both readers. This is not writer performance.
  const phRoot = join(root, 'ph'); mkdirSync(phRoot)
  const binary = join(gate, 'offline-re-ra-rc-20261115/all35-binary-correctness')
  for (const [name, from, file] of [['development', live, 'events.jsonl'], ['all35-binary-correctness', binary, 'transactions.bin']]) {
    mkdirSync(join(phRoot, name)); cpSync(join(from, 'manifest.json'), join(phRoot, name, 'manifest.json'))
    writeFileSync(join(phRoot, name, file), '', { flag: 'wx', flush: true })
  }
  const ends = [], fd = openSync(join(binary, 'transactions.bin'), 'r')
  try { scanTransactions(fd, { initialDigest: hash(readFileSync(join(binary, 'manifest.json'))), onEvent() {},
    onFrame: f => { if (events[f.last - 1].kind === 'settle') ends.push(f.end) } }) } finally { closeSync(fd) }
  assert.equal(ends.length, 35)
  const binaryRaw = readFileSync(join(binary, 'transactions.bin')), rows = []
  let lastLogical = 0, lastBinary = 0, originalOffset = 0, count = 0
  for (const e of events) {
    originalOffset = raw.indexOf(10, originalOffset) + 1
    assert.ok(originalOffset > 0)
    if (e.kind !== 'settle') continue
    appendFileSync(join(phRoot, 'development/events.jsonl'), raw.subarray(lastLogical, originalOffset), { flush: true })
    appendFileSync(join(phRoot, 'all35-binary-correctness/transactions.bin'), binaryRaw.subarray(lastBinary, ends[count]), { flush: true })
    lastLogical = originalOffset; lastBinary = ends[count++]
    const a = originalV4(opts(phRoot, 'development')).snapshot(), b = openRunLedger(opts(phRoot, 'all35-binary-correctness'))
    const summary = b.auditSummary(), selected = b.readAuditedAttempt(summary, [e.value.attemptId])
    assert.deepEqual(selected, [a.attempts.at(-1)])
    assert.equal(summary.halted, a.halted); assert.deepEqual(summary.budget, a.budget); assert.equal(summary.seq, a.seq)
    rows.push({ attempt: count, source_prefix_bytes: originalOffset, binary_prefix_bytes: ends[count - 1],
      selected_hash: hash(selected), seq: a.seq, original_v4_reader_equal: true, extra_materialization_scan_retained: true })
  }
  const a = originalV4(opts(phRoot, 'development')).snapshot(), b = openRunLedger(opts(phRoot, 'all35-binary-correctness')).snapshot()
  assert.deepEqual(logicalState(a), logicalState(b))
  save(join(root, 'P-H-equivalence.json'), { rows, reads: ph.reads, events: ph.events, full_state_hash: hash(logicalState(a)),
    full_reader_equal: true, original_v4_writer_reexecuted: false,
    qualification: '35 exact archived prefixes, full final snapshot and selected materialization; prefix publication bypasses writers explicitly.' })
  console.log('P-H original-v4 prefix readers complete; not an append performance replay')

  const g4 = await guarded(root, true, baselinePath)
  const g6 = await guarded(root, false, join(sourceRoot, 'gate2/run-ledger.mjs'))
  assert.deepEqual(g6.outputs, g4.outputs); assert.deepEqual(logicalState(g6.state), logicalState(g4.state))
  assert.deepEqual(g6.result.deliveries, g4.result.deliveries)
  assert.equal(g4.result.reads, 62); assert.equal(g4.result.read_calls, 124)
  assert.ok(g4.result.diagnostic_steps > 0 && g4.result.closed_history_steps > 0)
  save(join(root, 'P-G-equivalence.json'), { full_state_equal: true, prepared_packets_and_request_bytes_equal: true,
    result_hash: g4.result.output_hash, reads: 62, read_calls: 124, eof_reads: 62, steps: 62,
    original_v4_exact_ledger: true, explicit_comparator_adapter: true, native_unadapted_guarded_baseline: false,
    fixture: 'existing binary-context-synthetic 62 steps, resume after step 21',
    diagnostic_steps: g4.result.diagnostic_steps, closed_history_steps: g4.result.closed_history_steps })
  const GiB = 1024 ** 3
  const profiles = [
    { id: 'P-L', journal_bytes: inventory.last.conservative_journal_bytes, operation_bytes: statSync(join(root, 'P-L-operations.json')).size,
      result_bytes: 4 * inventory.last.conservative_journal_bytes },
    { id: 'P-H', journal_bytes: inventory.conservative_journal_bytes, operation_bytes: statSync(join(root, 'P-H-operations.json')).size,
      result_bytes: 4 * inventory.conservative_journal_bytes },
    { id: 'P-G', journal_bytes: Math.max(g4.result.journal_bytes, g6.result.journal_bytes),
      operation_bytes: Math.max(statSync(join(root, 'v4-guarded-operations.json')).size, statSync(join(root, 'v6-guarded-operations.json')).size),
      result_bytes: 4 * Math.max(g4.result.journal_bytes, g6.result.journal_bytes) }
  ]
  const proof = fixedResourceProof(profiles, { disk_bytes: 16 * GiB, shared_bytes: 2 * GiB,
    failure_reserve_bytes: 2 * GiB, heap_proof: null, time_proof: null })
  save(join(root, 'resource-analysis.json'), { ...proof, suggested_rss_bytes: 8 * GiB, required_free_memory_bytes: 12 * GiB,
    proposed_series_ms: 18 * 3600000, time_proposal_retained_not_certified: true,
    original_v4_append_scan_bytes_upper: { 'P-L': pl.original_v4_append_scan_bytes_upper, 'P-H': ph.original_v4_append_scan_bytes_upper },
    output_contract: 'One journal, one operation report and one result per child; result allocation 4*journal is a proposed schema allowance, not unrestricted stdout.',
    performance_execution_authorized: false })
  const pins = walk(sourceRoot).filter(p => p.endsWith('.mjs')).map(p => ({ path: p.slice(sourceRoot.length), sha256: hash(readFileSync(p)) }))
  save(join(root, 'verification-summary.json'), { version: 'fixed-workload-verification-v1', model_calls: 0,
    performance_runs: 0, development_refreeze: false, performance_readiness: 'BLOCKED', capacity_closed: false,
    reads: { 'P-L': pl.reads, 'P-H': ph.reads, 'P-G': 62 }, original_v4_sha256: V4_SHA,
    baseline_scope: { 'P-L': 'archived original writer + reader', 'P-H': 'archived prefixes + original reader; full append sequence not reexecuted',
      'P-G': 'exact original ledger plus pinned derived guarded adapter' }, resource_blockers: proof.blockers, sources: pins })
  return { root, reads: [pl.reads, ph.reads, 62], performance_readiness: 'BLOCKED', performance_runs: 0, model_calls: 0 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3)
  console.log(JSON.stringify(await verifyFixedWorkloads(process.argv[2])))
}
