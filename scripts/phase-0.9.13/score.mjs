import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const digest = s => createHash('sha256').update(s).digest('hex')
const isExisting = v => Boolean(v && typeof v.taskId === 'string')
const equal = (a, b) => isExisting(a) && isExisting(b) ? a.taskId === b.taskId && a.workId === b.workId : a === b
const contains = (text, words) => typeof text === 'string' && words.every(x => text.toLowerCase().includes(x.toLowerCase()))
const count = (xs, p) => xs.filter(p).length
const sum = (xs, f) => xs.reduce((acc, x) => acc + f(x), 0)
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null
const parse = text => { try { return JSON.parse(text) } catch { return null } }
const index = (rows, key) => {
  const map = new Map(rows.map(x => [key(x), x]))
  assert.equal(map.size, rows.length, 'Duplicate scoring key')
  return map
}
const perf = values => ({ p50: quantile(values, 0.5), p95: quantile(values, 0.95) })

export function score(inputs, truth, native, ledger, raw, run) {
  const cases = index(inputs, x => x.id), targets = index(truth, x => x.id)
  index(native, x => x.id)
  const attempts = ledger.filter(x => x.kind === 'attempt'), completions = ledger.filter(x => x.kind === 'complete')
  const attemptIndex = index(attempts, x => x.ticket), completionIndex = index(completions, x => x.ticket), rawIndex = index(raw, x => x.ticket)
  index(attempts, x => x.generation)
  assert(attempts.length <= 24 && attempts.every((x, i) => x.ticket === i + 1 && x.id === inputs[i]?.id && x.arm === inputs[i]?.arm))
  for (const c of completions) {
    const a = attemptIndex.get(c.ticket)
    assert(a && a.id === c.id && a.arm === c.arm && a.generation === c.generation && a.inputTokens === c.usage.inputTokens)
    assert(c.usage.inputTokens > 0 && c.usage.inputTokens <= 1400 && c.usage.outputTokens >= 0 && c.usage.outputTokens <= 320
      && c.usage.inputTokens + c.usage.outputTokens === c.usage.totalTokens)
  }
  for (const s of raw) {
    const c = completionIndex.get(s.ticket)
    assert(c && s.id === c.id && s.arm === c.arm && s.generation === c.generation && s.stop === c.stop)
    assert.equal(digest(s.raw), c.responseDigest)
    assert.deepEqual(s.usage, c.usage)
  }
  const used = new Set()
  const details = native.map(r => {
    const item = cases.get(r.id), target = targets.get(r.id), step = r.steps[0]
    assert(item && target && r.steps.length === 1, 'Unexpected native turn')
    const a = attemptIndex.get(step.ticket), c = completionIndex.get(step.ticket), s = rawIndex.get(step.ticket)
    assert(a && c && s && !used.has(step.ticket) && a.id === r.id && s.generation === step.generation)
    assert.equal(a.requestDigest, step.requestDigest)
    assert.equal(s.raw, step.raw)
    assert.equal(s.stop, step.stop)
    assert.deepEqual(s.usage, step.usage)
    used.add(step.ticket)
    const d = step.decoded, visible = r.native.assistant[0], frame = parse(step.raw)
    const same = Boolean(visible && d && r.native.assistant.length === 1 && visible.text === frame?.answer
      && frame.tag && typeof frame.tag === 'object' && r.native.user?.seq === step.sourceUserSeq
      && JSON.stringify(visible.usage) === JSON.stringify(c.usage))
    const u = d?.user ?? null, p = d?.assistant ?? null, related = d?.related ?? []
    const exact = (x, expected, goal) => equal(x, expected) && (expected !== 'new_task_proposal' || contains(goal, target.words))
    const userExact = exact(u, target.user, d?.newGoal), assistantExact = exact(p, target.assistant, d?.assistantGoal)
    return { id: r.id, probe: item.probe, arm: item.arm, family: item.family,
      expected: target.user, user: u, assistant: p, userExact, assistantExact, positive: target.positive,
      explicitBinding: target.binding, userWrongWasBinding: isExisting(u) && !userExact && equal(u, target.binding),
      wrongExisting: (isExisting(u) && !userExact) || (isExisting(p) && !assistantExact),
      negativeWrongExisting: !target.positive && (isExisting(u) || isExisting(p)),
      intent: d?.intent ?? null, intentExact: d?.intent === target.intent,
      relatedExact: related.length === target.related.length && target.related.every(x => related.some(y => equal(x, y))),
      related, expectedRelated: target.related.length, valid: Boolean(d && !d.issues.length), issues: d?.issues ?? [step.withheld ?? 'NO_DECODE'],
      same, completed: r.native.end === 'completed', answerOK: r.native.end === 'completed' && contains(visible?.text, target.words),
      leak: r.leaked, mutation: !Object.values(r.unchanged).every(Boolean),
      unexpectedTools: r.native.calls.length + r.native.results.length, latencyMs: r.latencyMs }
  })
  const arms = Object.fromEntries(['A', 'B', 'C'].map(arm => {
    const rows = details.filter(x => x.arm === arm), gen = completions.filter(x => x.arm === arm)
    return [arm, { rows: rows.length, completed: count(rows, x => x.completed), answers: count(rows, x => x.answerOK),
      valid: count(rows, x => x.valid), sameGeneration: count(rows, x => x.same), userExact: count(rows, x => x.userExact),
      assistantExact: count(rows, x => x.assistantExact), intentExact: count(rows, x => x.intentExact),
      relatedExact: count(rows, x => x.expectedRelated > 0 && x.relatedExact), relatedExpected: count(rows, x => x.expectedRelated > 0),
      existingExact: count(rows, x => x.positive && x.userExact), existingCovered: count(rows, x => x.positive && isExisting(x.user)),
      wrongExisting: count(rows, x => x.wrongExisting), negativeWrongExisting: count(rows, x => x.negativeWrongExisting),
      negativeExact: count(rows, x => !x.positive && x.userExact),
      negativeRelatedMismatch: count(rows, x => !x.positive && !x.relatedExact),
      newExact: rows.some(x => x.expected === 'new_task_proposal' && x.userExact && x.assistantExact),
      userWrongWasBinding: count(rows, x => x.userWrongWasBinding), inputTokens: sum(gen, x => x.usage.inputTokens),
      outputTokens: sum(gen, x => x.usage.outputTokens), generationMs: perf(gen.map(x => x.latencyMs)), turnMs: perf(rows.map(x => x.latencyMs)) }]
  }))
  const paired = [...new Set(inputs.map(x => x.probe))].map(probe => ({ probe, arms: Object.fromEntries(
    details.filter(x => x.probe === probe).map(x => [x.arm, { userExact: x.userExact, assistantExact: x.assistantExact }])) }))
  const leak = count(details, x => x.leak), mutation = count(details, x => x.mutation), unexpectedTools = sum(details, x => x.unexpectedTools)
  const mechanism = !run.stopped && details.length === 24 && raw.length === 24 && completions.length === 24
    && Object.values(arms).every(x => x.completed === 8 && x.sameGeneration === 8 && x.answers >= 7)
    && !leak && !mutation && !unexpectedTools
  const userGain = { evidence: arms.B.userExact - arms.A.userExact, omitBinding: arms.C.userExact - arms.B.userExact }
  const evidenceGain = mechanism && userGain.evidence >= 1 && !arms.B.negativeWrongExisting
  const omitBindingGain = mechanism && userGain.omitBinding >= 1 && !arms.C.negativeWrongExisting
  const qualifies = a0 => a0.userExact >= 7 && a0.assistantExact >= 7 && a0.existingExact >= 3
    && !a0.wrongExisting && a0.newExact && a0.negativeExact >= 3
  const eligible = { B: evidenceGain && qualifies(arms.B), C: omitBindingGain && qualifies(arms.C) }
  return { provenance: run.provenance, stopped: run.stopped, mechanism, evidenceGain, omitBindingGain, eligible, userGain, arms,
    outcome: run.stopped ? 'INCONCLUSIVE_STOPPED' : eligible.B || eligible.C ? 'PASS_SCOPED' : 'GATE_NOT_MET',
    leak, mutation, unexpectedTools, paired,
    performance: { attempts: attempts.length, completions: completions.length, raw: raw.length, reconciled: used.size,
      inputTokens: sum(completions, x => x.usage.inputTokens), outputTokens: sum(completions, x => x.usage.outputTokens),
      generationMs: perf(completions.map(x => x.latencyMs)) }, details }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, runDir, out] = process.argv.slice(2)
  assert(corpus && runDir && out, 'Usage: node score.mjs <corpus-dir> <evaluation-dir> <new-output-file>')
  const run = JSON.parse(readFileSync(join(runDir, 'run-summary.json'), 'utf8'))
  for (const [file, key] of [['model-inputs', 'inputs'], ['ground-truth', 'truth'], ['host-catalog', 'catalog']]) {
    assert.equal(digest(readFileSync(join(corpus, file + '.jsonl'))), run.frozen[key])
  }
  const rows = (dir, file) => existsSync(join(dir, file + '.jsonl'))
    ? readFileSync(join(dir, file + '.jsonl'), 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse) : []
  writeFileSync(out, JSON.stringify(score(rows(corpus, 'model-inputs'), rows(corpus, 'ground-truth'), rows(runDir, 'native-results'),
    rows(runDir, 'generation-ledger'), rows(runDir, 'completion-sidecar'), run), null, 2) + '\n', { flag: 'wx' })
}
