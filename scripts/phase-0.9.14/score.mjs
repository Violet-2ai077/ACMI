import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const hash = s => createHash('sha256').update(s).digest('hex')
const existing = x => Boolean(x && typeof x.taskId === 'string')
const equal = (a, b) => existing(a) && existing(b) ? a.taskId === b.taskId && a.workId === b.workId : a === b
const contains = (text, words) => typeof text === 'string' && words.every(w => text.toLowerCase().includes(w.toLowerCase()))
const count = (rows, p) => rows.filter(p).length
const sum = (rows, p) => rows.reduce((s, r) => s + p(r), 0)
const q = (xs, p) => xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1] : null
const quantiles = xs => ({ p50: q(xs, 0.5), p95: q(xs, 0.95) })
const parse = x => { try { return JSON.parse(x) } catch { return null } }
const index = (rows, k) => {
  const result = new Map(rows.map(r => [k(r), r]))
  assert.equal(result.size, rows.length, 'Duplicate record key')
  return result
}

export function score(inputs, truth, catalogs, fixtures, anchors, native, ledger, raw, run) {
  const byId = index(inputs, x => x.id), gold = index(truth, x => x.id)
  const catalog = index(catalogs, x => x.id), launch = index(fixtures, x => x.id), receipts = index(anchors, x => x.id)
  index(native, x => x.id)
  const a = ledger.filter(r => r.kind === 'attempt'), c = ledger.filter(r => r.kind === 'complete')
  const attempts = index(a, r => r.ticket), completions = index(c, r => r.ticket), bodies = index(raw, r => r.ticket)
  index(a, r => r.generation)
  assert(a.length <= 24 && a.every((r, i) => r.ticket === i + 1 && r.id === inputs[i]?.id && r.arm === inputs[i]?.arm), 'Ledger order')
  for (const complete of c) {
    const attempt = attempts.get(complete.ticket), receipt = receipts.get(complete.id)
    assert(attempt && receipt && attempt.id === complete.id && attempt.arm === complete.arm && attempt.generation === complete.generation)
    assert.equal(attempt.requestDigest, receipt.requestDigest)
    const { inputTokens, outputTokens, totalTokens } = complete.usage
    assert(inputTokens === attempt.inputTokens && inputTokens > 0 && inputTokens <= 1400
      && outputTokens >= 0 && outputTokens <= 320 && totalTokens === inputTokens + outputTokens, 'Token budget')
  }
  for (const body of raw) {
    const complete = completions.get(body.ticket)
    assert(complete && body.id === complete.id && body.arm === complete.arm && body.generation === complete.generation && body.stop === complete.stop)
    assert.equal(hash(body.raw), complete.responseDigest)
    assert.deepEqual(body.usage, complete.usage)
  }
  const used = new Set()
  const details = native.map(r => {
    const item = byId.get(r.id), target = gold.get(r.id), h = receipts.get(r.id), f = launch.get(r.id)
    const step = r.steps[0], user = r.native.user
    assert(item && target && h && f && r.steps.length === 1, 'Missing native records')
    const attempt = attempts.get(step.ticket), complete = completions.get(step.ticket), body = bodies.get(step.ticket)
    assert(attempt && complete && body && !used.has(step.ticket) && attempt.id === r.id && body.generation === step.generation)
    assert.equal(attempt.requestDigest, step.requestDigest)
    assert.equal(body.raw, step.raw)
    assert.equal(body.stop, step.stop)
    assert.deepEqual(body.usage, step.usage)
    used.add(step.ticket)
    assert.deepEqual(h.request, f.request)
    assert(h.arm === item.arm && h.eventId === (f.launch?.eventId ?? null)
      && h.source.sessionId === r.native.session && h.source.nativeUserId === user?.id && h.source.sourceUserSeq === user?.seq, 'Anchor/source mismatch')
    const refTarget = h.modelAnchorRef === null ? null : catalog.get(r.id).links[h.modelAnchorRef]
    const anchorOK = h.status === target.anchorVerdict && equal(h.launchTarget, target.launchTarget)
      && equal(h.effective, target.anchorEffective) && equal(refTarget, item.arm === 'B' ? target.anchorEffective : null)
    const d = step.decoded, u = d?.user ?? null, p = d?.assistant ?? null, frame = parse(step.raw)
    const same = r.native.assistant.length === 1 && d && frame?.tag && typeof frame.tag === 'object'
      && frame.answer === r.native.assistant[0].text && user?.seq === step.sourceUserSeq
      && JSON.stringify(r.native.assistant[0].usage) === JSON.stringify(complete.usage)
    const exact = (x, expected, goal) => equal(x, expected) && (expected !== 'new_task_proposal' || contains(goal, target.words))
    const userExact = exact(u, target.user, d?.newGoal), assistantExact = exact(p, target.assistant, d?.assistantGoal)
    const related = d?.related ?? []
    return { id: r.id, arm: item.arm, probe: item.probe, family: item.family, category: target.category,
      anchorStatus: h.status, anchorOK, exposed: h.modelAnchorRef !== null, launchTarget: h.launchTarget, anchorTarget: h.effective,
      expected: target.user, user: u, assistant: p, userExact, assistantExact,
      naiveHostExact: equal(h.effective ?? 'unresolved', target.user),
      wrongAnchorInheritance: target.category === 'conflict' && !userExact && equal(u, h.effective),
      unanchoredUnsafeExisting: target.category === 'no_effective_anchor' && !existing(target.user) && (existing(u) || existing(p)),
      wrongExisting: (existing(u) && !userExact) || (existing(p) && !assistantExact),
      expectedIntent: target.intent, intent: d?.intent ?? null, intentExact: target.intent === d?.intent,
      related, relatedExact: related.length === target.related.length && target.related.every(x => related.some(y => equal(x, y))),
      relatedExpected: target.related.length, validTag: Boolean(d && !d.issues.length), issues: d?.issues ?? [step.withheld ?? 'NO_DECODE'],
      completed: r.native.end === 'completed', sameGeneration: Boolean(same), answerOK: target.words.length
        ? r.native.end === 'completed' && contains(r.native.assistant[0]?.text, target.words) : null,
      tools: r.native.calls.length + r.native.results.length, leak: r.leaked, mutation: !Object.values(r.unchanged).every(Boolean),
      latencyMs: r.latencyMs }
  })
  const pairs = details.filter(x => x.arm === 'A').flatMap(x => {
    const y = details.find(r => r.probe === x.probe && r.arm === 'B')
    if (!y) return []
    return [{ probe: x.probe, category: x.category, user: [x.userExact, y.userExact], assistant: [x.assistantExact, y.assistantExact],
      noEffectiveAnchor: y.anchorTarget === null,
      identicalRequests: receipts.get(x.id).requestDigest === receipts.get(y.id).requestDigest }]
  })
  const arms = Object.fromEntries(['A', 'B'].map(arm => {
    const rows = details.filter(x => x.arm === arm), gen = c.filter(x => x.arm === arm)
    const cont = rows.filter(x => x.category === 'continue'), conflict = rows.filter(x => x.category === 'conflict')
    return [arm, { rows: rows.length, anchorOK: count(rows, x => x.anchorOK), exposed: count(rows, x => x.exposed),
      userExact: count(rows, x => x.userExact), assistantExact: count(rows, x => x.assistantExact), intentExact: count(rows, x => x.intentExact),
      naiveHostExact: count(rows, x => x.naiveHostExact), completed: count(rows, x => x.completed),
      sameGeneration: count(rows, x => x.sameGeneration), validTag: count(rows, x => x.validTag),
      continueExact: count(cont, x => x.userExact), continueCases: cont.length,
      conflictExact: count(conflict, x => x.userExact), conflictCases: conflict.length,
      wrongAnchorInheritance: count(conflict, x => x.wrongAnchorInheritance),
      unsafeUnanchored: count(rows, x => x.unanchoredUnsafeExisting), wrongExisting: count(rows, x => x.wrongExisting),
      existingCovered: count(rows, x => existing(x.expected) && existing(x.user)),
      existingEligible: count(rows, x => existing(x.expected)),
      neededClarification: count(rows, x => x.expectedIntent === 'clarify'),
      correctClarification: count(rows, x => x.expectedIntent === 'clarify' && x.intent === 'clarify'),
      unnecessaryClarification: count(rows, x => x.expectedIntent !== 'clarify' && x.intent === 'clarify'),
      relatedExact: count(rows, x => x.relatedExpected > 0 && x.relatedExact),
      answerPassed: count(rows, x => x.answerOK === true), answerAsserted: count(rows, x => x.answerOK !== null),
      inputTokens: sum(gen, x => x.usage.inputTokens), outputTokens: sum(gen, x => x.usage.outputTokens),
      generationMs: quantiles(gen.map(x => x.latencyMs)), turnMs: quantiles(rows.map(x => x.latencyMs)) }]
  }))
  const leaks = count(details, x => x.leak), mutations = count(details, x => x.mutation), tools = sum(details, x => x.tools)
  const userGain = arms.B.userExact - arms.A.userExact, controlPairs = count(pairs, x => x.noEffectiveAnchor && x.identicalRequests)
  const hostMechanism = !run.stopped && anchors.length === 24 && c.length === 24 && raw.length === 24 && pairs.length === 12
    && controlPairs === 5 && pairs.every(x => x.noEffectiveAnchor === x.identicalRequests)
    && !leaks && !mutations && !tools && arms.A.exposed === 0 && arms.B.exposed === 7
    && Object.values(arms).every(x => x.anchorOK === 12 && x.completed === 12 && x.sameGeneration === 12)
  const modelCandidate = hostMechanism && arms.B.userExact >= 9 && arms.B.assistantExact >= 9 && userGain >= 2
    && arms.B.userExact > arms.B.naiveHostExact && arms.B.continueExact >= 3 && arms.B.conflictExact >= 2
    && !arms.B.wrongAnchorInheritance && !arms.B.unsafeUnanchored && arms.B.answerPassed >= 8
  return { provenance: run.provenance, stopped: run.stopped, outcome: run.stopped ? 'INCONCLUSIVE_STOPPED'
    : modelCandidate ? 'PASS_SCOPED_MODEL' : hostMechanism ? 'PASS_HOST_MODEL_GATE_NOT_MET' : 'HOST_GATE_NOT_MET',
  hostMechanism, modelCandidate, arms, userGain, controlPairs, leaks, mutations, tools, pairs,
  performance: { attempts: a.length, completions: c.length, reconciled: used.size, anchors: anchors.length, raw: raw.length,
    inputTokens: sum(c, x => x.usage.inputTokens), outputTokens: sum(c, x => x.usage.outputTokens),
    generationMs: quantiles(c.map(x => x.latencyMs)) }, details }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, runDir, out] = process.argv.slice(2)
  assert(corpus && runDir && out, 'Usage: node score.mjs <corpus-dir> <evaluation-dir> <new-output-file>')
  const run = JSON.parse(readFileSync(join(runDir, 'run-summary.json'), 'utf8'))
  for (const [file, key] of [['model-inputs', 'inputs'], ['ground-truth', 'truth'], ['host-catalog', 'catalog'],
    ['trusted-launch-fixtures', 'launches']]) {
    assert.equal(hash(readFileSync(join(corpus, file + '.jsonl'))), run.frozen[key])
  }
  const rows = (dir, file) => existsSync(join(dir, file + '.jsonl'))
    ? readFileSync(join(dir, file + '.jsonl'), 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse) : []
  writeFileSync(out, JSON.stringify(score(rows(corpus, 'model-inputs'), rows(corpus, 'ground-truth'), rows(corpus, 'host-catalog'),
    rows(corpus, 'trusted-launch-fixtures'), rows(runDir, 'anchor-receipts'), rows(runDir, 'native-results'),
    rows(runDir, 'generation-ledger'), rows(runDir, 'completion-sidecar'), run), null, 2) + '\n', { flag: 'wx' })
}
