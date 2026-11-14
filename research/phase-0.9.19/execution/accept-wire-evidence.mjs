import assert from 'node:assert/strict'
import { createReadStream, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { createCompletionDecoder } from '../gate2/transport.mjs'
import { createWireAccounting } from '../gate2/wire-accounting.mjs'
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs'

const SOURCE = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4/development'
const ROOT = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-ro-rs-20261115'
const manifest = () => JSON.parse(readFileSync(join(SOURCE, 'manifest.json')))
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', flush: true })
const valueBytes = e => Buffer.from(e.value.bytes_base64, 'base64')
const kind = e => e.kind === 'capture' && e.value.channel === 'transport' ? JSON.parse(valueBytes(e)).kind : null

async function sourceEvents(lastOnly = false) {
  const m = manifest(), out = []
  let previous = hash(readFileSync(join(SOURCE, 'manifest.json'))), seq = 0
  for await (const line of createInterface({ input: createReadStream(join(SOURCE, 'events.jsonl')), crlfDelay: Infinity })) {
    const e = JSON.parse(line), { digest, ...body } = e
    assert.equal(e.seq, ++seq); assert.equal(e.previous, previous); assert.equal(hash(body), digest)
    previous = digest
    if (lastOnly && e.kind === 'reserve') out.length = 0
    out.push(e)
  }
  assert.equal(seq, 99985)
  assert.equal(previous, 'f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924')
  return { events: out, manifest: m, head: previous }
}

function units(events) {
  const out = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (kind(e) === 'wire_delivery') {
      const delivery = JSON.parse(valueBytes(e)), raw = events[++i]
      assert.equal(raw.kind, 'capture'); assert.equal(raw.value.channel, 'wire')
      assert.equal(delivery.sha256, raw.value.sha256)
      const derived = []
      while (['model', 'reasoning'].includes(events[i + 1]?.value.channel)) derived.push(events[++i])
      out.push({ raw: [e, raw], derived, delivery })
    } else out.push({ control: e })
  }
  return out
}

function makeOptions(m, runId, v5) {
  return { root: ROOT, runId, freezeHash: m.freezeHash, limits: m.limits, revision: m.revision,
    evidenceKind: 'offline-boundary-test', ...(v5 ? { storageProtocol: 'raw-first-transaction-v1' } : {}) }
}

function expectedState(events) {
  const attempts = []
  for (const { kind, value: v } of events) {
    if (kind === 'reserve') attempts.push({ ...v, chunks: [], settlement: null })
    else if (kind === 'capture') attempts.at(-1).chunks.push({ ...v })
    else attempts.at(-1).settlement = { ...v }
  }
  return attempts
}

export async function replayWorker(runId, v5, lastOnly) {
  const { events, manifest: m, head } = await sourceEvents(lastOnly)
  const expected = expectedState(events), work = units(events), options = makeOptions(m, runId, v5)
  const ledger = openRunLedger(options), timings = []
  let captureMs = 0, auditMs = 0, rawReads = 0, logical = 0
  const start = performance.now()
  const capture = list => {
    const items = list.map(e => ({ attemptId: e.value.attemptId, channel: e.value.channel, bytes: valueBytes(e), elapsedMs: e.value.elapsedMs }))
    const t = performance.now()
    if (v5) ledger.captureBatch(items)
    else for (const item of items) ledger.capture(item)
    const duration = performance.now() - t
    logical += items.length; captureMs += duration
    return duration
  }
  for (const u of work) {
    if (u.raw) {
      let time = capture(u.raw)
      if (u.derived.length) time += capture(u.derived)
      timings.push(time); rawReads++
    } else {
      const { kind: k, value: v } = u.control
      if (k === 'reserve') ledger.reserve({ coordinate: v.coordinate, requestBytes: Buffer.from(v.request_base64, 'base64'), maxCostMicros: v.maxCostMicros, answerHash: v.answer_sha256 })
      else if (k === 'capture') capture([u.control])
      else {
        const t = performance.now()
        ledger.settle(v); ledger.snapshot()
        auditMs += performance.now() - t
      }
    }
  }
  const elapsed = performance.now() - start, beforeAudit = performance.now()
  const reopened = openRunLedger({ ...options, resume: true }).snapshot()
  auditMs += performance.now() - beforeAudit
  assert.deepEqual(reopened.attempts, expected)
  let index = 0
  for await (const line of createInterface({ input: createReadStream(join(ledger.path, 'events.jsonl')), crlfDelay: Infinity })) {
    const physical = JSON.parse(line)
    for (const e of v5 ? physical.events : [physical]) {
      assert.deepEqual({ kind: e.kind, value: e.value }, { kind: events[index].kind, value: events[index].value }); index++
    }
  }
  assert.equal(index, events.length)
  timings.sort((a, b) => a - b)
  const result = { version: 'offline-storage-replay-v1', model_calls: 0, v5, last_only: lastOnly,
    source_head: head, logical_events_equal: index, attempts_equal: expected.length,
    raw_reads: rawReads, captures: logical, capture_ms: captureMs, audit_ms: auditMs, elapsed_ms: elapsed,
    chunk_p99_ms: timings[Math.ceil(timings.length * .99) - 1],
    max_rss_kib: process.resourceUsage().maxRSS, journal_bytes: statSync(join(ledger.path, 'events.jsonl')).size,
    diagnostics: ledger.diagnostics(), final_halted: reopened.halted,
    timing_scope: 'Unpaced original capture payload service cost; excludes decoder/observational JSON parsing; original timestamps retained, not simulated provider latency.' }
  save(join(ROOT, runId + '.json'), result)
  return result
}

async function verifyPrefixes(outputName = 'prefix-verification.json') {
  const { events } = await sourceEvents(), attempts = expectedState(events), reports = []
  for (const a of attempts) {
    const observer = createWireAccounting(), parser = createCompletionDecoder(), raw = []
    let admitted = 0, bytes = 0, stopped = false, parserMs = 0, observationMs = 0
    const deliveries = a.chunks.filter(c => c.channel === 'transport').map(c => JSON.parse(Buffer.from(c.bytes_base64, 'base64'))).filter(e => e.kind === 'wire_delivery')
    const terminal = a.chunks.filter(c => c.channel === 'transport').map(c => JSON.parse(Buffer.from(c.bytes_base64, 'base64'))).find(e => e.kind === 'terminal')
    const wires = a.chunks.filter(c => c.channel === 'wire')
    assert.equal(wires.length, deliveries.length)
    for (let i = 0; i < wires.length; i++) {
      const b = Buffer.from(wires[i].bytes_base64, 'base64')
      assert.equal(hash(b), deliveries[i].sha256); raw.push(b); bytes += b.length
      if (bytes > 1048576) stopped = true
      if (!stopped && deliveries[i].phase === 'generation') {
        let t = performance.now(); parser.push(b); parserMs += performance.now() - t
        t = performance.now(); observer.submit(b); observationMs += performance.now() - t
        admitted += b.length
      }
    }
    if (terminal.result.transport_complete) { parser.finish(); observer.finish() }
    else assert.equal(stopped, true)
    const p = parser.snapshot()
    for (const [channel, key] of [['model', 'content'], ['reasoning', 'reasoning']]) {
      assert.equal(p[key], Buffer.concat(a.chunks.filter(c => c.channel === channel).map(c => Buffer.from(c.bytes_base64, 'base64'))).toString('utf8'))
    }
    assert.equal(hash(Buffer.concat(raw)), terminal.result.termination.wire_sha256)
    reports.push({ attempt_id: a.attemptId, complete: terminal.result.transport_complete,
      wire_bytes: bytes, submitted_bytes: admitted, unchanged_byte_limit_hit: stopped,
      offline_parser_ms: parserMs, offline_observation_ms: observationMs, observation: observer.snapshot() })
  }
  assert.equal(reports.length, 35); assert.equal(reports.filter(r => r.complete).length, 34)
  // Actual transport replay of the truncated final prefix, fake monotonic clock;
  // no inference of a successful continuation and no outbound networking.
  const a = attempts.at(-1), parts = a.chunks.filter(c => c.channel === 'wire').map(c => Buffer.from(c.bytes_base64, 'base64'))
  const delivered = [], bytes = Buffer.from(a.request_base64, 'base64')
  const response = { status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({
    read: async () => parts.length ? { value: parts.shift(), done: false } : { done: true }, cancel: async () => {} }) } }
  const result = await performDeadlineCompletion({ request: { bytes, sha256: hash(bytes), endpoint: 'https://offline.invalid/replay' }, credential: 'SYNTHETIC',
    fetchImpl: async () => response, clock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} },
    record() {}, recordBatch(es) { delivered.push(...es.filter(e => e.kind === 'wire').map(e => e.bytes)) },
    accounting: true, timeoutMs: 180000, maxResponseBytes: 1048576 })
  assert.equal(result.error_code, 'response_byte_limit'); assert.equal(result.wire_bytes, 1048650)
  assert.equal(delivered.length, 5667); assert.equal(result.content, '')
  assert.equal(result.reasoning, Buffer.concat(a.chunks.filter(c => c.channel === 'reasoning').map(c => Buffer.from(c.bytes_base64, 'base64'))).toString())
  save(join(ROOT, outputName), { model_calls: 0, task_evaluator_calls: 0, reports,
    final_transport: { error_code: result.error_code, wire_bytes: result.wire_bytes, accounting: result.accounting },
    original_partial_remains_partial: true })
}

async function benchmark() {
  const records = []
  for (let pair = 1; pair <= 5; pair++) {
    for (const v5 of pair % 2 ? [false, true] : [true, false]) {
      const name = `pair-${pair}-${v5 ? 'v5' : 'v4'}`
      const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), 'worker', name, v5 ? 'v5' : 'v4', 'last'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
      save(join(ROOT, name + '-process.json'), { exit_code: child.status, stdout: child.stdout, stderr: child.stderr, error: child.error?.message ?? null })
      if (child.status !== 0) throw Error('Benchmark worker failed; do not rerun this series: ' + name)
      const result = JSON.parse(readFileSync(join(ROOT, name + '.json')))
      records.push({ pair, ...result }); console.log(JSON.stringify({ pair, v5, capture_ms: result.capture_ms, audit_ms: result.audit_ms, rss: result.max_rss_kib }))
    }
  }
  const pairs = Array.from({ length: 5 }, (_, i) => {
    const a = records.find(r => r.pair === i + 1 && !r.v5), b = records.find(r => r.pair === i + 1 && r.v5)
    return { pair: i + 1, capture_ratio: b.capture_ms / a.capture_ms, chunk_p99_ratio: b.chunk_p99_ms / a.chunk_p99_ms,
      audit_ratio: b.audit_ms / a.audit_ms, rss_ratio: b.max_rss_kib / a.max_rss_kib,
      append_reduction: 1 - b.diagnostics.append_calls / a.diagnostics.append_calls }
  })
  const median = key => pairs.map(p => p[key]).sort((a, b) => a - b)[2]
  const gates = { append_reduction: pairs.every(p => p.append_reduction >= .30),
    capture_median: median('capture_ratio') <= .80, chunk_p99_each: pairs.every(p => p.chunk_p99_ratio <= 1.25),
    audit_each: pairs.every(p => p.audit_ratio <= 1.25), rss_each: pairs.every(p => p.rss_ratio <= 1.25) }
  save(join(ROOT, 'paired-performance.json'), { model_calls: 0, pairs, records, median_capture_ratio: median('capture_ratio'), gates,
    passed: Object.values(gates).every(Boolean), platform: process.platform, node: process.version,
    cache_control: 'Same host E: filesystem, alternating fresh worker order; OS/device caches not purged. No reruns or selected best trials.' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  globalThis.fetch = () => { throw Error('Network prohibited in offline acceptance') }
  const [mode, runId, format, selection] = process.argv.slice(2)
  if (mode === 'worker') console.log(JSON.stringify(await replayWorker(runId, format === 'v5', selection === 'last')))
  else if (mode === 'prefixes') await verifyPrefixes()
  else if (mode === 'prefixes-final') await verifyPrefixes('prefix-verification-final.json')
  else if (mode === 'benchmark') await benchmark()
  else throw Error('Use prefixes, worker <id> v4|v5 last|all, or benchmark; never a live entry point')
}
