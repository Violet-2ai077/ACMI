import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { acts, claims, counts, exact, identities, intents, operations, read, reviewVersion, sha, spanOK, write } from './contract.mjs'
export { spanOK }

const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/iu.test(id)
const attested = 'human_attested_identity_requires_custodian_verification'
const utc = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().replace('.000Z', 'Z') === s.replace('.000Z', 'Z')
const note = s => typeof s === 'string' && s.trim().length >= 8 && s.length <= 4000
const fieldSet = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(k => keys.includes(k))
const validPacket = p => p?.protocol === reviewVersion && ['A', 'B'].includes(p.lane) && Array.isArray(p.cases)
  && p.packetId === sha(JSON.stringify([p.lane, p.cases])) && new Set(p.cases.map(c => c.id)).size === p.cases.length

function checkRecord(c, r) {
  const errors = []
  const check = (ok, label) => { if (!ok) errors.push(label) }
  check(fieldSet(r, ['case', 'intent', 'identity', 'taskId', 'targetAbsent', 'operation', 'reason', 'acts', 'claims']), 'fields')
  check(intents.includes(r.intent) && identities.includes(r.identity) && operations.includes(r.operation), 'label')
  check(note(r.reason), 'rationale')
  const target = c.tasks.find(t => t.id === r.taskId)
  check(exact(r.identity) ? target?.status === (r.identity === 'active' ? 'open' : 'closed') : r.taskId === null, 'target')
  const absence = { active: 'no', historical: 'no', ambiguous: 'no', missing: 'yes', none: 'not_applicable', new: 'not_applicable' }[r.identity]
  check(absence ? r.targetAbsent === absence : ['yes', 'unknown'].includes(r.targetAbsent), 'target absence')
  check(Array.isArray(r.acts) && r.acts.length <= 32 && r.acts.every(a => a && acts.includes(a.act) && a.turn === c.focus && spanOK(c.turns, a)), 'L1 evidence')
  check(Array.isArray(r.claims) && r.claims.length <= 24 && r.claims.every(x => x && claims.includes(x.kind)
    && ['supported', 'contradicted', 'insufficient', 'context_only'].includes(x.support)
    && ['explicit', 'inferred'].includes(x.mode) && note(x.reason)
    && (x.taskId === null || c.tasks.some(t => t.id === x.taskId && t.status === 'open'))
    && Array.isArray(x.evidence) && x.evidence.length <= 8 && (x.support !== 'supported' || x.evidence.length > 0)
    && x.evidence.every(e => e?.fact ? c.facts.some(f => f.turn === e.turn && f.kind === e.fact) : spanOK(c.turns, e))), 'L4 evidence')
  return errors
}

export function importBatch(packet, submission) {
  assert(validPacket(packet), 'Invalid packet integrity receipt')
  const byId = new Map(packet.cases.map(c => [c.id, c]))
  const result = { valid: [], missing: [...byId.keys()], errors: [], identityVerified: false }
  if (submission === null) return result
  if (!fieldSet(submission, ['protocol', 'lane', 'packetId', 'reviewerId', 'submittedAt', 'attestation', 'records'])
    || submission?.protocol !== reviewVersion || submission?.lane !== packet.lane || submission?.packetId !== packet.packetId
    || !validId(submission?.reviewerId) || !utc(submission?.submittedAt) || submission?.attestation !== attested
    || !Array.isArray(submission?.records) || submission.records.length > byId.size) {
    result.errors.push({ issue: 'invalid envelope or absent human attestation' })
    return result
  }
  const occurrences = counts(submission.records.map(r => r?.case ?? ''))
  for (const r of submission.records) {
    const c = byId.get(r?.case)
    const errors = !c || occurrences[r.case] !== 1 ? ['unknown or duplicate case'] : checkRecord(c, r)
    if (errors.length) result.errors.push({ case: c?.id ?? null, errors })
    else result.valid.push(r)
  }
  const valid = new Set(result.valid.map(r => r.case))
  result.missing = result.missing.filter(id => !valid.has(id))
  return result
}

export function reconcile(mapping, lanes) {
  assert(new Set(mapping.map(m => m.case)).size === mapping.length, 'Duplicate canonical case')
  return ['A', 'B'].map(lane => {
    const records = lanes[lane]
    const lookup = new Map(mapping.map(m => [m[lane].item, m]))
    assert.equal(lookup.size, mapping.length, 'Duplicate blinded case')
    return records.map(r => {
      const m = lookup.get(r.case)
      assert(m, 'Missing lane map')
      const translate = (dict, id) => {
        if (id === null) return null
        assert(typeof dict[id] === 'string', 'Unknown local alias')
        return dict[id]
      }
      const span = s => ({ ...s, turn: translate(m[lane].turns, s.turn) })
      return { ...r, case: m.case, taskId: translate(m[lane].tasks, r.taskId), acts: r.acts.map(span),
        claims: r.claims.map(x => ({ ...x, taskId: translate(m[lane].tasks, x.taskId), evidence: x.evidence.map(span) })) }
    })
  })
}

function agreement(pairs) {
  const labels = [...new Set(pairs.flat())].sort()
  const confusion = Object.fromEntries(labels.map(a => [a, Object.fromEntries(labels.map(b => [b, 0]))]))
  let same = 0
  for (const [a, b] of pairs) { confusion[a][b]++; same += Number(a === b) }
  const n = pairs.length
  const raw = n ? same / n : null
  const chance = n ? labels.reduce((acc, x) => acc + pairs.filter(p => p[0] === x).length * pairs.filter(p => p[1] === x).length, 0) / n ** 2 : null
  return { same, n, raw, kappa: n && chance !== 1 ? (raw - chance) / (1 - chance) : null, confusion }
}
const setKey = values => JSON.stringify([...new Set(values)].sort())
const spanKey = e => JSON.stringify([e.turn, e.actor, e.start, e.end, e.fact])
const claimKey = c => JSON.stringify([c.kind, c.support, c.mode, c.taskId])
const views = {
  intent: r => r.intent, identity: r => r.identity, taskId: r => r.taskId ?? '(absent)',
  targetAbsent: r => r.targetAbsent, operation: r => r.operation, ambiguity: r => String(r.identity === 'ambiguous'),
  claimSet: r => setKey(r.claims.map(claimKey)), acts: r => setKey(r.acts.map(a => a.act)),
  explicitAcceptance: r => String(r.acts.some(a => a.act === 'explicit_acceptance')),
  evidence: r => setKey([...r.acts.map(a => a.act + spanKey(a)), ...r.claims.flatMap(x => x.evidence.map(e => claimKey(x) + spanKey(e)))]),
}
const intervals = r => [...r.acts, ...r.claims.flatMap(c => c.evidence)].filter(e => !e.fact)
  .reduce((keys, e) => {
    for (let i = e.start; i < e.end; i++) keys.add(e.turn + ':' + i)
    return keys
  }, new Set())
export function compare(a, b) {
  const bs = new Map(b.map(r => [r.case, r]))
  const pairs = a.filter(r => bs.has(r.case)).map(r => [r, bs.get(r.case)])
  const out = Object.fromEntries(Object.entries(views).map(([k, project]) => [k, agreement(pairs.map(p => p.map(project)))]))
  const disagreements = pairs.flatMap(([a, b]) => {
    const dimensions = Object.keys(views).filter(k => views[k](a) !== views[k](b))
    return dimensions.length ? [{ case: a.case, dimensions, A: a, B: b }] : []
  })
  const overlaps = pairs.flatMap(pair => {
    const [a, b] = pair.map(intervals)
    const intersection = [...a].filter(i => b.has(i)).length
    return a.size + b.size ? [intersection / (a.size + b.size - intersection)] : []
  })
  return { ...out, paired: pairs.length, disagreements,
    evidenceOverlap: { meanIoU: overlaps.length ? overlaps.reduce((s, x) => s + x, 0) / overlaps.length : null, n: overlaps.length },
    adjudicationRate: null, status: 'unverified_human_attestation' }
}

function inspectPair(a, b, mapping, submissions) {
  assert(a.lane === 'A' && b.lane === 'B')
  const imports = [a, b].map((p, i) => importBatch(p, submissions[i]))
  if (imports.every(r => r.valid.length)) assert.notEqual(submissions[0].reviewerId, submissions[1].reviewerId, 'Lanes must be independent')
  assert(mapping.length === a.cases.length && a.cases.length === b.cases.length)
  for (const packet of [a, b]) {
    const ids = new Set(packet.cases.map(c => c.id))
    assert(mapping.every(m => ids.has(m[packet.lane]?.item)), 'Wrong mapping for packet')
  }
  const report = compare(...reconcile(mapping, { A: imports[0].valid, B: imports[1].valid }))
  return { protocol: reviewVersion, packets: [a.packetId, b.packetId],
    submissionHashes: submissions.map(s => sha(JSON.stringify(s))), ...report,
    imports: imports.map(({ errors, missing, valid }) => ({ errors, missing, valid: valid.length })),
    identityVerified: false }
}

export function adjudicate(report, submission, laneA, mapping, submissions) {
  assert(report.protocol === reviewVersion && submission.protocol === reviewVersion)
  assert(submission.reportHash === sha(JSON.stringify(report)), 'Stale review report')
  assert(report.submissionHashes.every((h, i) => h === sha(JSON.stringify(submissions[i]))), 'Stale reviewer submission')
  assert(validId(submission.adjudicatorId) && utc(submission.submittedAt) && submission.attestation === attested)
  assert(submissions.every(s => s?.reviewerId !== submission.adjudicatorId), 'Adjudicator must be independent')
  assert(report.disagreements.length > 0 && submission.records.length > 0, 'Nothing to adjudicate')
  const pending = new Map(report.disagreements.map(d => [d.case, d]))
  const revisions = []
  for (const r of submission.records) {
    const d = pending.get(r.case)
    assert(d && note(r.rationale), 'Not an unresolved disagreement')
    const m = mapping.find(x => x.case === r.case)
    const c = laneA.cases.find(x => x.id === m.A.item)
    assert(c)
    const fromA = r.choice === 'revised' && r.revised?.case === c.id
    if (fromA) assert.deepEqual(checkRecord(c, r.revised), [])
    const final = r.choice === 'A' ? d.A : r.choice === 'B' ? d.B
      : fromA ? reconcile([m], { A: [r.revised], B: [] })[0][0] : null
    assert(final, 'Choose A, B or a validated revised annotation')
    revisions.push({ case: r.case, choice: r.choice, rationale: r.rationale, final,
      originals: [sha(JSON.stringify(d.A)), sha(JSON.stringify(d.B))] })
    pending.delete(r.case)
  }
  return { protocol: reviewVersion, reportHash: submission.reportHash, submittedAt: submission.submittedAt,
    adjudicatorId: submission.adjudicatorId, submissionHash: sha(JSON.stringify(submission)),
    revisions, unresolved: [...pending.keys()], adjudicationRate: revisions.length / report.disagreements.length,
    identityVerified: false, qualification: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, aPath, bPath, mapPath, subAPath, subBPath, out, adjudicationPath, ...extra] = process.argv.slice(2)
  assert(!extra.length && out && (command === 'compare' && !adjudicationPath || command === 'adjudicate' && adjudicationPath),
    'Usage: annotation.mjs compare|adjudicate <packet-a> <packet-b> <map> <submission-a|-> <submission-b|-> <new-receipt> [adjudication]')
  const [a, b, mapping] = [aPath, bPath, mapPath].map(read)
  const submissions = [subAPath, subBPath].map(p => p === '-' ? null : read(p))
  const report = inspectPair(a, b, mapping, submissions)
  write(out, command === 'compare' ? report : adjudicate(report, read(adjudicationPath), a, mapping, submissions))
}
