import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readAssignmentFrame, safeAssignmentText } from '../../integrations/dsh/dist/assignment-inline.js'
import { hash } from '../phase-0.9.14/design.mjs'
import { sameAssignment } from '../phase-0.9.14/anchor.mjs'
import { catalogMarker, packetFor } from './design.mjs'
import pin from './frozen.json' with { type: 'json' }
import { readProposals } from './proposal.mjs'

const existing = x => Boolean(x && typeof x.taskId === 'string')
const equal = (x, y) => existing(x) || existing(y) ? sameAssignment(x, y) : x === y
const contains = (text, word) => typeof text === 'string' && text.toLowerCase().includes(word.toLowerCase())
const count = (rows, fn) => rows.filter(fn).length
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0)
const q = (xs, p) => xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1] : null
const quantiles = xs => ({ p50: q(xs, 0.5), p95: q(xs, 0.95) })
const index = (rows, k = r => r.id) => {
  const byKey = new Map(rows.map(r => [k(r), r]))
  assert.equal(byKey.size, rows.length, 'Duplicate record')
  return byKey
}
const rawIdentity = x => x?.assignment ?? (x?.kind === 'propose_new' ? 'new_task_proposal' : x?.kind) ?? null
const match = (x, expected, goal, expectedGoal) =>
  equal(x, expected) && (expected !== 'new_task_proposal' || contains(goal, expectedGoal))

export function compareRoles(raw, host, gold) {
  return {
    userExact: match(rawIdentity(raw.user), gold.user, raw.user?.goal, gold.newGoal),
    assistantExact: match(rawIdentity(raw.assistant), gold.assistant, raw.assistant?.goal, gold.newGoal),
    hostUserExact: match(host?.user, gold.user, host?.newGoal, gold.newGoal),
    hostAssistantExact: match(host?.assistant, gold.assistant, host?.assistantGoal, gold.newGoal),
    hostRejected: !host || host.issues.length > 0,
  }
}

export function decide(hostOK, { A, B }, stopped = null) {
  if (stopped) return 'INCONCLUSIVE_STOPPED'
  if (!hostOK) return 'HOST_GATE_NOT_MET'
  const qualifies = B.userExact >= 10 && B.assistantExact >= 10 && B.userExact >= A.userExact && B.assistantExact >= A.assistantExact
    && B.userExact + B.assistantExact - A.userExact - A.assistantExact >= 2 && B.targetedBoth >= 4
    && B.relativeContinuedBoth === 2 && !B.wrongAnchorInheritance && !B.wrongExisting
    && B.answerPassed >= 10 && B.answerPassed >= A.answerPassed
  return qualifies ? 'PASS_SCOPED_MODEL' : 'PASS_HOST_MODEL_GATE_NOT_MET'
}

const ticket = r => r.ticket
const receiptKeys = (a, b) => a && b && a.id === b.id && a.arm === b.arm && a.generation === b.generation && a.ticket === b.ticket

function reconcile(inputs, ledger, raw, receipts, run) {
  const a = ledger.filter(r => r.kind === 'attempt'), c = ledger.filter(r => r.kind === 'complete')
  const attempts = index(a, ticket), completions = index(c, ticket), bodies = index(raw, ticket)
  index(a, r => r.generation)
  assert(a.length <= 24 && a.every((r, i) => r.ticket === i + 1 && r.id === inputs[i]?.id && r.arm === inputs[i]?.arm))
  for (const r of c) {
    const tried = attempts.get(r.ticket), rec = receipts.get(r.id)
    assert(receiptKeys(tried, r) && rec?.requestDigest === tried.requestDigest)
    const { inputTokens, outputTokens, totalTokens } = r.usage
    assert(Number.isInteger(inputTokens) && Number.isInteger(outputTokens) && inputTokens === tried.inputTokens && inputTokens > 0
      && inputTokens <= 1400 && outputTokens >= 0 && outputTokens <= 320 && totalTokens === inputTokens + outputTokens)
  }
  for (const r of raw) {
    const done = completions.get(r.ticket)
    assert(receiptKeys(done, r) && r.stop === done.stop && hash(r.raw) === done.responseDigest)
    assert.deepEqual(r.usage, done.usage)
  }
  const reserved = sum(a, r => r.inputTokens + 320)
  assert(reserved <= 41280)
  if (run.backend) {
    assert.equal(run.backend.attempts, a.length)
    assert.equal(run.backend.reserved, reserved)
  }
  return { a, c, attempts, completions, bodies, reserved }
}

export function score({ inputs, truth, catalog, launches, packets, anchors, native, ledger, raw, run, runtime }) {
  const byId = index(inputs), gold = index(truth), cuts = index(catalog), fixtures = index(launches), wire = index(packets)
  const receipts = index(anchors)
  index(native)
  const { a, c, attempts, completions, bodies, reserved } = reconcile(inputs, ledger, raw, receipts, run)
  const used = new Set()
  const details = native.map(r => {
    const item = byId.get(r.id), expected = gold.get(r.id), h = receipts.get(r.id), cut = cuts.get(r.id), f = fixtures.get(r.id)
    assert(item && expected && h && cut && f && r.steps.length <= 1)
    const s = r.steps[0], user = r.native.user
    assert.deepEqual(h.request, f.request)
    const planned = packetFor(item, h.source)
    const { id, ...packet } = wire.get(r.id)
    assert.equal(id, item.id)
    assert.deepEqual(planned.packet, packet)
    assert.deepEqual(planned.receipt, h)
    const mapped = h.modelAnchorRef === null ? null : cut.links[h.modelAnchorRef]
    const anchorOK = h.status === expected.anchorVerdict && h.arm === item.arm && h.eventId === (f.launch?.eventId ?? null)
      && h.source.sessionId === r.native.session && h.source.nativeUserId === user?.id && h.source.sourceUserSeq === user?.seq
      && equal(h.launchTarget, expected.launchTarget) && equal(h.effective, expected.anchorEffective) && equal(mapped, expected.anchorEffective)
    if (s) {
      const tried = attempts.get(s.ticket), body = bodies.get(s.ticket)
      assert(tried && body && !used.has(s.ticket) && tried.id === r.id && s.generation === body.generation
        && s.raw === body.raw && s.stop === body.stop && s.requestDigest === tried.requestDigest)
      assert.deepEqual(s.usage, body.usage)
      used.add(s.ticket)
    }
    const proposals = readProposals(s?.raw ?? '', s?.stop, item.arm, { links: cut.links, anchorRef: h.modelAnchorRef },
      readAssignmentFrame, safeAssignmentText)
    const d = s?.decoded, exact = compareRoles(proposals, d, expected)
    const identities = [rawIdentity(proposals.user), rawIdentity(proposals.assistant)]
    const visible = r.native.assistant[0]?.text, completed = r.native.end === 'completed'
    const frame = proposals.frame ? readAssignmentFrame(s.raw, s.stop) : null
    const sameGeneration = r.adapterCalls === 1 && r.native.assistant.length === 1 && Boolean(d && frame?.tag)
      && frame.answer === visible && user?.seq === s.sourceUserSeq
      && JSON.stringify(r.native.assistant[0].usage) === JSON.stringify(completions.get(s.ticket).usage)
    return { id: r.id, probe: item.probe, arm: item.arm, family: item.family, anchorOK, exposed: h.modelAnchorRef !== null,
      targeted: expected.targeted, continuation: expected.continuation, conflict: expected.conflict, targetPosition: expected.targetPosition,
      expectedUser: expected.user, expectedAssistant: expected.assistant, expectedGoal: expected.newGoal, expectedIntent: expected.intent,
      proposals, ...exact, host: d ? { user: d.user, assistant: d.assistant, issues: d.issues, related: d.related } : null,
      hostWithheld: s?.withheld ?? null, wrongExisting: identities.some((v, i) => existing(v) && !(i ? exact.assistantExact : exact.userExact)),
      wrongAnchorInheritance: expected.conflict && identities.some(v => equal(v, h.effective)),
      answerPassed: completed && expected.words.every(group => group.some(word => contains(visible, word))),
      sameGeneration, completed, leak: r.leaked, mutation: !Object.values(r.unchanged).every(Boolean),
      operations: r.native.calls.length + r.native.results.length + (s?.actions.length ?? 0), turnMs: r.latencyMs }
  })
  const pairs = details.filter(x => x.arm === 'A').flatMap(x => {
    const y = details.find(z => z.probe === x.probe && z.arm === 'B')
    if (!y) return []
    const wa = wire.get(x.id), wb = wire.get(y.id)
    const suffix = p => p.prompt.slice(p.prompt.lastIndexOf(catalogMarker) + catalogMarker.length)
    return [{ probe: x.probe, family: x.family, targeted: x.targeted, targetPosition: x.targetPosition,
      sameContext: wa.focus === wb.focus && suffix(wa) === suffix(wb), schemaDiffers: JSON.stringify(wa.schema) !== JSON.stringify(wb.schema),
      anchorEqual: receipts.get(x.id).modelAnchorRef === receipts.get(y.id).modelAnchorRef,
      user: [x.userExact, y.userExact], assistant: [x.assistantExact, y.assistantExact], answer: [x.answerPassed, y.answerPassed] }]
  })
  const arms = Object.fromEntries(['A', 'B'].map(arm => {
    const rows = details.filter(x => x.arm === arm), gen = c.filter(x => x.arm === arm)
    return [arm, { rows: rows.length, anchorOK: count(rows, x => x.anchorOK), exposed: count(rows, x => x.exposed),
      completed: count(rows, x => x.completed), sameGeneration: count(rows, x => x.sameGeneration),
      userExact: count(rows, x => x.userExact), assistantExact: count(rows, x => x.assistantExact),
      validBoth: count(rows, x => x.proposals.user && x.proposals.assistant),
      intentExact: count(rows, x => x.proposals.intent === x.expectedIntent), answerPassed: count(rows, x => x.answerPassed),
      targetedBoth: count(rows, x => x.targeted && x.userExact && x.assistantExact),
      continuedBoth: count(rows, x => x.continuation && x.userExact && x.assistantExact),
      relativeContinuedBoth: count(rows, x => x.continuation && x.userExact && x.assistantExact
        && x.proposals.user.kind === 'continue_anchor' && x.proposals.assistant.kind === 'continue_anchor'),
      wrongExisting: count(rows, x => x.wrongExisting), wrongAnchorInheritance: count(rows, x => x.wrongAnchorInheritance),
      existingEligible: count(rows, x => existing(x.expectedUser)),
      existingCovered: count(rows, x => existing(x.expectedUser) && existing(rawIdentity(x.proposals.user))),
      hostUserExact: count(rows, x => x.hostUserExact), hostAssistantExact: count(rows, x => x.hostAssistantExact),
      hostRejected: count(rows, x => x.hostRejected), withheld: count(rows, x => x.hostWithheld),
      inputTokens: sum(gen, x => x.usage.inputTokens), outputTokens: sum(gen, x => x.usage.outputTokens),
      generationMs: quantiles(gen.map(x => x.latencyMs)), turnMs: quantiles(rows.map(x => x.turnMs)) }]
  }))
  const leaks = count(details, x => x.leak), mutations = count(details, x => x.mutation), operations = sum(details, x => x.operations)
  const hostOK = !run.stopped && run.runtimeStopped && run.backend?.externalProviderRequests === 0 && run.wallMs <= 1800000
    && run.records === 24 && run.requested === 24 && a.length === 24 && c.length === 24 && used.size === 24 && raw.length === 24
    && anchors.length === 24 && runtime.generationStarts === 24 && !runtime.ownedListenerStillOpen && pairs.length === 12
    && pairs.every(x => x.sameContext && x.schemaDiffers && x.anchorEqual) && !leaks && !mutations && !operations
    && Object.values(arms).every(x => x.anchorOK === 12 && x.exposed === 6 && x.completed === 12 && x.sameGeneration === 12)
  return { outcome: decide(hostOK, arms, run.stopped), provenance: run.provenance, stopped: run.stopped, hostOK, arms, pairs,
    leaks, mutations, operations, performance: { attempts: a.length, completions: c.length, reconciled: used.size, reserved,
      inputTokens: sum(c, x => x.usage.inputTokens), outputTokens: sum(c, x => x.usage.outputTokens),
      generationMs: quantiles(c.map(x => x.latencyMs)) }, details }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, evaluation, out] = process.argv.slice(2)
  assert(corpus && evaluation && out, 'Usage: node score.mjs <corpus> <evaluation> <new-result>')
  const get = (dir, file) => readFileSync(join(dir, file), 'utf8')
  const run = JSON.parse(get(evaluation, 'run-summary.json'))
  assert.deepEqual(run.frozen, pin)
  const runtime = JSON.parse(get(evaluation, 'runtime-observation.json'))
  const data = {}
  for (const [key, name] of Object.entries({ inputs: 'model-inputs', truth: 'ground-truth', catalog: 'host-catalog',
    launches: 'trusted-launch-fixtures', packets: 'model-packets' })) {
    const bytes = get(corpus, name + '.jsonl')
    assert.equal(hash(bytes), pin[key])
    data[key] = bytes.trimEnd().split('\n').map(JSON.parse)
  }
  for (const [key, name] of Object.entries({ anchors: 'anchor-receipts', native: 'native-results',
    ledger: 'generation-ledger', raw: 'completion-sidecar' })) {
    const file = name + '.jsonl'
    data[key] = existsSync(join(evaluation, file)) ? get(evaluation, file).trimEnd().split('\n').filter(Boolean).map(JSON.parse) : []
  }
  writeFileSync(out, JSON.stringify(score({ ...data, run, runtime }), null, 2) + '\n', { flag: 'wx' })
}
