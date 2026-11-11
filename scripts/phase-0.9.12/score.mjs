import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const sha = data => createHash('sha256').update(data).digest('hex')
const existing = x => Boolean(x && typeof x.taskId === 'string')
const equal = (a, b) => existing(a) && existing(b) ? a.taskId === b.taskId && a.workId === b.workId : a === b
const n = (rows, p) => rows.filter(p).length
const sum = (rows, p) => rows.reduce((s, r) => s + p(r), 0)
const parse = x => { try { return JSON.parse(x) } catch { return null } }
const q = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1] : null
const perf = a => ({ p50: q(a, 0.5), p95: q(a, 0.95) })
const contains = (text, words) => typeof text === 'string' && words.every(w => text.toLowerCase().includes(w.toLowerCase()))
const value = key => key === 'amber' ? 'amber=17' : key === 'indigo' ? 'indigo=29' : null
const map = (rows, key) => {
  const out = new Map(rows.map(r => [key(r), r]))
  assert.equal(out.size, rows.length, 'Duplicate identifiers')
  return out
}

export function score(inputs, truth, native, ledger, run) {
  const byId = map(inputs, x => x.id), gold = map(truth, x => x.id)
  map(native, x => x.id)
  const attempts = ledger.filter(x => x.kind === 'attempt'), completes = ledger.filter(x => x.kind === 'complete')
  assert(attempts.length <= 24 && attempts.every((x, i) => x.ticket === i + 1), 'Ledger budget or order violated')
  map(attempts, x => x.generation)
  const a = map(attempts, x => x.ticket), c = map(completes, x => x.ticket)
  const seen = new Set()
  const details = native.map(r => {
    const item = byId.get(r.id), target = gold.get(r.id)
    assert(item && target && r.steps.length <= (item.toolAvailable ? 2 : 1), 'Unknown or over-budget turn')
    let nativeIndex = 0, initial = false, same = 0
    for (const [i, step] of r.steps.entries()) {
      const ticket = a.get(step.ticket), completion = c.get(step.ticket)
      assert(ticket && completion && !seen.has(step.ticket), 'Receipt missing or duplicated')
      assert(ticket.id === r.id && completion.id === r.id && ticket.arm === item.arm && completion.arm === item.arm
        && ticket.generation === step.generation && completion.generation === step.generation)
      assert.equal(ticket.requestDigest, step.requestDigest)
      assert.equal(completion.responseDigest, sha(step.raw))
      assert.equal(completion.stop, step.stop)
      assert.deepEqual(completion.usage, step.usage)
      const { inputTokens, outputTokens, totalTokens } = completion.usage
      assert(ticket.inputTokens === inputTokens && inputTokens > 0 && inputTokens <= 1400
        && outputTokens >= 0 && outputTokens <= 320 && inputTokens + outputTokens === totalTokens, 'Usage fence')
      seen.add(step.ticket)
      if (!step.decoded) continue
      const visible = r.native.assistant[nativeIndex++], raw = parse(step.raw)
      if (visible && raw?.answer === visible.text && raw.tag && typeof raw.tag === 'object'
        && r.native.user?.seq === step.sourceUserSeq && JSON.stringify(visible.usage) === JSON.stringify(step.usage)) {
        same++
        if (i === 0) initial = true
      }
    }
    const first = r.steps[0], proposed = first?.decoded
    const user = proposed?.user ?? null, assistant = proposed?.assistant ?? null
    const match = (got, expected, goal) => equal(got, expected)
      && (expected !== 'new_task_proposal' || contains(goal, target.words))
    const related = item.arm === 'B' ? (proposed?.related ?? []) : null
    const relatedExact = related === null ? null : related.length === target.related.length && target.related.every(x => related.some(y => equal(x, y)))
    const last = r.native.assistant.at(-1)?.text
    const calls = r.native.calls.map(call => ({ ...call, key: parse(call.arguments)?.key }))
    const byCall = map(calls, x => x.callId), action = map(first?.actions ?? [], x => x.callId)
    const origin = result => {
      const call = byCall.get(result.callId), proposal = action.get(result.callId), receipt = result.inherited
      return call && proposal && receipt && receipt.generation === first.generation && receipt.ref === proposal.ref
        && receipt.session === r.native.session && receipt.callId === call.callId && receipt.causation === r.native.session + ':' + call.seq
        && receipt.execution === r.native.session + ':' + call.turn
        && equal(proposal.assignment, { taskId: receipt.task, workId: receipt.work })
    }
    const tool = { expected: target.tools.length, calls: calls.length, results: r.native.results.length,
      exact: n(target.tools, t => calls.some(call => call.name === 'lookup' && call.key === t.key && equal(action.get(call.callId)?.assignment, t.assignment))),
      inherited: n(r.native.results, r0 => origin(r0) && !r0.isError && r0.text === value(byCall.get(r0.callId).key)
        && r0.seq > byCall.get(r0.callId).seq && JSON.stringify(r0.sourceEventSeqs) === JSON.stringify([byCall.get(r0.callId).seq])),
      arrived: n(r.arrivals, r0 => origin(r0) && r0.key === byCall.get(r0.callId).key && r0.value === value(r0.key)),
      reverse: calls.length === 2 && JSON.stringify(r.arrivals.map(x => x.callId)) === JSON.stringify(calls.map(x => x.callId).reverse()),
      order: calls.length === target.tools.length && calls.every((call, i) => call.key === target.tools[i].key) }
    return { id: r.id, arm: item.arm, probe: item.probe, variant: item.variant, family: item.family,
      user, assistant, userExact: match(user, target.user, proposed?.newGoal),
      assistantExact: match(assistant, target.assistant, proposed?.assistantGoal ?? proposed?.newGoal),
      expected: target.user, primaryExpected: target.assistant, related, relatedExpected: target.related, relatedExact,
      intent: proposed?.intent ?? null, intentExpected: target.intent,
      intentExact: item.arm === 'B' ? proposed?.intent === target.intent : null,
      initial, same, end: r.native.end, nativeAnswer: Boolean(last),
      answerOK: target.words.length ? r.native.end === 'completed' && contains(last, target.words) : null,
      validTag: Boolean(proposed && !proposed.issues.length), issues: proposed?.issues ?? [first?.withheld ?? 'NO_COMPLETION'],
      leaked: r.leaked, mutation: !Object.values(r.unchanged).every(Boolean), steps: r.steps.length, tool, latencyMs: r.latencyMs }
  })
  const base = details.filter(x => x.variant === 'base'), variants = details.filter(x => x.variant !== 'base')
  const perArm = arm => {
    const r = base.filter(x => x.arm === arm), gen = completes.filter(x => x.arm === arm && byId.get(x.id).variant === 'base')
    const tool = r.find(x => x.tool.expected > 0)
    return { turns: r.length, completed: n(r, x => x.end === 'completed'), sameGeneration: n(r, x => x.initial), validTags: n(r, x => x.validTag),
      userExact: n(r, x => x.userExact), assistantExact: n(r, x => x.assistantExact),
      existingEligible: n(r, x => existing(x.expected)), existingCovered: n(r, x => existing(x.expected) && existing(x.user)),
      wrongIdentity: n(r, x => (existing(x.user) && !x.userExact) || (existing(x.assistant) && !x.assistantExact)),
      falseNew: n(r, x => (existing(x.expected) && x.user === 'new_task_proposal') || (existing(x.primaryExpected) && x.assistant === 'new_task_proposal')),
      related: arm === 'A' ? null : { correct: n(r, x => x.relatedExpected.length && x.relatedExact), expected: n(r, x => x.relatedExpected.length) },
      intentExact: arm === 'A' ? null : n(r, x => x.intentExact),
      answerPassed: n(r, x => x.answerOK === true), answerAsserted: n(r, x => x.answerOK !== null), tool: tool?.tool ?? null,
      toolPass: Boolean(tool && tool.tool.exact === 2 && tool.tool.inherited === 2 && tool.tool.arrived === 2 && tool.tool.calls === 2
        && tool.tool.results === 2 && tool.tool.reverse && tool.tool.order && tool.steps === 2 && tool.end === 'completed' && tool.answerOK),
      tokens: { calls: gen.length, input: sum(gen, x => x.usage.inputTokens), output: sum(gen, x => x.usage.outputTokens) },
      latency: { generationMs: perf(gen.map(x => x.latencyMs)), turnMs: perf(r.map(x => x.latencyMs)) } }
  }
  const arms = { A: perArm('A'), B: perArm('B') }
  const paired = base.filter(x => x.arm === 'A').map(x => {
    const y = base.find(r => r.arm === 'B' && r.probe === x.probe)
    return y && { probe: x.probe, user: [x.userExact, y.userExact], assistant: [x.assistantExact, y.assistantExact] }
  }).filter(Boolean)
  const jointGain = arms.B.userExact + arms.B.assistantExact - arms.A.userExact - arms.A.assistantExact
  const invariant = n(variants, v => v.userExact && v.assistantExact && base.some(b => b.arm === 'B' && b.probe === v.probe
    && equal(b.user, v.user) && equal(b.assistant, v.assistant)))
  const leak = n(details, x => x.leaked), mutations = n(details, x => x.mutation)
  const unexpected = n(details, x => !x.tool.expected && x.tool.calls > 0)
  const same = n(details, x => x.initial)
  const gates = {
    protocol: !run.stopped && details.length === 22 && same === 22 && paired.length === 10 && seen.size === completes.length
      && Object.values(arms).every(x => x.completed === 10 && x.answerPassed >= 8) && !leak && !mutations && !unexpected,
    tools: arms.A.toolPass && arms.B.toolPass,
    semantic: paired.length === 10 && arms.B.userExact >= 8 && arms.B.assistantExact >= 8 && jointGain >= 2
      && arms.B.existingCovered >= 6 && !arms.B.wrongIdentity && !arms.B.falseNew && arms.B.intentExact >= 9
      && arms.B.related.correct === 3 && invariant === 2,
  }
  return { provenance: run.provenance, stopped: run.stopped, outcome: run.stopped ? 'INCONCLUSIVE_STOPPED'
    : Object.values(gates).every(Boolean) ? 'PASS_SCOPED_PAIRED' : 'GATE_NOT_MET', gates, arms, paired, jointGain, invariant,
  sameGeneration: same, sameIncludingToolFollowups: sum(details, x => x.same),
  unreconciledBackendCompletions: completes.length - seen.size, metadataLeaks: leak, mutations, unexpectedTools: unexpected,
  performance: { attempts: attempts.length, completions: completes.length, input: sum(completes, x => x.usage.inputTokens),
    output: sum(completes, x => x.usage.outputTokens), generationMs: perf(completes.map(x => x.latencyMs)) },
  details }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, runDir, out] = process.argv.slice(2)
  assert(corpus && runDir && out, 'Usage: node score.mjs <corpus-dir> <evaluation-dir> <new-output-file>')
  const run = JSON.parse(readFileSync(join(runDir, 'run-summary.json'), 'utf8'))
  for (const [file, key] of [['model-inputs', 'inputs'], ['ground-truth', 'truth'], ['host-catalog', 'catalog']]) {
    assert.equal(sha(readFileSync(join(corpus, file + '.jsonl'))), run.frozen[key])
  }
  const rows = (dir, file) => existsSync(join(dir, file + '.jsonl'))
    ? readFileSync(join(dir, file + '.jsonl'), 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse) : []
  writeFileSync(out, JSON.stringify(score(rows(corpus, 'model-inputs'), rows(corpus, 'ground-truth'),
    rows(runDir, 'native-results'), rows(runDir, 'generation-ledger'), run), null, 2) + '\n', { flag: 'wx' })
}
