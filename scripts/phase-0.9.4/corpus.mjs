import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { acts, claims, counts, evidenceSpan, exact, forbiddenMutations, identities,
  intents, operations, opaque, reviewVersion, seed, sha, version, write } from './contract.mjs'

const source = new URL('./open-stories.txt', import.meta.url)
const frozen = new URL('./open-stories.sha256', import.meta.url)
const allowed = {
  dev: 'continuation new-work scope pause social acceptance lifecycle'.split(' '),
  validation: 'cross-session switch similar-deliverable deixis closed rank-limit binding-conflict interleaving correction quotation scope-denial long-context multi-claim'.split(' '),
}
const provenance = 'ai_authored_provisional_not_human_reviewed'
const role = { u: 'user', a: 'assistant', s: 'subagent', t: 'tool', h: 'host', m: 'host' }

function parseStory(split, line) {
  const [family, language, titles, labels, history, focus, extra] = line.split('|')
  assert(extra === undefined && focus && ['zh', 'en', 'mix'].includes(language) && allowed[split]?.includes(family), line)
  const id = opaque(version, focus)
  const workspaceId = 'w-' + opaque('workspace', id)
  const tasks = titles ? titles.split(';').map((title, i) => {
    const [prefix] = title
    const display = title.replace(/^[*!^?]/u, '')
    return { taskId: 't-' + opaque(id, i), workspaceId: prefix === '^' ? 'w-denied' : workspaceId,
      objective: display, aliases: display.includes(':') ? [display.split(':')[0]] : [],
      status: prefix === '!' ? 'closed' : 'open', catalogRevision: prefix === '?' ? 0 : 1,
      revision: 1, lastActivity: 1000 - i, reason: 'lexical' }
  }) : []
  const binding = tasks[titles.split(';').findIndex(t => t.startsWith('*'))]?.taskId ?? null
  let session = 1
  const turns = [...(history ? history.split('~') : []), /^[uast]:/u.test(focus) ? focus : 'u:' + focus].map((value, i) => {
    if (value.startsWith('>')) { session++; value = value.slice(1) }
    assert(role[value[0]] && value[1] === ':', value)
    const actor = role[value[0]]
    return { id: 'e-' + opaque(id, i), session: 's' + session, actor, text: value.slice(2),
      kind: value[0] === 'm' ? 'metadata' : ['tool', 'subagent'].includes(actor) ? 'causal' : 'message' }
  })
  const focusTurn = turns.at(-1)
  const [intent, identity, n, operation, speech, kinds = ''] = labels.split('/')
  const taskId = n === '-' ? null : tasks[Number(n) - 1]?.taskId
  assert(intents.includes(intent) && identities.includes(identity) && operations.includes(operation))
  assert(exact(identity) ? taskId && tasks.some(t => t.taskId === taskId && t.workspaceId === workspaceId && t.catalogRevision === 1
    && (identity === 'historical') === (t.status === 'closed')) : taskId === null)
  const claimKinds = kinds ? kinds.split(',') : []
  const utteranceActs = speech.split(',')
  assert(claimKinds.every(k => claims.includes(k)) && utteranceActs.every(a => acts.includes(a)))
  const facts = turns.slice(0, -1).filter(t => t.kind === 'causal').map(t => ({
    id: t.id + '-fact', turn: t.id, kind: t.actor === 'tool' ? 'tool-result' : 'subagent-completed',
    ...(binding ? { relatedTaskId: binding } : {}),
  }))
  const gold = { intent, identity, taskId, operation, acts: utteranceActs.map(act => ({ act, ...evidenceSpan(focusTurn) })),
    claims: claimKinds.map(kind => ({ kind, support: ['review'].includes(operation) && !['lifecycle', 'join'].includes(kind)
      ? 'supported' : 'insufficient', mode: 'explicit', evidence: [evidenceSpan(focusTurn)] })),
    unresolvedReason: exact(identity) || ['none', 'new'].includes(identity) ? null : identity, provenance }
  return {
    input: { id, workspaceId, tasks, binding, bindingSession: focusTurn.session, turns, facts, focus: focusTurn.id },
    gold, meta: { split, family, language, storyline: 'story-' + id, fixture: 'fixture-' + id,
      construction: family, risk: ['scope-denial', 'quotation', 'binding-conflict', 'lifecycle', 'acceptance'].includes(family)
        ? 'high' : 'medium', forbiddenMutations },
  }
}

export function loadCorpus() {
  const sourceText = readFileSync(source, 'utf8').replace(/\r\n/gu, '\n')
  assert.equal(sha(sourceText), readFileSync(frozen, 'utf8').trim(), 'Open corpus does not match its freeze receipt')
  let split
  return sourceText.split('\n').filter(line => line && !line.startsWith('#')).flatMap(line => {
    if (line === '[dev]' || line === '[validation]') { split = line.slice(1, -1); return [] }
    return [parseStory(split, line)]
  })
}

const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
function trigrams(s) {
  const chars = [...s]
  return new Set(chars.slice(2).map((c, i) => chars[i] + chars[i + 1] + c))
}
export function auditCorpus(corpus) {
  const duplicates = [], near = [], splitLeaks = []
  const records = corpus.map(({ input, meta }) => {
    const norm = normalize(input.turns.at(-1).text)
    return { id: input.id, meta, norm, grams: trigrams(norm) }
  })
  let splitPairs = 0
  for (const [i, a] of records.entries()) for (const b of records.slice(i + 1)) {
    const cross = a.meta.split !== b.meta.split
    if (cross) splitPairs++
    if (a.norm === b.norm) duplicates.push([a.id, b.id])
    if (cross && ['storyline', 'fixture', 'construction'].some(k => a.meta[k] === b.meta[k])) splitLeaks.push([a.id, b.id])
    const overlap = [...a.grams].filter(g => b.grams.has(g)).length
    const similarity = overlap / (a.grams.size + b.grams.size - overlap)
    if (similarity >= 0.60) near.push({ a: a.id, b: b.id, similarity, cross })
  }
  assert.equal(new Set(records.map(r => r.id)).size, records.length)
  return { total: corpus.length, long: corpus.filter(c => c.input.turns.length >= 10 && c.input.turns.length <= 30).length,
    turns: corpus.reduce((n, c) => n + c.input.turns.length, 0), splitPairs,
    languages: counts(corpus.map(c => c.meta.language)), splits: counts(corpus.map(c => c.meta.split)),
    families: counts(corpus.map(c => c.meta.family)), risk: counts(corpus.map(c => c.meta.risk)), duplicates, near, splitLeaks }
}

export function createPackets(corpus, key = 'open-rehearsal-public-map') {
  const byLane = lane => corpus.map(({ input }) => {
    const { id, turns, tasks, facts, focus, binding, bindingSession, workspaceId } = input
    const map = new Map(tasks.filter(t => t.workspaceId === workspaceId).map(t => [t.taskId, opaque(key, lane, id, t.taskId)]))
    const turnMap = new Map(turns.map(t => [t.id, opaque(key, lane, id, t.id)]))
    const item = { id: opaque(key, lane, id), focus: turnMap.get(focus), binding: map.get(binding) ?? null, bindingSession,
      tasks: tasks.filter(t => map.has(t.taskId)).map(t => ({ id: map.get(t.taskId), title: t.objective,
        status: t.catalogRevision === 1 ? t.status : 'stale' })),
      turns: turns.map(t => ({ id: turnMap.get(t.id), session: t.session, actor: t.actor, text: t.text })),
      facts: facts.map(f => ({ kind: f.kind, turn: turnMap.get(f.turn), task: map.get(f.relatedTaskId) ?? null })) }
    return { item, id, tasks: Object.fromEntries([...map].map(([id, alias]) => [alias, id])),
      turns: Object.fromEntries([...turnMap].map(([id, alias]) => [alias, id])) }
  })
  const lanes = ['A', 'B'].map(byLane)
  const packet = (lane, records) => {
    const cases = records.map(r => r.item).sort((a, b) => a.id.localeCompare(b.id, 'en'))
    return { protocol: reviewVersion, lane, packetId: sha(JSON.stringify([lane, cases])), cases }
  }
  const mapping = corpus.map(({ input }, i) => ({ case: input.id, A: { ...lanes[0][i], item: lanes[0][i].item.id },
    B: { ...lanes[1][i], item: lanes[1][i].item.id } }))
  return { a: packet('A', lanes[0]), b: packet('B', lanes[1]), mapping }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3, 'Usage: node corpus.mjs <new-output-directory>')
  const out = resolve(process.argv[2])
  const corpus = loadCorpus()
  const audit = auditCorpus(corpus)
  assert(!audit.duplicates.length && !audit.splitLeaks.length && !audit.near.some(r => r.cross), 'Corpus leakage')
  mkdirSync(out)
  const manifest = { version, seed, provenance, ...audit, formalHoldout: 0,
    cases: corpus.map(({ input, gold, meta }) => ({ id: input.id, ...meta,
      inputSha256: sha(JSON.stringify(input)), goldSha256: sha(JSON.stringify(gold)) })) }
  for (const split of ['dev', 'validation']) {
    const subset = corpus.filter(x => x.meta.split === split)
    write(join(out, split + '.json'), subset.map(c => c.input))
    write(join(out, split + '-provisional-gold.json'), Object.fromEntries(subset.map(c => [c.input.id, c.gold])))
  }
  const { a, b, mapping } = createPackets(corpus)
  write(join(out, 'reviewer-a-packet.json'), a)
  write(join(out, 'reviewer-b-packet.json'), b)
  write(join(out, 'coordinator-map.rehearsal.json'), mapping)
  write(join(out, 'corpus-manifest.json'), manifest)
  write(join(out, 'split-manifest.json'), { version, seed, allowed, splits: audit.splits, formalHoldout: 0,
    custody: 'custody_not_independent', holdoutConsumed: false })
  console.log(JSON.stringify(audit))
}
