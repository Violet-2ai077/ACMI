import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const digest = s => createHash('sha256').update(s).digest('hex')
const equal = (a, b) => a && b && typeof a === 'object' && typeof b === 'object'
  ? a.taskId === b.taskId && a.workId === b.workId : a === b
const existing = v => Boolean(v && typeof v.taskId === 'string')
const n = (rows, p) => rows.filter(p).length
const sum = (rows, p) => rows.reduce((s, r) => s + p(r), 0)
const q = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null
const json = s => { try { return JSON.parse(s) } catch { return null } }
const unique = (rows, key) => {
  const mapped = new Map(rows.map(row => [key(row), row]))
  assert.equal(mapped.size, rows.length, 'Duplicate identifier')
  return mapped
}
const valueOf = key => key === 'amber' ? 'amber=17' : key === 'indigo' ? 'indigo=29' : null

export function score(inputs, truth, native, ledger, run) {
  const byId = unique(inputs, r => r.id), target = unique(truth, r => r.id)
  unique(native, r => r.id)
  const attempts = ledger.filter(r => r.kind === 'attempt'), completes = ledger.filter(r => r.kind === 'complete')
  const aByTicket = unique(attempts, r => r.ticket), cByTicket = unique(completes, r => r.ticket)
  unique(attempts, r => r.generation)
  assert(attempts.length <= 18 && attempts.every((r, i) => r.ticket === i + 1), 'Generation budget/ledger failure')
  const seen = new Set()
  const cases = native.map(r => {
    const item = byId.get(r.id), gold = target.get(r.id)
    assert(item && gold && r.steps.length <= (item.toolAvailable ? 2 : 1), 'Unknown or invalid turn')
    let receiptCount = 0, assistantIndex = 0, initialSameGeneration = false
    for (const [index, step] of r.steps.entries()) {
      const a = aByTicket.get(step.ticket), c = cByTicket.get(step.ticket)
      assert(a && c && !seen.has(step.ticket), 'Missing or duplicate ticket')
      assert(a.id === r.id && c.id === r.id && a.generation === step.generation && c.generation === step.generation)
      assert.equal(a.requestDigest, step.requestDigest)
      assert.equal(c.responseDigest, digest(step.raw))
      assert.deepEqual(c.usage, step.usage)
      assert.equal(c.stop, step.stop)
      assert.equal(a.inputTokens, c.usage.inputTokens)
      assert(c.usage.inputTokens <= 1400 && c.usage.outputTokens <= 320 && c.usage.totalTokens === c.usage.inputTokens + c.usage.outputTokens)
      seen.add(step.ticket)
      const raw = json(step.raw)
      if (step.decoded) {
        const visible = r.native.assistant[assistantIndex++]
        if (visible && raw?.answer === visible.text && typeof raw?.tag === 'object' && raw.tag !== null
          && r.native.user?.seq === step.sourceUserSeq && JSON.stringify(visible.usage) === JSON.stringify(c.usage)) {
          receiptCount++
          if (index === 0) initialSameGeneration = true
        }
      }
    }
    const first = r.steps[0], decoded = first?.decoded
    const finalText = r.native.assistant.at(-1)?.text ?? ''
    const calls = r.native.calls.map(c => ({ ...c, key: json(c.arguments)?.key }))
    const actions = first?.actions ?? []
    const received = r.native.results
    const nativeByCall = unique(calls, c => c.callId)
    const actionByCall = unique(actions, a => a.callId)
    const proof = e => {
      const call = nativeByCall.get(e.callId), original = actionByCall.get(e.callId), observed = e.inherited
      return call && original && observed && observed.callId === call.callId && observed.generation === first.generation
        && observed.ref === original.ref && observed.session === r.native.session
        && observed.causation === r.native.session + ':' + call.seq && observed.execution === r.native.session + ':' + call.turn
        && equal(original.assignment, { taskId: observed.task, workId: observed.work })
    }
    const toolExact = n(gold.tools, (g) => {
      const call = calls.find(c => c.key === g.key)
      return call?.name === 'lookup' && equal(actionByCall.get(call.callId)?.assignment, g.assignment)
    })
    const causal = n(received, e => proof(e) && !e.isError && e.text === valueOf(nativeByCall.get(e.callId).key)
      && e.seq > nativeByCall.get(e.callId).seq && JSON.stringify(e.sourceEventSeqs) === JSON.stringify([nativeByCall.get(e.callId).seq]))
    const arrived = n(r.arrivals, e => proof(e) && e.key === nativeByCall.get(e.callId).key && e.value === valueOf(e.key))
    const reverse = calls.length === 2 && JSON.stringify(r.arrivals.map(a => a.callId)) === JSON.stringify(calls.map(c => c.callId).reverse())
    const toolOrder = calls.length === gold.tools.length && calls.every((c, i) => c.key === gold.tools[i].key)
    const answerOK = gold.words.length ? r.native.end === 'completed' && gold.words.every(w => finalText.toLowerCase().includes(w.toLowerCase())) : null
    const user = decoded?.user ?? null, assistant = decoded?.assistant ?? null
    return { id: r.id, variant: item.variant, family: item.family, expected: gold.assignment, baseline: gold.baseline,
      user, assistant, userExact: equal(user, gold.assignment), assistantExact: equal(assistant, gold.assignment),
      bindingExact: equal(gold.baseline, gold.assignment), targetPosition: gold.targetPosition,
      selectedPosition: item.candidates.findIndex(c => c.ref === json(first?.raw)?.tag?.user_turn) + 1 || null,
      validTag: Boolean(decoded && decoded.issues.length === 0), issues: decoded?.issues ?? [first?.withheld ?? 'NO_COMPLETION'],
      visible: Boolean(r.native.assistant[0]?.text), nativeCompleted: r.native.end === 'completed',
      initialSameGeneration,
      receipts: receiptCount, modelSteps: r.steps.length, answerOK, leaked: r.leaked,
      unexpectedMutation: !Object.values(r.unchanged).every(Boolean),
      toolExpected: gold.tools.length, calls: calls.length, results: received.length, toolExact, causal, arrived, reverse, toolOrder,
      arrivals: r.arrivals.map(x => x.key), nativeResultOrder: received.map(e => nativeByCall.get(e.callId)?.key),
      latencyMs: r.latencyMs }
  })
  const base = cases.filter(r => r.variant === 'base'), variants = cases.filter(r => r.variant !== 'base')
  const tools = base.filter(r => r.toolExpected)
  const userExact = n(base, r => r.userExact), assistantExact = n(base, r => r.assistantExact), bindingExact = n(base, r => r.bindingExact)
  const covered = n(base, r => existing(r.expected) && existing(r.user))
  const wrong = n(base, r => existing(r.user) && !r.userExact)
  const assertionPassed = n(base, r => r.answerOK === true)
  const sameGeneration = n(cases, r => r.initialSameGeneration), complete = n(base, r => r.nativeCompleted)
  const leaks = n(cases, r => r.leaked), mutation = n(cases, r => r.unexpectedMutation)
  const unexpectedTools = n(cases, r => !r.toolExpected && r.calls > 0)
  const invariant = n(variants, r => r.userExact && base.some(b => b.id === r.id.replace(/:[^:]+$/u, ':base') && equal(b.user, r.user)))
  const toolExact = sum(tools, r => r.toolExact), inherited = sum(tools, r => r.causal), arrived = sum(tools, r => r.arrived)
  const reversed = n(tools, r => r.reverse)
  const gates = {
    protocol: !run.stopped && cases.length === 16 && sameGeneration === 16 && complete === 12 && assertionPassed >= 10
      && !leaks && !mutation && !unexpectedTools && completes.length === seen.size,
    semantic: base.length === 12 && userExact >= 9 && userExact > bindingExact && covered >= 8 && wrong === 0 && assistantExact >= 9 && invariant === 4,
    tools: tools.length === 2 && tools.every(r => r.calls === 2 && r.results === 2 && r.modelSteps === 2 && r.toolOrder)
      && toolExact === 4 && inherited === 4 && arrived === 4 && reversed === 2,
  }
  return {
    provenance: run.provenance, outcome: !run.stopped && Object.values(gates).every(Boolean) ? 'PASS_SCOPED_PILOT'
      : run.stopped ? 'INCONCLUSIVE_STOPPED' : 'PILOT_GATE_NOT_MET',
    gates, base: base.length, variants: variants.length, sameGeneration, complete, leaks, mutation, unexpectedTools,
    validTags: n(base, r => r.validTag), userExact, assistantExact, bindingExact, covered,
    eligible: n(base, r => existing(r.expected)), wrong, assertionPassed, asserted: n(base, r => r.answerOK !== null),
    invariant, actions: { cases: tools.length, toolExact, inherited, arrived, reversed, expected: sum(tools, r => r.toolExpected) },
    performance: { attempted: attempts.length, completed: completes.length,
      input: sum(completes, r => r.usage.inputTokens), output: sum(completes, r => r.usage.outputTokens),
      p50GenerationMs: q(completes.map(r => r.latencyMs), 0.5), p95GenerationMs: q(completes.map(r => r.latencyMs), 0.95),
      p50TurnMs: q(base.map(r => r.latencyMs), 0.5), p95TurnMs: q(base.map(r => r.latencyMs), 0.95) },
    positions: [1, 2, 3, 4].map(position => ({ position, targets: n(base, r => r.targetPosition === position),
      exact: n(base, r => r.targetPosition === position && r.userExact), selected: n(base, r => r.selectedPosition === position) })),
    cases,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, evaluation, out] = process.argv.slice(2)
  assert(corpus && evaluation && out, 'Usage: node score.mjs <corpus-dir> <evaluation-dir> <new-output-file>')
  const run = JSON.parse(readFileSync(join(evaluation, 'run-summary.json'), 'utf8'))
  const check = (file, key) => assert.equal(digest(readFileSync(join(corpus, file))), run.frozen[key])
  check('model-inputs.jsonl', 'inputs')
  check('ground-truth.jsonl', 'truth')
  check('host-catalog.jsonl', 'catalog')
  const rows = (dir, file) => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse) : []
  const result = score(rows(corpus, 'model-inputs.jsonl'), rows(corpus, 'ground-truth.jsonl'), rows(evaluation, 'native-results.jsonl'),
    rows(evaluation, 'generation-ledger.jsonl'), run)
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
}
