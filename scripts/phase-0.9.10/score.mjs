import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const digest = s => createHash('sha256').update(s).digest('hex')
const empty = ['new', 'unresolved', 'no_task']
const identity = x => typeof x === 'string' && !empty.includes(x)
const ratio = (n, d) => d === 0 ? null : n / d
const count = (a, p) => a.filter(p).length
const sum = (a, key) => a.reduce((n, x) => n + x[key], 0)
const inc = (o, k) => { if (k !== undefined && k !== null) o[k] = (o[k] ?? 0) + 1 }
const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(q * values.length) - 1] : null
const rates = values => ({ p50: quantile(values, 0.5), p95: quantile(values, 0.95) })
const parse = raw => { try { return JSON.parse(raw) } catch { return null } }
const file = (dir, name) => join(dir, name)
const rows = (dir, name) => existsSync(file(dir, name))
  ? readFileSync(file(dir, name), 'utf8').split(/\r?\n/u).filter(Boolean).map(s => JSON.parse(s)) : []

function identityStats(records, key, expected) {
  const positive = records.filter(r => identity(r[expected]))
  const covered = records.filter(r => identity(r[key]))
  const coveredPositive = positive.filter(r => identity(r[key]))
  const right = count(records, r => r[key] === r[expected])
  const coveredRight = count(covered, r => r[key] === r[expected])
  const noTaskRight = count(records, r => r[key] === 'no_task' && r[expected] === 'no_task')
  const abstained = count(records, r => r[key] === 'unresolved')
  return { n: records.length, exact: right, exactRate: ratio(right, records.length), positive: positive.length,
    covered: covered.length, coveredPositive: coveredPositive.length, coverage: ratio(coveredPositive.length, positive.length),
    coveredExact: coveredRight, selectiveAccuracy: ratio(coveredRight, covered.length),
    abstained, abstentionRate: ratio(abstained, records.length), missing: count(records, r => r[key] == null),
    wrongTask: count(coveredPositive, r => r[key] !== r[expected]),
    falseMerge: count(covered, r => r[key] !== r[expected]), falseSplit: count(positive, r => r[key] === 'new'),
    highRiskFalseMerge: count(covered, r => r[key] !== r[expected] && ['closed', 'missing', 'unauthorized-injection', 'similar'].includes(r.family)),
    noTaskPrecision: ratio(noTaskRight, count(records, r => r[key] === 'no_task')),
    noTaskRecall: ratio(noTaskRight, count(records, r => r[expected] === 'no_task')),
    unresolvedRecall: ratio(count(records, r => r[key] === 'unresolved' && r[expected] === 'unresolved'),
      count(records, r => r[expected] === 'unresolved')) }
}

function stats(records, attempts, completions) {
  const user = identityStats(records, 'user', 'expectedUser')
  const response = identityStats(records, 'response', 'expectedResponse')
  const support = {}
  const targetPosition = {}, selectedPosition = {}, selectedHandle = {}, correctPosition = {}
  for (const r of records) {
    inc(targetPosition, r.targetPosition); inc(selectedPosition, r.selectedPosition); inc(selectedHandle, r.rawHandle)
    if (r.user === r.expectedUser) inc(correctPosition, r.targetPosition)
    const s = r.support ?? 'missing'
    support[s] ??= { count: 0, correct: 0 }
    support[s].count++
    support[s].correct += Number(r.user === r.expectedUser)
  }
  const continuity = {}
  for (const family of ['aba', 'abca', 'cross']) {
    const subset = records.filter(r => r.family === family)
    const storyIds = [...new Set(subset.map(r => r.story))]
    continuity[family] = { stories: storyIds.length, fullyExact: count(storyIds, s => {
      const turns = subset.filter(r => r.story === s)
      return turns.length === 4 && turns.every(r => r.user === r.expectedUser)
    }), returnTurns: count(subset, r => r.turn >= 3), returnExact: count(subset, r => r.turn >= 3 && r.user === r.expectedUser) }
  }
  const measured = records.filter(r => r.nativePresent)
  const totalTokens = sum(completions.map(r => r.usage), 'totalTokens')
  return { user, response, support, continuity, responseWorkNode: { n: count(records, r => r.expectedWork !== null),
    correct: count(records, r => r.expectedWork !== null && r.work === r.expectedWork) },
  protocol: { records: records.length, nativeCompleted: count(measured, r => r.nativeCompleted),
    parsed: count(records, r => r.parsed), validated: count(records, r => r.validated),
    rawSameGenerationFields: count(records, r => r.rawSameGenerationFields),
    sameGeneration: count(records, r => r.sameGeneration), truncated: count(records, r => r.truncated),
    metadataLeaks: count(measured, r => r.metadataLeak), unexpectedMutation: count(measured, r => r.unexpectedMutation),
    nativeToolTurnsExpected: count(measured, r => r.toolExpected > 0),
    nativeToolTurnsPassed: count(measured, r => r.toolExpected > 0 && r.toolOK) },
  answer: { assertions: count(measured, r => r.assertions > 0), passed: count(measured, r => r.answerOK === true),
    rawFieldPassed: count(measured, r => r.rawAnswerOK === true),
    characters: rates(measured.map(r => r.answerLength)), naturalLanguageQuality: null },
  actions: { expected: sum(records, 'toolExpected'), executed: sum(records, 'toolExecuted'),
    exact: sum(records, 'actionExact'), missing: sum(records, 'actionMissing'),
    wrong: sum(records, 'actionWrong'), inherited: sum(records, 'inherited'), results: sum(records, 'toolResults') },
  rawDiagnostics: { taskHandleExact: count(records, r => r.rawTaskExact), responseHandleExact: count(records, r => r.rawResponseExact),
    workHandleExact: count(records, r => r.rawWorkExact), rawActionExact: sum(records, 'rawActionExact'),
    rawActionsEmitted: sum(records, 'rawActionsEmitted') },
  related: { expectedMulti: count(records, r => r.relatedExpected > 0), exactMulti: count(records, r => r.relatedExpected > 0 && r.relatedExact) },
  positions: { targetPosition, selectedPosition, selectedHandle, correctPosition,
    accuracy: Object.fromEntries(Object.entries(targetPosition).map(([k, n]) => [k, ratio(correctPosition[k] ?? 0, n)])) },
  performance: { attempted: attempts.length, completed: completions.length,
    inputTokens: sum(completions.map(r => r.usage), 'inputTokens'), outputTokens: sum(completions.map(r => r.usage), 'outputTokens'),
    totalTokens, peakInputTokens: completions.length ? Math.max(...completions.map(r => r.usage.inputTokens)) : null,
    generationLatencyMs: rates(completions.map(r => r.latencyMs)), turnLatencyMs: rates(measured.map(r => r.turnLatencyMs)) } }
}

export function score(inputs, goldRows, native, ledger, run) {
  const gold = new Map(goldRows.map(g => [g.id, g]))
  const caseById = new Map(inputs.map(g => [g.id, g]))
  const attempts = ledger.filter(x => x.kind === 'attempt')
  const completed = ledger.filter(x => x.kind === 'complete')
  const aByTicket = new Map(attempts.map(a => [a.ticket, a]))
  const cByTicket = new Map(completed.map(c => [c.ticket, c]))
  assert.equal(new Set(attempts.map(a => a.generation)).size, attempts.length, 'Duplicate generation')
  assert.equal(cByTicket.size, completed.length, 'Duplicate completion')
  assert(attempts.every((a, i) => a.ticket === i + 1), 'Attempt sequence is not continuous')
  const used = new Set()
  for (const record of native) {
    for (const s of record.steps) {
      const a = aByTicket.get(s.ticket), c = cByTicket.get(s.ticket)
      assert(a && c && !used.has(s.ticket), 'Unmatched or duplicate native generation')
      assert.equal(a.generation, s.generation)
      assert.equal(c.generation, s.generation)
      assert.equal(a.id, record.id)
      assert.equal(c.id, record.id)
      assert.equal(a.requestDigest, s.requestDigest)
      assert.equal(c.responseDigest, digest(s.raw))
      assert.deepEqual(c.usage, s.usage)
      assert.equal(c.stop, s.stop)
      used.add(s.ticket)
    }
  }
  const details = []
  for (const r of native.filter(n => n.stage !== 'attribution')) {
    const g = gold.get(r.id), item = caseById.get(r.id)
    assert(g && item, 'Unknown native input ID')
    const paired = r.arm === 'C' ? native.find(x => x.id === r.id && x.stage === 'attribution')?.steps[0] : null
    const step = r.steps[0]
    const att = r.arm === 'C' ? paired : step
    const p = att?.proposal
    const inferred = r.arm === 'A' ? step?.inherited : p
    const raw = parse(att?.raw ?? '')
    const rawAnswer = parse(step?.raw ?? '')?.assistant_response
    const rawMeta = raw?.acmi_attribution
    const rawActions = Array.isArray(raw?.actions) ? raw.actions : []
    const rawTarget = handle => Object.hasOwn(g.tasks, handle) ? g.tasks[handle].taskId : null
    const rawActionExact = count(g.calls, x => rawActions.some(a => a?.key === x.key && rawTarget(a.task) === x.taskId
      && Object.values(g.tasks).some(y => y.workId === x.workId && y.workHandle === a.work)))
    const rawHandle = raw?.acmi_attribution?.user ?? (r.arm === 'A' ? item.binding : null)
    const selected = item.candidates.findIndex(c => c.task === rawHandle)
    const answers = r.native.assistant.map(a => a.text).join('\n')
    const calls = r.native.calls.map(call => ({ ...call, key: parse(call.arguments)?.key }))
    const taskFor = call => step?.actions?.find(a => a.callId === call?.callId)
    const resultFor = call => r.native.results.find(x => x.callId === call?.callId && !x.isError)
    const expectedResult = k => k === 'amber' ? 'amber=17' : 'indigo=29'
    const actionExact = count(g.calls, x => {
      const observed = calls.find(c => c.key === x.key)
      const action = taskFor(observed)
      return observed && action?.task === x.taskId && action?.work === x.workId
    })
    const actionMissing = count(g.calls, x => !taskFor(calls.find(c => c.key === x.key)))
    const inherited = count(r.native.results, x => {
      const original = calls.find(c => c.callId === x.callId), action = taskFor(original)
      return original && action && x.inherits?.generation === step.generation && x.inherits?.callId === original.callId
        && x.inherits.task === action.task && x.inherits.work === action.work && x.inherits.ref === action.ref
        && x.inherits.causation === r.native.session + ':' + original.seq && original.seq < x.seq
    })
    const user = r.arm === 'A' ? inferred?.task : inferred?.user
    const response = r.arm === 'A' ? inferred?.task : inferred?.response
    const relatedExact = p && JSON.stringify([...p.related].sort()) === JSON.stringify([...g.related].sort())
    const endOK = r.native.end === 'completed'
    const proof = r.arm === 'B' && p?.generation === step?.generation && p?.sourceUserTurn === r.native.user?.ref
      && r.native.assistant.some(x => x.text === step?.answer && JSON.stringify(x.usage) === JSON.stringify(step.usage))
      && p.generation === raw?.acmi_attribution?.generation_ref
    details.push({ id: r.id, group: r.group, arm: r.arm, variant: item.variant, family: item.family,
      story: item.story, turn: item.turn, expectedUser: g.user, expectedResponse: g.response, expectedWork: g.work,
      user: user ?? null, response: response ?? null, work: inferred?.work ?? null, support: p?.support ?? null,
      rawHandle, selectedPosition: selected < 0 ? null : selected + 1, targetPosition: g.targetPosition,
      relatedExpected: g.related.length, relatedExact: Boolean(relatedExact), nativePresent: true, nativeCompleted: endOK,
      parsed: raw !== null, validated: Boolean(r.arm === 'A' ? inferred : p), sameGeneration: Boolean(proof),
      rawSameGenerationFields: Boolean(r.arm === 'B' && typeof rawAnswer === 'string' && rawMeta
        && rawMeta.generation_ref === step?.generation && rawMeta.source_user_turn_ref === r.native.user?.ref),
      rawTaskExact: identity(g.user) && rawTarget(rawMeta?.user) === g.user,
      rawResponseExact: identity(g.response) && rawTarget(rawMeta?.response) === g.response,
      rawWorkExact: g.work !== null && Object.values(g.tasks).some(x => x.workId === g.work && x.workHandle === rawMeta?.work),
      rawActionsEmitted: rawActions.length, rawActionExact,
      truncated: att?.stop === 'limit', metadataLeak: r.metadataLeak, unexpectedMutation: !Object.values(r.unchanged).every(Boolean),
      answerLength: answers.length, assertions: g.assertions.length, answerOK: g.assertions.length
        ? endOK && g.assertions.every(s => answers.toLowerCase().includes(s.toLowerCase())) : null,
      rawAnswerOK: g.assertions.length ? typeof rawAnswer === 'string'
        && g.assertions.every(s => rawAnswer.toLowerCase().includes(s.toLowerCase())) : null,
      toolExpected: g.calls.length, toolExecuted: calls.length, toolResults: r.native.results.length,
      toolOK: calls.length === g.calls.length && g.calls.every((x, i) => calls[i]?.key === x.key && resultFor(calls[i])?.text === expectedResult(x.key)),
      actionExact, actionMissing, actionWrong: g.calls.length - actionExact - actionMissing, inherited,
      turnLatencyMs: r.latencyMs + (paired?.latencyMs ?? 0), error: att?.error ?? r.error ?? null })
  }
  const pick = (group, arm, variant = 'base') => {
    const ac = x => x.group === group && (x.arm === arm || (arm === 'C' && x.arm === 'A'))
      && (caseById.get(x.id)?.variant === variant || variant === 'permutations' && caseById.get(x.id)?.variant !== 'base')
    return stats(details.filter(ac), attempts.filter(ac), completed.filter(ac))
  }
  const pilot = pick('pilot', 'B')
  const A = pick('main', 'A'), B = pick('main', 'B'), C = pick('control', 'C'), permutations = pick('main', 'B', 'permutations')
  const variations = details.filter(d => d.variant !== 'base').map(d => {
    const base = details.find(x => x.group === 'main' && x.arm === 'B' && x.id === d.id.replace(/:[^:]+$/u, ':base'))
    return { id: d.id, variant: d.variant, consistent: Boolean(base && d.user !== null && d.user === base.user) }
  })
  return { provenance: run.provenance, status: run.stopped, pilotGatePassed: run.pilotPassed, missingNativeCompletions: completed.length - used.size,
    pilot, arms: { A, B, C }, permutations, permutationConsistency: {
      comparisons: variations.length, consistent: count(variations, v => v.consistent), variations },
    details }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, runDir, out] = process.argv.slice(2)
  assert(corpus && runDir && out, 'Usage: node score.mjs <corpus directory> <run directory> <new output JSON>')
  const run = JSON.parse(readFileSync(file(runDir, 'run-summary.json'), 'utf8'))
  for (const [name, expected] of [['model-inputs.jsonl', run.hashes.inputs], ['ground-truth.jsonl', run.hashes.groundTruth]]) {
    assert.equal(digest(readFileSync(file(corpus, name))), expected, 'Corpus hash mismatch')
  }
  const result = score(rows(corpus, 'model-inputs.jsonl'), rows(corpus, 'ground-truth.jsonl'),
    rows(runDir, 'native-results.jsonl'), rows(runDir, 'generation-ledger.jsonl'), run)
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
}
