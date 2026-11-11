import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluate } from '../phase-0.9.7/benchmark.mjs'
import { scoreOfflineBatch } from '../phase-0.9.7/replay.mjs'
import cfg from './config.json' with { type: 'json' }
import { sha } from './policy.mjs'

const [run, benchmark, output, ...extra] = process.argv.slice(2)
assert(run && benchmark && output && !extra.length, 'Usage: node score-local.mjs <run-dir> <0.9.7-benchmark-dir> <new-report.json>')
const read = (dir, name) => {
  const file = join(dir, name)
  assert(statSync(file).size <= 1024 * 1024)
  return readFileSync(file, 'utf8')
}
const load = (dir, name) => JSON.parse(read(dir, name))
const preflight = load(run, 'preflight.json')
const runtime = load(run, 'run-summary.json')
const responses = load(run, 'local-responses.json')
const ledger = read(run, 'generation-ledger.jsonl').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
assert.equal(preflight.modelSha256, cfg.modelSha256)
assert.equal(preflight.runtimeExeSha256, cfg.runtimeExeSha256)
assert.equal(preflight.requestsDigest, cfg.requestsDigest)
assert.equal(runtime.externalProviderRequests, 0)
const key = row => JSON.stringify([row.storyId, row.mode])
const oracle = load(benchmark, 'oracle.separate.json')
assert.equal(sha(JSON.stringify(oracle)), cfg.oracleDigest, 'frozen oracle changed')
const attempts = ledger.filter(r => r.kind === 'attempt')
const completions = ledger.filter(r => r.kind === 'completed')
assert.equal(attempts.length, runtime.started)
assert.equal(completions.length, runtime.completed)
assert.equal(completions.length, responses.records.length)
assert(attempts.length <= cfg.maxGenerations)
assert.equal(new Set(attempts.map(key)).size, attempts.length)
assert.equal(new Set(completions.map(key)).size, completions.length)
const plans = new Map(preflight.inputs.map(r => [key(r), r]))
assert.equal(plans.size, cfg.maxGenerations)
for (const [i, attempt] of attempts.entries()) {
  const p = preflight.inputs[i]
  assert.equal(key(attempt), key(p))
  assert.equal(attempt.requestDigest, p.requestDigest)
  assert.equal(attempt.promptTokens, p.promptTokens)
}
for (const [i, item] of completions.entries()) {
  const r = responses.records[i], p = plans.get(key(item))
  assert.equal(key(r), key(item))
  assert.equal(item.requestDigest, p.requestDigest)
  assert.equal(r.requestDigest, p.requestDigest)
  assert.equal(item.inputTokens, p.promptTokens)
  assert(item.outputTokens >= 0 && item.outputTokens <= cfg.maxOutputTokens)
  assert.equal(sha(r.raw), item.outputDigest)
}
assert.equal(runtime.promptTokens, attempts.reduce((n, r) => n + r.promptTokens, 0))
assert.equal(runtime.outputTokens, completions.reduce((n, r) => n + r.outputTokens, 0))
assert.equal(runtime.totalTokens, runtime.promptTokens + runtime.outputTokens)
assert(runtime.totalTokens <= cfg.maxTotalTokens)

const { rows, metrics } = evaluate()
const author = rows.map(({ storyId, split, family, language, mode, expected }) => ({ storyId, split, family, language, mode, expected }))
assert.equal(sha(JSON.stringify(author)), cfg.oracleDigest, 'scorer does not reproduce frozen reference')
const replay = scoreOfflineBatch(rows, responses)
const byKey = new Map(responses.records.map(r => [key(r), r]))
const resultByKey = new Map(replay.outcomes.map(r => [key(r), r]))
const analyses = rows.map(r => {
  let raw
  try { raw = JSON.parse(byKey.get(key(r))?.raw ?? '') } catch {}
  const result = resultByKey.get(key(r))
  const modelEmitted = typeof raw?.handle === 'string'
  const rawExact = raw?.handle === r.expected.handle && raw?.decision === r.expected.decision
  const ruleExact = r.rule.handle === r.expected.handle && r.rule.decision === r.expected.decision
  return { storyId: r.storyId, split: r.split, mode: r.mode, family: r.family, targetExpected: r.expected.handle !== null,
    ruleExact, rawExact, modelEmitted, rawWrongIdentity: modelEmitted && !rawExact,
    ...result }
})
const count = (rows, p) => rows.filter(p).length
const rate = (n, d) => ({ n, d, rate: d ? n / d : null })
function summary(group) {
  const yes = group.filter(r => r.targetExpected)
  const no = group.filter(r => !r.targetExpected)
  const accepted = group.filter(r => r.status === 'accepted_for_scoring')
  return { n: group.length, ruleDecisionExact: rate(count(group, r => r.ruleExact), group.length),
    modelDecisionExactValidResponse: rate(count(group, r => r.identityCorrect), group.length),
    modelDecisionAndSupportExact: rate(count(group, r => r.exact), group.length),
    modelRawDecisionExactDiagnosticOnly: rate(count(group, r => r.rawExact), group.length),
    modelCorrectTargetValidResponse: rate(count(yes, r => r.identityCorrect), yes.length),
    modelCorrectTargetWithSupport: rate(count(yes, r => r.exact), yes.length),
    modelRawCorrectTargetDiagnosticOnly: rate(count(yes, r => r.rawExact), yes.length),
    accepted: rate(accepted.length, group.length),
    wrongIdentityAccepted: count(group, r => r.wrongIdentity),
    wrongIdentityRaw: count(group, r => r.rawWrongIdentity),
    assignedOnNegativeRaw: count(no, r => r.modelEmitted),
    abstentionExactValidResponse: rate(count(no, r => r.identityCorrect), no.length),
    invalid: Object.fromEntries([...new Set(group.map(r => r.status))].sort().map(k => [k, count(group, r => r.status === k)])) }
}
const splits = Object.fromEntries(['dev', 'validation'].map(split => {
  const on = analyses.filter(r => r.split === split && r.mode === 'on')
  const off = analyses.filter(r => r.split === split && r.mode === 'off')
  const map = new Map(off.map(r => [r.storyId, r]))
  const changed = on.filter(r => r.targetExpected && !map.get(r.storyId).targetExpected)
  return [split, { off: summary(off), on: summary(on),
    pairedEvidenceDependent: { n: changed.length,
      ruleCorrectBoth: count(changed, r => r.ruleExact && map.get(r.storyId).ruleExact),
      modelCorrectBoth: count(changed, r => r.exact && map.get(r.storyId).exact),
      modelRawCorrectBothDiagnosticOnly: count(changed, r => r.rawExact && map.get(r.storyId).rawExact) },
    byFamilyOn: Object.fromEntries([...new Set(on.map(r => r.family))].sort().map(f => [f, summary(on.filter(r => r.family === f))])) }]
}))
const report = { provenance: cfg.provenance, runtimeBuild: cfg.runtimeBuild, modelSha256: cfg.modelSha256,
  runtime, validRecords: replay.accepted, missing: replay.missing, truncated: count(completions, r => r.stopType === 'limit'),
  splits, ruleBaseline: metrics.baseline, outcomes: analyses, qualification: 'PRODUCTION_NO_GO_SYNTHETIC_LOCAL_DIAGNOSTIC_ONLY' }
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ runtime, validRecords: report.validRecords, truncated: report.truncated,
  validation: { off: splits.validation.off, on: splits.validation.on, paired: splits.validation.pairedEvidenceDependent } }))
