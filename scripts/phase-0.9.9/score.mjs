import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import cfg from './config.json' with { type: 'json' }
import { conditions } from './cases.mjs'

const [run, output, ...extra] = process.argv.slice(2)
assert(run && output && !extra.length, 'Usage: node score.mjs <run-directory> <new-report>')
const sha = s => createHash('sha256').update(s).digest('hex')
const json = file => JSON.parse(readFileSync(join(run, file), 'utf8'))
const jsonl = file => readFileSync(join(run, file), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s))
const summary = json('run-summary.json')
assert.equal(summary.dshVersion, cfg.dshVersion)
assert.equal(summary.caseDigest, cfg.caseDigest)
assert.equal(summary.modelSha256, cfg.modelSha256)
assert.equal(sha(JSON.stringify(conditions)), cfg.caseDigest)
const native = jsonl('native-results.jsonl')
const ledger = jsonl('backend-ledger.jsonl')
const attempts = ledger.filter(x => x.kind === 'attempt')
const completed = ledger.filter(x => x.kind === 'complete')
assert.equal(native.length, summary.completed)
assert.equal(attempts.length, summary.backend.attempts)
assert.equal(summary.backend.input, attempts.reduce((n, x) => n + x.inputTokens, 0))
assert.equal(summary.backend.output, completed.reduce((n, x) => n + x.outputTokens, 0))
assert(attempts.length <= cfg.maxCalls && summary.backend.reserved <= cfg.maxReservedTokens)
const byStory = new Map()
const outcomes = native.map((n, i) => {
  const { story, mode, expectedIndex, family } = conditions[i]
  assert.equal(n.id, story.id)
  assert.equal(n.mode, mode)
  assert.equal(n.family, family)
  assert.equal(n.expectedIndex, expectedIndex)
  assert.equal(n.priorVisible, mode === 'on' && !story.denied)
  assert.equal(n.calls, 1)
  assert(n.native.userSeq < n.native.assistantSeq && n.native.assistantSeq < n.native.endSeq)
  assert.equal(attempts[i].ticket, i + 1)
  assert.equal(completed[i].ticket, i + 1)
  assert.equal(n.requestDigest, attempts[i].requestDigest)
  assert.equal(n.requestDigest, completed[i].requestDigest)
  assert.equal(sha(n.reply), completed[i].replyDigest)
  assert.equal(n.native.endKind, completed[i].stopType === 'limit' ? 'max-tokens' : 'completed')
  assert.equal(n.focusDigest, sha(story.focus))
  assert.deepEqual(n.unchanged.proposals, [0, 0])
  if (family === 'cross_session') {
    const pair = byStory.get(story.id)
    if (mode === 'off') byStory.set(story.id, n)
    else {
      assert(pair)
      assert.equal(n.candidateDigest, pair.candidateDigest)
      assert.equal(n.focusDigest, pair.focusDigest)
      assert.equal(n.unchanged.historical, pair.unchanged.historical)
    }
  }
  let raw
  try { raw = JSON.parse(n.reply) } catch {}
  const id = n.review.status === 'suggestion' ? n.review.taskId : null
  const expected = expectedIndex === null ? null : n.taskIds[expectedIndex]
  const rawIndex = raw?.decision === 'suggest' ? ({ a1: 0, a2: 1 })[raw.handle] ?? -1 : null
  const rawCorrect = expectedIndex === null ? ['clarify', 'none'].includes(raw?.decision) : rawIndex === expectedIndex
  return { id: n.id, mode, family, expectedIdentity: expectedIndex !== null, rawDecision: raw?.decision ?? 'invalid_json',
    rawCorrect, rawWrongIdentity: rawIndex !== null && rawIndex !== expectedIndex,
    review: n.review.status, reason: n.review.reason ?? null, correct: id === expected, wrongIdentity: id !== null && id !== expected }
})
const count = (rows, pred) => rows.filter(pred).length
const cross = outcomes.filter(o => o.family === 'cross_session' && o.mode === 'on')
const conflict = outcomes.filter(o => o.family === 'binding_conflict')
const negatives = outcomes.filter(o => !o.expectedIdentity)
const score = rows => ({ n: rows.length, correct: count(rows, r => r.correct), rawCorrect: count(rows, r => r.rawCorrect),
  wrongIdentity: count(rows, r => r.wrongIdentity), rawWrongIdentity: count(rows, r => r.rawWrongIdentity) })
const runtimeGenerations = (readFileSync(join(run, 'runtime-stderr.txt'), 'utf8').match(/processing task, is_child = 0/gu) ?? []).length
const integration = summary.status === 'completed' && summary.runtimeStopped && summary.backend.externalProviderRequests === 0
  && native.length === cfg.maxCalls && attempts.length === cfg.maxCalls && completed.length === cfg.maxCalls
  && summary.nativeCalls === cfg.maxCalls && runtimeGenerations === cfg.maxCalls && native.every(n => n.native.endKind === 'completed')
const semantic = integration && count(cross, r => r.correct) >= 3 && count(conflict, r => r.correct) >= 3
  && count(outcomes, r => r.wrongIdentity) === 0
const result = { ...summary, integration: integration ? 'PASS_ISOLATED_NATIVE_DSH' : 'INCONCLUSIVE',
  semantic: semantic ? 'PASS_BOUNDED_SYNTHETIC_CASES' : integration ? 'FAIL_BOUNDED_CASES' : 'INCONCLUSIVE',
  productionAutomaticRouting: 'NO_GO', runtimeGenerations, crossSession: score(cross), bindingConflict: score(conflict),
  noIdentityExpected: score(negatives), outcomes }
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, outcomes: undefined }))
