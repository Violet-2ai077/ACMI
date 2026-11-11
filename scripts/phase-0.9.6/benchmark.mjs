import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createScopeAuthority } from '../../packages/core/dist/index.js'
import { cells, runPair, sourceLimits } from './experiment.mjs'
import { hash, protocol, stories } from './stories.mjs'

const ratio = (n, d) => ({ n, d, rate: d ? n / d : null })
const count = (rows, predicate) => rows.filter(predicate).length
const matches = (out, expected) => Boolean(expected && out.taskId === expected.taskId && out.status === expected.status)
const unchanged = r => new Set(cells.map(k => r.cells[k].packetDigest)).size === 1
  && r.cells.literal_on.envelopeDigest === r.cells.contrast_on.envelopeDigest
  && r.cells.literal_off.envelopeDigest === r.cells.contrast_off.envelopeDigest
const allowedIdentity = (out, r) => out.taskId === null
  || (out.status === 'suggest_active' ? r.authorizedActive : out.status === 'reference_history' ? r.authorizedHistorical : []).includes(out.taskId)
const write = (dir, name, data) => writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })

function fixture(context, source, { allow = true, denyTask = null, catalogComplete = true } = {}) {
  const authority = createScopeAuthority()
  const scope = authority.grant(context.cut.workspaceId)
  return { context, catalogComplete, sourceId: source.id,
    access: { authority, scope, sha256: hash, permitsTask: (_, id) => id !== denyTask, readCurrentCut: () => context.cut,
      permitsSource: (_, cut, id) => allow && cut.workspaceId === context.cut.workspaceId && id === source.id,
      readSource: (_, id) => id === source.id ? source : null } }
}

const summarize = (rows, k) => {
  const yes = rows.filter(r => r.expected)
  const no = rows.filter(r => !r.expected)
  const observed = rows.filter(r => r.cells[k].taskId !== null)
  const right = r => matches(r.cells[k], r.expected)
  return { positives: yes.length, negatives: no.length, correct: ratio(count(yes, right), yes.length),
    onOutputPrecision: ratio(count(observed, right), observed.length), identityOutput: ratio(observed.length, rows.length),
    wrongIdentity: count(observed, r => !right(r)), falseSelectionOnNegative: count(no, r => r.cells[k].taskId !== null),
    clarify: count(rows, r => r.cells[k].status === 'clarify'),
    noSuggestion: count(rows, r => r.cells[k].status === 'no_suggestion'),
    unavailable: count(rows, r => r.cells[k].status === 'unavailable') }
}

function delta(rows, from, to) {
  const positives = rows.filter(r => r.expected)
  let wins = 0, losses = 0, unchangedCorrect = 0, unchangedMiss = 0
  for (const r of positives) {
    const a = matches(r.cells[from], r.expected), b = matches(r.cells[to], r.expected)
    if (a && b) unchangedCorrect++
    else if (a) losses++
    else if (b) wins++
    else unchangedMiss++
  }
  return { n: positives.length, wins, losses, unchangedCorrect, unchangedMiss,
    netPercentagePoints: positives.length ? (wins - losses) * 100 / positives.length : null }
}

function summarizeSplit(rows) {
  const result = Object.fromEntries(cells.map(k => [k, summarize(rows, k)]))
  const compare = (a, b) => delta(rows, a, b)
  const costs = key => {
    const values = rows.filter(r => r.evidence.status === 'admitted').map(r => r.evidence[key]).sort((a, b) => a - b)
    const p = q => values.length ? values[Math.ceil(q * values.length) - 1] : null
    return { n: values.length, p50: p(0.5), p95: p(0.95), max: p(1) }
  }
  return { stories: rows.length, ...result, paired: {
    evidenceGivenLiteral: compare('literal_off', 'literal_on'),
    evidenceGivenContrast: compare('contrast_off', 'contrast_on'),
    contrastWithEvidence: compare('literal_on', 'contrast_on'),
    contrastWithoutEvidence: compare('literal_off', 'contrast_off'),
  }, cost: { sourceBytes: costs('evidenceBytes'), addedEnvelopeBytes: costs('addedBytes'),
    addedEstimatedTokens: costs('addedEstimatedTokens') },
  byFamily: Object.fromEntries([...new Set(rows.map(r => r.family))].sort().map(f => {
    const subset = rows.filter(r => r.family === f)
    return [f, { n: subset.length, ...Object.fromEntries(cells.map(k => [k, summarize(subset, k).correct])) }]
  })) }
}

function controls(story) {
  const { source, context } = story
  const after = (text, fields = {}) => ({ ...source, text, digest: hash(text), ...fields })
  const drift = fields => ({ ...source, cut: { ...source.cut, ...fields } })
  const signedAs = fields => ({ ...source, ...fields })
  const blocked = [
    ['source_denied', source, { allow: false }], ['foreign_workspace', drift({ workspaceId: 'another-workspace' })],
    ['foreign_session', drift({ sessionId: 'another-session' })], ['wrong_incarnation', drift({ incarnation: 'another-incarnation' })],
    ['stale_authorization', drift({ authorizationEpoch: 0 })], ['stale_revision', drift({ sourceRevision: 0 })],
    ['stale_cursor', drift({ cursor: 8 })], ['current_cursor', drift({ cursor: 10 })],
    ['tampered_text', after(source.text + ' Extra text.', { digest: source.digest })],
    ['not_user', signedAs({ actor: 'assistant' })], ['unfinished', signedAs({ complete: false })],
    ['byte_budget', after('I meant ' + 'x'.repeat(257))], ['token_budget', after('é'.repeat(97))],
  ]
  const rows = blocked.map(([kind, prior, opts]) => {
    const r = runPair(fixture(context, prior, opts))
    const retainedDirect = story.family === 'override' ? story.expected : null
    return { story: story.id, split: story.split, kind, projection: r.evidence.status, observedSourceReads: r.sourceReads,
      pass: unchanged(r) && r.offSourceReads === 0 && r.evidence.status === (kind.endsWith('_budget') ? 'budget' : 'withheld')
        && (kind !== 'source_denied' || r.sourceReads === 0)
        && cells.every(k => retainedDirect ? matches(r.cells[k], retainedDirect) : r.cells[k].taskId === null) }
  })
  if (['literal', 'contrast', 'contrast_gap', 'semantic_gap'].includes(story.family)) {
    const r = runPair(fixture(context, after('I meant ' + story.alternateAlias + '.')))
    rows.push({ story: story.id, split: story.split, kind: 'evidence_redirected', projection: r.evidence.status,
      pass: unchanged(r) && r.offSourceReads === 0 && r.evidence.status === 'admitted'
        && ['literal', 'contrast'].every(arm => r.cells[arm + '_off'].taskId === null
          && matches(r.cells[arm + '_on'], { status: 'suggest_active', taskId: story.alternateId })) })
    const revoked = runPair(fixture(context, source, { denyTask: story.taskId }))
    rows.push({ story: story.id, split: story.split, kind: 'target_not_issued', projection: revoked.evidence.status,
      pass: unchanged(revoked) && revoked.offSourceReads === 0 && !revoked.authorizedActive.includes(story.taskId)
        && cells.every(k => revoked.cells[k].taskId === null) })
  }
  if (story.family === 'history') {
    const current = { ...context.current, text: 'Go back to the item from my last note.' }
    const r = runPair(fixture({ ...context, current }, source))
    rows.push({ story: story.id, split: story.split, kind: 'historical_action_not_allowed', projection: r.evidence.status,
      pass: unchanged(r) && r.evidence.status === 'admitted' && r.offSourceReads === 0 && cells.every(k => r.cells[k].taskId === null) })
  }
  return rows
}

export function evaluate() {
  assert.equal(new Set(stories.map(s => s.id)).size, stories.length)
  assert.equal(new Set(stories.map(s => s.source.text.normalize('NFC').toLowerCase())).size, stories.length)
  const rows = stories.map(({ id, split, language, family, context, source, expected }) => ({
    id, split, language, family, expected, ...runPair(fixture(context, source)),
  }))
  const checks = stories.flatMap(controls)
  const summaries = Object.fromEntries(['dev', 'validation'].map(s => [s, summarizeSplit(rows.filter(r => r.split === s))]))
  const v = summaries.validation
  const denominators = v.stories >= 12 && v.contrast_on.positives >= 10 && v.contrast_on.negatives >= 4
  const safety = rows.every(r => unchanged(r) && r.offSourceReads === 0 && r.sourceReads === 1
    && cells.every(k => allowedIdentity(r.cells[k], r) && (r.cells[k].taskId === null || matches(r.cells[k], r.expected))))
    && checks.every(c => c.pass)
  const gain = v.paired.evidenceGivenContrast.netPercentagePoints >= 25 && v.contrast_on.wrongIdentity === v.contrast_off.wrongIdentity
  return { rows, checks, report: { protocol, provenance: 'synthetic_fixture_reference_not_human_or_model',
    decision: !safety ? 'FAIL' : !denominators ? 'INCONCLUSIVE' : gain ? 'PASS_CONTROLLED_EVIDENCE_GAIN' : 'FAIL',
    denominators, safety, gain, holdoutRuns: 0, providerRequests: 0, humanLabels: 0, runtimeWrites: 0,
    sourceLimits, stories: rows.length, safetyControls: { n: checks.length, passed: count(checks, c => c.pass) }, summaries } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, 'Usage: node benchmark.mjs <new-output-directory>')
  const out = resolve(process.argv[2])
  const { rows, checks, report } = evaluate()
  const inputs = stories.map(({ id, context, source }) => ({ id, context, source }))
  const oracle = stories.map(({ id, split, language, family, expected }) => ({ id, split, language, family, expected }))
  mkdirSync(out)
  write(out, 'inputs.synthetic-host.json', inputs)
  write(out, 'oracle.json', oracle)
  write(out, 'predictions.json', rows.map(({ expected, ...r }) => r))
  write(out, 'controls.json', checks)
  write(out, 'metrics.json', report)
  write(out, 'manifest.json', { protocol, inputsSha256: hash(JSON.stringify(inputs)), oracleSha256: hash(JSON.stringify(oracle)),
    scenarios: stories.map(({ id, split, language, family }) => ({ id, split, language, family })), formalHoldout: 0 })
  console.log(JSON.stringify({ decision: report.decision, stories: report.stories, controls: report.safetyControls,
    validation: Object.fromEntries(Object.entries(report.summaries.validation).filter(([key]) => key !== 'byFamily')) }))
  if (report.decision !== 'PASS_CONTROLLED_EVIDENCE_GAIN') process.exitCode = 1
}
