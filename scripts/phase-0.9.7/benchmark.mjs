import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runPair } from '../phase-0.9.6/experiment.mjs'
import { prepareRequest, prompt, promptDigest, promptVersion, protocol, responseSchema, schemaDigest,
  scoreResponse, sha, validateResponse } from './contract.mjs'
import { fixture, stories } from './stories.mjs'

const modes = ['off', 'on']
const write = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const count = (rows, predicate) => rows.filter(predicate).length
const ratio = (n, d) => ({ n, d, rate: d ? n / d : null })
const assigned = out => out.handle !== null
const match = (a, b) => a.decision === b.decision && a.handle === b.handle
const fields = (story, request, mode) => {
  const { decision, target, support } = story.oracle[mode]
  if (target !== null) assert(Object.hasOwn(request.handles, target), 'Oracle target not issued')
  return { decision, handle: target === null ? null : request.handles[target], support }
}
const send = (request, value) => validateResponse(request, { requestDigest: request.requestDigest, raw: JSON.stringify(value) })

function authorFixture(request, expected) {
  const evidence = expected.support.map(({ ref, text }) => {
    const start = request.payload[ref].text.indexOf(text)
    assert(start >= 0 && text.length > 0)
    return { ref, start, end: start + text.length, quote: text }
  })
  const response = { decision: expected.decision, handle: expected.handle, evidence }
  return { response, scored: scoreResponse(send(request, response), expected, request.payload) }
}

function runStory(story) {
  const input = fixture(story)
  const off = prepareRequest(input, false)
  const offReads = input.reads()
  const on = prepareRequest(input, true)
  assert.equal(off.status, 'ready')
  assert.equal(on.status, 'ready')
  assert.equal(off.packetDigest, on.packetDigest)
  assert.deepEqual({ ...on.payload, antecedent: null }, off.payload)
  const missing = ['source_denied', 'stale_source'].includes(story.family)
  assert.equal(on.sourceProjection, missing ? 'withheld' : 'admitted')
  if (missing) assert.equal(on.requestDigest, off.requestDigest)
  const privateRefs = [...story.context.candidates.map(c => c.taskId), story.source.id, story.context.current.id,
    story.context.cut.workspaceId, story.context.cut.sessionId, story.context.cut.incarnation]
  const serialized = JSON.stringify(on.payload)
  assert(privateRefs.every(ref => !serialized.includes(ref)))
  const baseline = runPair(fixture(story))
  assert.equal(baseline.evidence.status, on.sourceProjection)
  assert.equal(baseline.offSourceReads, 0)
  assert.equal(on.payload.antecedent?.text, missing ? undefined : story.source.text)
  const prepared = { off, on }
  const rows = modes.map(mode => {
    const request = prepared[mode]
    const old = baseline.cells['contrast_' + mode]
    assert.equal(old.packetDigest, request.packetDigest)
    const expected = fields(story, request, mode)
    const rule = { decision: old.status, handle: old.taskId === null ? null : request.handles[old.taskId] }
    assert(rule.handle === null || request.payload.candidates.some(c => c.handle === rule.handle), 'Rule produced an unissued ID')
    const script = authorFixture(request, expected)
    return { storyId: story.id, split: story.split, language: story.language, family: story.family, mode, requestDigest: request.requestDigest,
      budget: request.budget, expected, rule, scriptedResponse: script.response, scriptedScore: script.scored, payload: request.payload }
  })
  return { rows, offReads, onReads: input.reads(), missing, on }
}

function controls(request, expected) {
  const good = authorFixture(request, expected).response
  const alien = request.payload.candidates.find(c => c.kind === 'active' && c.handle !== good.handle)
  assert(alien)
  const policy = [
    ['malformed', validateResponse(request, { requestDigest: request.requestDigest, raw: '{' }), 'parse_error'],
    ['oversized', validateResponse(request, { requestDigest: request.requestDigest, raw: 'x'.repeat(4097) }), 'response_budget'],
    ['stale_request', validateResponse(request, { requestDigest: '0'.repeat(64), raw: JSON.stringify(good) }), 'stale_response'],
    ['unissued_handle', send(request, { ...good, handle: 'external' }), 'candidate_fence'],
    ['active_as_history', send(request, { ...good, decision: 'reference_history' }), 'candidate_fence'],
    ['writer_field', send(request, { ...good, bind: true }), 'schema_error'],
    ['abstention_with_handle', send(request, { ...good, decision: 'clarify' }), 'schema_error'],
    ['fabricated_quote', send(request, { ...good, evidence: [{ ref: 'current', start: 0, end: 4, quote: 'XXXX' }] }), 'evidence_error'],
    ['missing_current_span', send(request, { ...good, evidence: good.evidence.slice(1) }), 'evidence_error'],
    ['duplicate_source', send(request, { ...good, evidence: [good.evidence[0], good.evidence[0]] }), 'evidence_error'],
  ].map(([name, result, want]) => ({ name, observed: result.status, expected: want, pass: result.status === want }))
  const semantic = [
    ['valid_coordinates_wrong_task', { ...good, handle: alien.handle }, 'wrongIdentity'],
    ['valid_coordinates_missing_support', { ...good, evidence: [good.evidence[0]] }, 'unsupported'],
  ].map(([name, value, want]) => {
    const result = send(request, value)
    const score = scoreResponse(result, expected, request.payload)
    return { name, observed: result.status, score, pass: result.status === 'accepted_for_scoring' && !score.exact
      && (want === 'wrongIdentity' ? score.wrongIdentity : score.identityCorrect && !score.supportCorrect) }
  })
  return [...policy, ...semantic]
}

function summarize(rows) {
  const stats = group => {
    const resolved = group.filter(r => assigned(r.expected))
    const noTarget = group.filter(r => !assigned(r.expected))
    const emitted = group.filter(r => assigned(r.rule))
    return { n: group.length, targetResolvable: resolved.length, noIdentityExpected: noTarget.length,
      decisionExact: ratio(count(group, r => match(r.rule, r.expected)), group.length),
      correctCoverage: ratio(count(resolved, r => match(r.rule, r.expected)), resolved.length),
      coveredAccuracy: ratio(count(emitted, r => match(r.rule, r.expected)), emitted.length),
      wrongIdentity: count(emitted, r => !match(r.rule, r.expected)),
      wrongOnNegative: count(noTarget, r => assigned(r.rule)),
      evidenceScore: null }
  }
  const perMode = Object.fromEntries(modes.map(m => [m, stats(rows.filter(r => r.mode === m))]))
  const off = new Map(rows.filter(r => r.mode === 'off').map(r => [r.storyId, r]))
  const on = rows.filter(r => r.mode === 'on')
  let wins = 0, losses = 0, bothCorrect = 0, bothWrong = 0
  for (const r of on) {
    const old = off.get(r.storyId)
    const a = match(old.rule, old.expected), b = match(r.rule, r.expected)
    if (a && b) bothCorrect++
    else if (!a && b) wins++
    else if (a) losses++
    else bothWrong++
  }
  const changed = on.filter(r => !match(r.expected, off.get(r.storyId).expected))
  return { ...perMode, paired: { wins, losses, bothCorrect, bothWrong,
    expectedSwitch: changed.length, resolvedWithEvidence: count(changed, r => match(r.rule, r.expected)),
    correctInBothConditions: count(changed, r => match(r.rule, r.expected) && match(off.get(r.storyId).rule, off.get(r.storyId).expected)) },
    byFamilyOn: Object.fromEntries([...new Set(on.map(r => r.family))].sort().map(f => [f, stats(on.filter(r => r.family === f))])) }
}

export function evaluate() {
  assert.equal(new Set(stories.map(s => s.id)).size, stories.length)
  const replay = stories.map(runStory)
  const rows = replay.flatMap(r => r.rows)
  const control = replay.find(r => r.rows[1].family === 'paraphrase')
  const checks = controls(control.on, control.rows[1].expected)
  const baseline = Object.fromEntries(['dev', 'validation'].map(split => [split, summarize(rows.filter(r => r.split === split))]))
  const fixturePasses = count(rows, r => r.scriptedScore.exact)
  const v = baseline.validation
  const denominators = stories.length >= 24 && baseline.dev.on.n >= 12 && v.on.n >= 12
    && v.on.targetResolvable >= 4 && v.on.noIdentityExpected >= 4 && v.paired.expectedSwitch >= 4
  const safe = replay.every(r => r.offReads === 0 && r.onReads === (r.rows[1].family === 'source_denied' ? 0 : 1))
    && checks.every(c => c.pass)
  return { rows, checks, metrics: { protocol, promptVersion, promptDigest, schemaDigest,
    decision: !safe || fixturePasses !== rows.length ? 'FAIL' : denominators ? 'PASS_OFFLINE_EVAL_READINESS' : 'INCONCLUSIVE',
    stories: stories.length, conditions: rows.length, denominators, safe, providerRequests: 0, holdoutRuns: 0, runtimeWrites: 0,
    baseline: { provenance: 'phase-0.9.6 deterministic contrast rules on same scoped packet', ...baseline },
    fixtureRoundTrip: { provenance: 'answer_aware_scripted_fixture_not_model_output', n: rows.length, passed: fixturePasses },
    controls: { n: checks.length, passed: count(checks, c => c.pass) },
    modelEvaluation: { status: 'BLOCKED: explicit authorization required', actualRuns: 0, pairedResults: null },
  } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, 'Usage: node benchmark.mjs <new-output-directory>; offline only')
  const out = resolve(process.argv[2])
  const { rows, checks, metrics } = evaluate()
  const requests = rows.map(({ storyId, mode, requestDigest, budget, payload }) => ({ storyId, mode, requestDigest, budget, payload }))
  const answers = rows.map(({ storyId, split, family, language, mode, expected }) => ({ storyId, split, family, language, mode, expected }))
  mkdirSync(out)
  write(out, 'requests.offline.json', requests)
  write(out, 'oracle.separate.json', answers)
  write(out, 'rule-predictions.json', rows.map(({ storyId, mode, requestDigest, rule }) => ({ storyId, mode, requestDigest, ...rule })))
  write(out, 'scripted-contract-roundtrip.json', rows.map(({ storyId, mode, scriptedResponse, scriptedScore }) =>
    ({ storyId, mode, provenance: 'answer_aware_scripted_fixture_not_model_output', scriptedResponse, scriptedScore })))
  write(out, 'response-controls.json', checks)
  write(out, 'metrics.json', metrics)
  write(out, 'frozen-contract.json', { protocol, promptVersion, promptDigest, schemaDigest, prompt, responseSchema,
    requestsDigest: sha(JSON.stringify(requests)), oracleDigest: sha(JSON.stringify(answers)), formalHoldout: 0 })
  console.log(JSON.stringify({ decision: metrics.decision, stories: metrics.stories, conditions: metrics.conditions,
    validation: { off: metrics.baseline.validation.off, on: metrics.baseline.validation.on, paired: metrics.baseline.validation.paired },
    fixtureRoundTrip: metrics.fixtureRoundTrip, controls: metrics.controls, modelEvaluation: metrics.modelEvaluation }))
  if (metrics.decision !== 'PASS_OFFLINE_EVAL_READINESS') process.exitCode = 1
}
