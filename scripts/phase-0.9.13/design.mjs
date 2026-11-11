import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { roleWire } from '../phase-0.9.12/design.mjs'
import { literalMentions } from './evidence.mjs'

export const seed = 'acmi-0913-evidence-triples-v1'
export const hash = s => createHash('sha256').update(s).digest('hex')
const h = (...x) => hash([seed, ...x].join('|'))
const uuid = (...parts) => {
  const s = h(...parts)
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20, 32)
}
const cases = [
  ['explicit-conflict', ['Balsa Mosaic', 'outline tiles'], ['Flint Mural', 'label sections'],
    'Switch to the existing Balsa Mosaic. Tell me which deliverable you will outline, but do not outline it now.',
    0, 'describe_only', ['Balsa Mosaic'], 1],
  ['existing-no-execution', ['Caper Ledger', 'check totals'], ['Linen Summary', 'review the summary'],
    'We will return to Caper Ledger later. For now, only say which item we will work on. Do not check anything yet.',
    0, 'describe_only', ['Caper Ledger'], 1],
  ['whole-task', ['Parchment Journal', null], ['Quartz Journal', 'review entries'],
    'Name the existing Parchment Journal as a whole task. Do not choose a phase or do any work.',
    0, 'describe_only', ['Parchment Journal'], 1],
  ['primary-vs-background', ['Alder Playlist', 'reorder tracks'], ['Lupin Playlist', 'review titles'],
    'Lupin Playlist is only background. Name Alder Playlist as the main work item, then mention Lupin Playlist separately. Do not edit either.',
    0, 'describe_only', ['Alder Playlist', 'Lupin Playlist'], 1, [1]],
  ['quoted-negative', ['Moss Compass', 'check the dial'], ['Frost Note', 'review text'],
    'Repeat the phrase "pause Moss Compass" as a quotation only. It is not a task assignment and you must not act on it.',
    'no_task', 'acknowledge', ['pause Moss Compass'], 0],
  ['conditional-mention', ['Larch Album', 'review photos'], ['Fennel Label', 'check text'],
    'If Larch Album is approved later, we might resume it. Right now I have not identified the item I want. Ask me which item, without proceeding.',
    'unresolved', 'clarify', ['which'], 0],
  ['duplicate-title', ['Wisteria Label', 'prepare the print version'], ['Wisteria Label', 'prepare the digital version'],
    'Resume Wisteria Label. I have not specified which version, print or digital. Ask me which before doing anything.',
    'unresolved', 'clarify', ['which'], 0],
  ['new-with-negative', ['Willow Binder', 'file the notes'], ['Ivy Program', 'check dates'],
    'Do not continue Willow Binder. Suggest the separate new goal Fir Audio Cue, distinct from all existing items. Name the idea but do not create it.',
    'new_task_proposal', 'propose', ['Fir Audio Cue'], 0],
]
const fillers = [['Heather Clip', 'check timings'], ['Bamboo Grid', 'sort rows']]
const order = [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['A', 'C', 'B'],
  ['C', 'B', 'A'], ['B', 'A', 'C'], ['A', 'B', 'C'], ['C', 'B', 'A']]
export const inputs = [], truth = [], catalogs = new Map()

for (const [i, row] of cases.entries()) {
  const [family, a, b, text, expected, intent, words, bound, related = []] = row
  const probe = 'probe-' + String(i + 1).padStart(2, '0')
  const tasks = [a, b, ...fillers]
  const arranged = [0, 1, 2, 3].filter(j => j !== expected).sort((x, y) => h(probe, x).localeCompare(h(probe, y)))
  if (typeof expected === 'number') arranged.splice([2, 0, 3, 1][i], 0, expected)
  const ref = j => 'q-' + h(probe, 'ref', j).slice(0, 5)
  const entity = j => typeof j === 'number' ? { taskId: uuid(probe, 'task', j), workId: tasks[j][1] === null ? null : uuid(probe, 'work', j) } : j
  const candidates = arranged.map(j => ({ ref: ref(j), task: tasks[j][0], work: tasks[j][1] }))
  const links = Object.fromEntries(arranged.map(j => [ref(j), entity(j)]))
  for (const arm of order[i]) {
    const id = probe + ':' + arm
    inputs.push({ id, probe, arm, family, variant: 'base', story: probe + '-' + arm, text, candidates,
      ...(arm === 'C' ? {} : { binding: ref(bound) }), ...(arm === 'A' ? {} : { verifiedMentions: literalMentions(text, candidates) }),
      toolAvailable: false })
    catalogs.set(id, { workspace: uuid(probe, 'scope'), links })
    truth.push({ id, user: entity(expected), assistant: entity(expected), intent, related: related.map(entity), words,
      binding: entity(bound), positive: typeof expected === 'number' })
  }
}

export function evidenceWire(entry, results) {
  const packet = roleWire(entry, results)
  if (entry.arm === 'A') return packet
  const marker = '\nCatalog data: '
  const split = packet.prompt.lastIndexOf(marker)
  if (split === -1) throw new Error('ROLE_CATALOG_NOT_FOUND')
  const catalog = JSON.parse(packet.prompt.slice(split + marker.length))
  catalog.verified_mentions = entry.verifiedMentions
  const note = '\nHost verified each mention is a literal excerpt from this user turn; offsets are UTF-16, end exclusive. A mention is not a decision. Quoting, negating or conditionally mentioning a task does not assign it. The same excerpt can match multiple candidates. Inspect the whole request before choosing.'
  return { ...packet, prompt: packet.prompt.slice(0, split) + note + marker + JSON.stringify(catalog) }
}

const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
const cuts = [...catalogs].map(([id, cut]) => ({ id, ...cut }))
export const frozen = { inputs: hash(jsonl(inputs)), truth: hash(jsonl(truth)), catalog: hash(jsonl(cuts)) }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (root) for (const [name, rows] of [['model-inputs', inputs], ['ground-truth', truth], ['host-catalog', cuts]]) {
    writeFileSync(join(root, name + '.jsonl'), jsonl(rows), { flag: 'wx' })
  }
  console.log(JSON.stringify({ seed, frozen, triples: cases.length, scheduled: inputs.length }))
}
