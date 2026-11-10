import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { canonical } from '../../packages/core/dist/index.js'

export const sha = value => createHash('sha256').update(value).digest('hex')
export const version = 'phase-0.9.1-authored-natural-language-v1'
export const seed = 0x091a2026
export const labels = 'ai_provisional_not_human_reviewed'
export const classes = ['continue_current', 'switch_existing', 'create_new', 'no_task', 'uncertain']
const actors = ['user', 'assistant', 'tool', 'subagent']
const languages = ['zh', 'en', 'mixed']
const splits = ['development', 'validation', 'holdout']
const forbidden = ['model-store-write', 'automatic-binding', 'result-accepted', 'join-satisfied', 'task-closed', 'foreign-task-access']

export function uuid(value) {
  const x = sha(value)
  return [x.slice(0, 8), x.slice(8, 12), '4' + x.slice(13, 16), '8' + x.slice(17, 20), x.slice(20, 32)].join('-')
}
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const grams = text => new Set(Array.from({ length: Math.max(0, text.length - 2) }, (_, i) => text.slice(i, i + 3)))
const lastUser = rows => rows.findLastIndex(r => r.actor === 'user')
function cleanCase(raw) {
  assert(splits.includes(raw.split) && languages.includes(raw.language) && classes.includes(raw.intent))
  assert.match(raw.family, /^[a-z_]+$/u)
  assert(raw.turns.length >= 1 && raw.turns.length <= 64)
  assert(raw.tasks.length <= 64)
  const taskKeys = new Set(raw.tasks.map(t => t.key))
  assert.equal(taskKeys.size, raw.tasks.length)
  assert(raw.binding === null || taskKeys.has(raw.binding))
  if (raw.intent === 'switch_existing' || raw.intent === 'continue_current') {
    assert(taskKeys.has(raw.target))
    assert.notEqual(raw.tasks.find(t => t.key === raw.target).foreign, true)
  } else assert.equal(raw.target, null)
  if (raw.retrievalTarget !== undefined && raw.retrievalTarget !== null) assert(taskKeys.has(raw.retrievalTarget))
  const identity = sha(canonical([version, seed, raw.family, raw.language, raw.turns, raw.tasks]))
  const id = 'q91-' + identity.slice(0, 16)
  const taskIds = new Map(raw.tasks.map(t => [t.key, uuid(identity + '/task/' + t.key)]))
  const turns = raw.turns.map(([actor, text, session = 0], i) => {
    assert(actors.includes(actor) && typeof text === 'string' && text.trim() && text.length <= 8192)
    assert(Number.isSafeInteger(session) && session >= 0 && session <= 16)
    return { id: id + '-turn-' + i, actor, text, session }
  })
  const tasks = raw.tasks.map((task, i) => {
    assert(typeof task.key === 'string' && typeof task.title === 'string' && task.title.trim() && task.title.length <= 160)
    const { key, title, objective = title, foreign = false, status = 'open', age = i * 4, session } = task
    assert(typeof objective === 'string' && objective.trim() && objective.length <= 512)
    assert(['open', 'closed'].includes(status) && Number.isSafeInteger(age) && age >= 0)
    return { taskId: taskIds.get(key), title, objective, foreign, status, age, ...(session === undefined ? {} : { session }) }
  })
  const referenced = raw.evidence ?? (lastUser(turns) >= 0 ? [lastUser(turns)] : [])
  assert(referenced.every(i => Number.isSafeInteger(i) && i >= 0 && i < turns.length))
  const binding = raw.binding === null ? null : taskIds.get(raw.binding)
  const target = raw.target === null ? null : taskIds.get(raw.target)
  const retrievalTarget = raw.retrievalTarget ? taskIds.get(raw.retrievalTarget) : target
  return { id, family: raw.family, language: raw.language, split: raw.split,
    template: raw.family + '/authored-v1', constructionFamily: raw.family + '/dialogue', paraphraseCluster: identity.slice(0, 24),
    taskFixture: 'fixture-' + identity.slice(0, 24), generator: { version, seed }, labelProvenance: labels, humanReviewStatus: 'pending',
    risk: raw.risk ?? 'normal', turns, tasks, binding,
    runtimeFacts: turns.map(t => ({ id: t.id + '-observation', source: t.id, session: t.session,
      kind: { user: 'user', assistant: 'assistant', tool: 'tool-result', subagent: 'turn-complete' }[t.actor], provenance: 'synthetic_fixture',
      contentClaim: t.actor === 'tool' ? 'separate-protected-fixture' : 'no-runtime-content-claim' })),
    expected: { intent: raw.intent, taskId: target, retrievalTarget, changes: raw.changes ?? [], unresolved: raw.unresolved ?? [],
      evidence: referenced.map(i => turns[i].id), forbiddenMutations: forbidden } }
}

export function buildCorpus(raw, complete) {
  const rows = raw.map(cleanCase).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const map = new Map()
  const seen = new Set()
  const unique = new Map()
  for (const row of rows) {
    assert(!seen.has(row.id))
    seen.add(row.id)
    for (const field of ['family', 'template', 'constructionFamily', 'paraphraseCluster', 'taskFixture']) {
      const key = field + ':' + row[field]
      assert(!map.has(key) || map.get(key) === row.split, 'Split leakage at ' + field)
      map.set(key, row.split)
    }
    const text = normalized(row.turns.map(t => t.actor + ' ' + t.text).join('\n'))
    assert(!unique.has(text), 'Exact duplicate dialogue: ' + row.id + ' / ' + unique.get(text))
    unique.set(text, row.id)
  }
  if (complete) assert(rows.length >= 500 && new Set(rows.map(x => x.family)).size >= 30, 'Corpus below qualification target')
  const set = rows.map(row => {
    const txt = normalized(row.turns.map(t => t.text).join(' '))
    return { row, txt, ngrams: grams(txt) }
  })
  const nearDuplicates = []
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
    const a = set[i], b = set[j]
    if (a.row.split === b.row.split || Math.min(a.txt.length, b.txt.length) < 32
      || Math.min(a.ngrams.size, b.ngrams.size) < 0.85 * Math.max(a.ngrams.size, b.ngrams.size)) continue
    const overlap = [...a.ngrams].filter(g => b.ngrams.has(g)).length
    const similarity = overlap / (a.ngrams.size + b.ngrams.size - overlap)
    if (similarity >= 0.85) nearDuplicates.push({ a: a.row.id, b: b.row.id, similarity })
  }
  assert.equal(nearDuplicates.length, 0, 'Cross-split near duplicates; blind integrity check failed')
  const countBy = (data, key) => Object.fromEntries([...new Set(data.map(r => r[key]))].sort()
    .map(value => [value, data.filter(r => r[key] === value).length]))
  const manifest = { version, seed, human_review_status: 'pending', labelProvenance: labels,
    corpusHash: sha(canonical(rows)), size: rows.length, families: countBy(rows, 'family'), languages: countBy(rows, 'language'),
    partitions: Object.fromEntries(splits.map(split => {
      const data = rows.filter(r => r.split === split)
      return [split, { count: data.length, hash: sha(canonical(data)), languages: countBy(data, 'language'), families: countBy(data, 'family') }]
    })), checks: { crossSplitFamilyTemplateFixtureConstructionClusters: 'disjoint', exactDuplicates: 0,
      crossSplitNearDuplicates: nearDuplicates.length, method: 'character-trigram Jaccard >= 0.85; minimum 32 normalized characters' } }
  return { rows, manifest }
}
