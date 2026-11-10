import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { canonical } from '../../packages/core/dist/index.js'
import { offlineQualificationAdapter, runQualificationEvaluation } from '../../integrations/dsh/dist/index.js'
import { buildCorpus, classes, labels, sha, version, seed } from './corpus.mjs'
import { makeEvaluationFixture, retrievalStress } from './benchmark-fixtures.mjs'
import { writeBlindPackets } from './annotation.mjs'

const [command, directory, comparison] = process.argv.slice(2)
assert(['--open', '--freeze', '--final', '--verify'].includes(command) && directory,
  'Usage: benchmark.mjs --open|--freeze|--final|--verify <output> [open-reproduction]')
const output = resolve(directory)
mkdirSync(output, { recursive: true })
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const modes = ['rules', 'scripted', 'adversarial', 'structured', 'abstention-first']
const adapters = Object.fromEntries(modes.map(mode => [mode, offlineQualificationAdapter(mode)]))
const selection = new Set(['continue_current', 'switch_existing'])
const write = (name, value, flag = 'w') => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag })
const read = name => JSON.parse(readFileSync(join(output, name), 'utf8'))
const ratio = (a, b) => b ? a / b : null
const stable = rows => rows.map(({ elapsedMs: _elapsed, ...row }) => row)
const dist = rows => {
  const a = rows.toSorted((x, y) => x - y)
  return a.length ? { n: a.length, p50: a[Math.ceil(a.length * 0.5) - 1], p95: a[Math.ceil(a.length * 0.95) - 1], max: a.at(-1) } : { n: 0 }
}
const open = [
  ...(await import('./corpus-open.mjs')).openCases,
  ...(await import('./corpus-open-extra.mjs')).extraCases,
]
const corpus = command === '--open' ? buildCorpus(open, false)
  : buildCorpus([...open, ...(await import('./corpus-holdout.mjs')).holdoutCases], true)
function evaluatorHash() {
  const dirs = ['packages/contracts/src', 'packages/core/src', 'integrations/dsh/src']
  const files = dirs.flatMap(dir => readdirSync(join(repo, dir)).filter(f => f.endsWith('.ts')).map(f => dir + '/' + f))
  for (const dir of ['packages/contracts/dist', 'packages/core/dist', 'integrations/dsh/dist']) {
    files.push(...readdirSync(join(repo, dir)).filter(f => f.endsWith('.js')).map(f => dir + '/' + f))
  }
  files.push('package.json', 'pnpm-lock.yaml', 'tsconfig.base.json')
  files.push(...['annotation', 'benchmark', 'benchmark-fixtures', 'corpus'].map(f => 'scripts/phase-0.9.1/' + f + '.mjs'))
  return sha(canonical(files.sort().map(path => [path, sha(readFileSync(join(repo, path), 'utf8').replace(/\r\n/g, '\n'))])))
}
const freeze = { version, seed, evaluatorHash: evaluatorHash(), corpusHash: corpus.manifest.corpusHash,
  holdoutHash: corpus.manifest.partitions.holdout.hash, holdoutCases: corpus.manifest.partitions.holdout.count,
  openHash: sha(canonical(corpus.rows.filter(row => row.split !== 'holdout'))), protocol: 'final-holdout-single-consumption-v1' }

async function evaluate(scenarios) {
  const rows = []
  const retrievalMs = [], visited = [], examined = [], routing = []
  for (const c of scenarios) {
    const fixture = makeEvaluationFixture(c)
    const start = performance.now()
    const retrieval = fixture.lookup()
    retrievalMs.push(performance.now() - start)
    visited.push(retrieval.postingsVisited)
    examined.push(retrieval.examined)
    const order = retrieval.candidates.map(x => x.taskId)
    const correct = c.expected.retrievalTarget
    const pos = correct ? order.indexOf(correct) + 1 : null
    const leaked = order.filter(id => c.tasks.find(x => x.taskId === id)?.foreign || !c.tasks.some(x => x.taskId === id))
    assert.equal(leaked.length, 0)
    routing.push({ caseId: c.id, split: c.split, family: c.family, target: correct, pos, candidates: order, unauthorized: leaked.length,
      revision: retrieval.revision, examined: retrieval.examined, postingsVisited: retrieval.postingsVisited })
    for (const mode of modes) {
      const value = await runQualificationEvaluation(adapters[mode], fixture.packetInput(retrieval),
        c.turns.length > 8 ? { budget: 3200 } : {})
      assert.equal(value.realProviderRequests, 0)
      if (mode === 'adversarial' && value.guard.status === 'qualified') throw new Error('Adversarial response passed schema/evidence/scope')
      assert(value.guard.changes.every(change => !['task-closed', 'join-satisfied', 'mainline-advanced'].includes(change.kind)
        && !(change.kind === 'result-reviewed' && change.stage === 'accepted')))
      rows.push({ caseId: c.id, family: c.family, language: c.language, split: c.split, risk: c.risk, mode,
        expected: c.expected.intent, expectedTaskId: c.expected.taskId, expectedClaims: c.expected.changes,
        expectedUnresolved: c.expected.unresolved, prediction: value.prediction ?? null,
        guard: value.guard, error: value.error ?? null, responseHash: value.responseHash,
        provenance: value.provenance, packetUnits: value.packetUnits, omittedTurns: value.omittedTurns, elapsedMs: value.elapsedMs })
    }
  }
  return { rows, routing, retrievalMs, visited, examined }
}

function classMetrics(rows) {
  const observed = r => r.prediction?.intent ?? 'invalid'
  const predictions = [...classes, 'invalid']
  const confusion = Object.fromEntries(classes.map(k => [k, Object.fromEntries(predictions.map(p =>
    [p, rows.filter(r => r.expected === k && observed(r) === p).length]))]))
  const perClass = Object.fromEntries(classes.map(k => {
    const tp = confusion[k][k]
    const fp = classes.filter(p => p !== k).reduce((n, p) => n + confusion[p][k], 0)
    const fn = predictions.filter(p => p !== k).reduce((n, p) => n + confusion[k][p], 0)
    return [k, { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) }]
  }))
  let tp = 0, fp = 0, fn = 0
  for (const row of rows) {
    const guessed = new Set(row.prediction?.claims ?? []), expected = new Set(row.expectedClaims)
    tp += [...guessed].filter(x => expected.has(x)).length
    fp += [...guessed].filter(x => !expected.has(x)).length
    fn += [...expected].filter(x => !guessed.has(x)).length
  }
  const wrongTask = r => selection.has(r.expected) && selection.has(observed(r)) && r.prediction?.taskId !== r.expectedTaskId
  const withheld = rows.filter(r => r.guard.status === 'withheld')
  return { n: rows.length, confusion, perClass, calibration: 'not_calibrated_no_probabilities',
    abstention: rows.filter(r => observed(r) === 'uncertain').length, invalid: rows.filter(r => observed(r) === 'invalid').length,
    wrongTaskUuid: rows.filter(wrongTask).length,
    falseMerge: rows.filter(r => wrongTask(r) || r.expected === 'create_new' && selection.has(observed(r))).length,
    falseSplit: rows.filter(r => selection.has(r.expected) && observed(r) === 'create_new').length,
    noTaskFalsePositive: perClass.no_task.fp, noTaskFalseNegative: perClass.no_task.fn,
    uncertainForcedIntoTask: rows.filter(r => r.expected === 'uncertain' && (selection.has(observed(r)) || observed(r) === 'create_new')).length,
    rawClaims: { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) },
    decisionFalseAcceptanceAttempts: rows.filter(r => r.prediction?.claims.includes('decision-accepted') && !r.expectedClaims.includes('decision-accepted')).length,
    resultUnsupportedAttempts: rows.filter(r => r.prediction?.claims.includes('result-observed') && !r.expectedClaims.includes('result-observed')).length,
    falseDependencyAttempts: rows.filter(r => r.prediction?.claims.includes('dependency') && !r.expectedClaims.includes('dependency')).length,
    acceptedSafeClaims: rows.reduce((n, r) => n + r.guard.changes.length, 0),
    guard: { qualified: rows.length - withheld.length, withheld: withheld.length,
      withheldByReason: Object.fromEntries([...new Set(withheld.flatMap(r => r.guard.reasons))].sort()
        .map(reason => [reason, withheld.filter(r => r.guard.reasons.includes(reason)).length])) } }
}
function summarize(rows, routing) {
  const partitions = ['all', 'development', 'validation', 'holdout']
  const intent = Object.fromEntries(modes.map(mode => [mode, Object.fromEntries(partitions.map(split =>
    [split, classMetrics(rows.filter(r => r.mode === mode && (split === 'all' || r.split === split)))]))]))
  const retrieval = Object.fromEntries(partitions.map(split => {
    const all = routing.filter(r => split === 'all' || r.split === split)
    const targeted = all.filter(r => r.target)
    const hit = k => targeted.filter(r => r.pos !== null && r.pos > 0 && r.pos <= k).length
    return [split, { n: all.length, targeted: targeted.length, top1: hit(1), top3: hit(3), top8: hit(8),
      top1Recall: ratio(hit(1), targeted.length), top3Recall: ratio(hit(3), targeted.length), top8Recall: ratio(hit(8), targeted.length),
      missing: targeted.length - hit(8), unauthorized: all.reduce((n, r) => n + r.unauthorized, 0) }]
  }))
  return { intent, retrieval }
}

async function performancePairs(scenarios) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-091-perf-')))
  const file = join(temp, 'synthetic-history.jsonl')
  const prefix = Array.from({ length: 2048 }, (_, i) => JSON.stringify({ seq: i, kind: 'unrelated-synthetic-chunk', payload: 'x'.repeat(240) })).join('\n') + '\n'
  const incremental = [], full = [], bytes = []
  try {
    for (const scenario of scenarios.slice(0, 72)) {
      const fixture = makeEvaluationFixture(scenario)
      const input = fixture.packetInput(fixture.lookup())
      writeFileSync(file, prefix + input.dialogue.map((turn, i) => JSON.stringify({ seq: 2048 + i, turn })).join('\n'))
      const start = performance.now()
      const a = await runQualificationEvaluation(adapters.structured, input)
      incremental.push(performance.now() - start)
      const fullStart = performance.now()
      const raw = readFileSync(file)
      const replay = raw.toString('utf8').split('\n').map(line => JSON.parse(line)).filter(row => row.turn).map(row => row.turn)
      const b = await runQualificationEvaluation(adapters.structured, { ...input, dialogue: replay })
      full.push(performance.now() - fullStart)
      bytes.push(raw.length)
      assert.equal(a.responseHash, b.responseHash)
    }
  } finally {
    const parent = realpathSync(tmpdir())
    assert.equal(dirname(temp), parent)
    assert.match(temp.slice(parent.length + 1), /^acmi-091-perf-[A-Za-z0-9]+$/u)
    rmSync(temp, { recursive: true, force: true })
  }
  const scale = retrievalStress().map(({ size, lookup }) => {
    const latencies = []
    let maxVisited = 0, maxExamined = 0
    for (let i = 0; i < 96; i++) {
      const start = performance.now()
      const result = lookup()
      latencies.push(performance.now() - start)
      maxVisited = Math.max(maxVisited, result.postingsVisited)
      maxExamined = Math.max(maxExamined, result.examined)
    }
    return { catalogSize: size, p: dist(latencies), maxVisited, maxExamined }
  })
  return { incrementalMs: dist(incremental), fullSyntheticParseMs: dist(full), fullBytes: dist(bytes), incrementalHistoricalBytes: 0, scale }
}

function outputResults(data, performanceData, once) {
  const summary = summarize(data.rows, data.routing)
  const stats = { version, seed, corpusHash: corpus.manifest.corpusHash, evaluatorHash: freeze.evaluatorHash, labelProvenance: labels,
    human_review_status: 'pending', real_model_evaluation_status: 'pending', providerRequests: 0,
    qualification: { Q0: 'see executable safety tests', Q1: 'synthetic-provisional-only',
      Q2: 'pending-human-review', Q3: 'pending-explicit-provider-authorization', Q4: 'see stock dsh shadow logs' },
    holdoutRuns: once ? 1 : 0, stableResultHash: sha(canonical([stable(data.rows), data.routing, summary])),
    summary, performance: { retrievalMs: dist(data.retrievalMs), postingsVisited: dist(data.visited), examined: dist(data.examined),
      packetUnits: dist(data.rows.map(r => r.packetUnits)), evaluatorLatencyMs: dist(data.rows.map(r => r.elapsedMs)), ...performanceData },
    safety: { unauthorizedCandidates: 0, adversarialQualified: data.rows.filter(r => r.mode === 'adversarial' && r.guard.status === 'qualified').length,
      modelDirectWrites: 0, automaticBindings: 0, resultAcceptance: 0, joinSatisfaction: 0, taskClosure: 0 },
    rows: data.rows, candidateRuns: data.routing }
  write('results.json', stats)
  write('split-manifest.json', corpus.manifest)
  write('scenarios.json', corpus.rows)
  write('confusion-matrices.json', Object.fromEntries(modes.map(mode => [mode, Object.fromEntries(
    Object.entries(summary.intent[mode]).map(([split, m]) => [split, m.confusion]))])))
  const hashes = [['corpus', corpus.manifest.corpusHash], ...Object.entries(corpus.manifest.partitions).map(([k, v]) => [k, v.hash]),
    ['evaluator', freeze.evaluatorHash], ['stable-results', stats.stableResultHash]]
  writeFileSync(join(output, 'corpus-hashes.txt'), hashes.map(([name, value]) => value + '  ' + name).join('\n') + '\n')
  console.log(JSON.stringify({ scenarios: corpus.rows.length, modeRows: data.rows.length, holdoutRuns: stats.holdoutRuns,
    stableResultHash: stats.stableResultHash, corpusHash: stats.corpusHash, retrieval: summary.retrieval,
    performance: stats.performance, safety: stats.safety }, null, 2))
}

if (command === '--freeze') {
  write('holdout-freeze.json', freeze, 'wx')
  console.log(JSON.stringify({ ...freeze, leakage: corpus.manifest.checks }, null, 2))
} else if (command === '--open') {
  const data = await evaluate(corpus.rows)
  outputResults(data, await performancePairs(corpus.rows), false)
} else if (command === '--final') {
  assert.deepEqual(read('holdout-freeze.json'), freeze, 'Evaluator or corpus changed after freeze')
  assert(!existsSync(join(output, 'holdout-consumed.json')), 'Reserved holdout already consumed in this evidence root')
  const openRows = corpus.rows.filter(row => row.split !== 'holdout')
  const data = await evaluate(openRows)
  const perf = await performancePairs(openRows)
  write('holdout-consumed.json', { ...freeze, startedAt: new Date().toISOString(), note: 'Exclusive single invocation before first held-out case' }, 'wx')
  const held = await evaluate(corpus.rows.filter(row => row.split === 'holdout'))
  for (const key of Object.keys(data)) data[key].push(...held[key])
  outputResults(data, perf, true)
  const annotation = join(output, '..', 'annotation')
  mkdirSync(annotation, { recursive: true })
  writeBlindPackets(corpus.rows, annotation)
} else {
  const results = read('results.json')
  assert.deepEqual(read('holdout-freeze.json'), freeze)
  const { startedAt, note, ...consumed } = read('holdout-consumed.json')
  assert.deepEqual(consumed, freeze)
  assert(Number.isFinite(Date.parse(startedAt)) && typeof note === 'string')
  assert.equal(results.holdoutRuns, 1)
  assert.equal(results.evaluatorHash, freeze.evaluatorHash)
  assert.equal(results.corpusHash, corpus.manifest.corpusHash)
  assert.deepEqual(read('scenarios.json'), corpus.rows)
  assert.equal(results.rows.length, corpus.rows.length * modes.length)
  assert.equal(results.stableResultHash, sha(canonical([stable(results.rows), results.candidateRuns, results.summary])))
  if (comparison) {
    const openRun = JSON.parse(readFileSync(join(resolve(comparison), 'results.json'), 'utf8'))
    assert.equal(openRun.holdoutRuns, 0)
    assert.deepEqual(stable(results.rows.filter(r => r.split !== 'holdout')), stable(openRun.rows))
    assert.deepEqual(results.candidateRuns.filter(r => r.split !== 'holdout'), openRun.candidateRuns)
  }
  console.log('Verified committed evaluator, corpus and archived held-out result without re-evaluating the holdout.')
}
