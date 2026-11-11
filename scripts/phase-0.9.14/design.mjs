import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { roleWire } from '../phase-0.9.12/design.mjs'

export const seed = 'acmi-0914-authenticated-anchor-pairs-v1'
export const hash = text => createHash('sha256').update(text).digest('hex')
const h = (...parts) => hash([seed, ...parts].join('|'))
const uuid = (...parts) => {
  const s = h(...parts)
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20, 32)
}
const shared = [['Tamarind Index', 'check its entries'], ['Tamarind Poster', 'check its layout']]
const cases = [
  ['resume', 'continued', shared, { slot: 0, condition: 'valid' }, 0, 'describe_only',
    'Continue that item. Tell me the name of the deliverable you will work on, without making changes yet.', ['Tamarind Index']],
  ['cross-session', 'continued', shared, { slot: 0, condition: 'valid' }, 0, 'describe_only',
    'This is a new chat. Pick up the item I resumed here and say which deliverable it is; do not change it yet.', ['Tamarind Index']],
  ['whole-task', 'whole', [['Tide Register', null], ['Tide Calendar', 'check dates']], { slot: 0, condition: 'valid' }, 0, 'describe_only',
    'For the item I selected, name the overall task. Do not choose a work phase or start work.', ['Tide Register']],
  ['switch-conflict', 'switch', [['Quince Docket', 'outline entries'], ['Teal Poster', 'review its layout']], { slot: 0, condition: 'valid' }, 1, 'describe_only',
    'Do not continue the selected item. Switch the subject to the existing Teal Poster; only say which deliverable we would review.', ['Teal Poster']],
  ['cancel', 'cancel', [['Parchment Roster', 'sort the roster'], ['Clover Chart', 'check labels']], { slot: 0, condition: 'valid' }, 'no_task', 'acknowledge',
    'Cancel this request before doing any work. No task remains in this message; just acknowledge that you will not proceed.', []],
  ['primary-plus-related', 'related', [['Maple Folio', 'index its entries'], ['Ivy Folio', 'check captions']], { slot: 0, condition: 'valid' }, 0, 'describe_only',
    'Use the item I selected as the primary subject and mention Ivy Folio as background. Name both, but do not edit either.',
    ['Maple Folio', 'Ivy Folio'], [1]],
  ['free-explicit', 'free', [['Lime Dial', 'review the markings'], ['Oak Atlas', 'review the pages']], null, 1, 'describe_only',
    'Name the existing Oak Atlas as the deliverable to review later. Do not make changes.', ['Oak Atlas']],
  ['same-title', 'duplicate', [['Birch Card', 'check the printed version'], ['Birch Card', 'check the digital version']], null, 'unresolved', 'clarify',
    'I want to continue Birch Card, but I have not said whether I mean print or digital. Ask me to specify the version.',
    ['print', 'digital']],
  ['revoked', 'revoked', [['Elm Almanac', 'review its rows'], ['Bamboo Docket', 'format the cover']], { slot: 0, condition: 'revoked' }, 'unresolved', 'clarify',
    'Continue the item only if there is an authenticated selection for this request. If there is not, ask me to identify the item.', []],
  ['text-is-not-event', 'quote', [['Hazel Diagram', 'format labels'], ['Sage Roster', 'check rows']], null, 'no_task', 'acknowledge',
    'Quote the words "continue Hazel Diagram" for me. This is just quoted text, not a task selection or request to do work.', ['continue Hazel Diagram']],
  ['new-despite-anchor', 'new', [['Olive Schedule', 'review the slots'], ['Ocher Note', 'check the draft']], { slot: 0, condition: 'valid' }, 'new_task_proposal', 'propose',
    'Leave the selected item alone. Suggest an entirely new work goal called Cedar Audio Cue. Name it, but do not create it.', ['Cedar Audio Cue']],
  ['wrong-session', 'mismatch', [['Cypress List', 'review the list'], ['Peach Marker', 'check the border']], { slot: 0, condition: 'wrong_session' }, 'unresolved', 'clarify',
    'I did not select any work in this chat. I want to continue one of the items but have not said which. Ask me to choose.', []],
]
const filler = [['Copper Guide', 'check the steps'], ['Plum Calendar', 'review the dates']]
export const inputs = [], truth = [], catalogs = new Map(), launches = new Map()
let position = 0
for (const [i, row] of cases.entries()) {
  const [family, cluster, tasks, launch, expected, intent, text, words, related = []] = row
  const probe = 'probe-' + String(i + 1).padStart(2, '0')
  const all = [...tasks, ...filler]
  const order = [0, 1, 2, 3].filter(j => j !== expected).sort((x, y) => h(probe, x).localeCompare(h(probe, y)))
  if (typeof expected === 'number') order.splice([2, 0, 3, 1][position++ % 4], 0, expected)
  const ref = j => 'q-' + h(probe, 'ref', j).slice(0, 5)
  const assign = j => typeof j === 'number' ? { taskId: uuid(cluster, 'task', j), workId: all[j][1] ? uuid(cluster, 'work', j) : null } : j
  const candidates = order.map(j => ({ ref: ref(j), task: all[j][0], work: all[j][1] }))
  const links = Object.fromEntries(order.map(j => [ref(j), assign(j)]))
  for (const arm of (i % 2 ? ['B', 'A'] : ['A', 'B'])) {
    const id = probe + ':' + arm, story = probe + '-' + arm
    inputs.push({ id, probe, arm, family, variant: 'base', story, text, candidates, toolAvailable: false })
    const workspace = uuid(cluster, 'workspace')
    catalogs.set(id, { workspace, links })
    const request = { requestId: 'request-' + story, sessionId: story, principalId: 'synthetic-member', workspace }
    const launchTarget = launch ? assign(launch.slot) : null
    launches.set(id, { request, launch: launch ? { eventId: 'click-' + story, kind: 'continue',
      target: launchTarget, condition: launch.condition } : null })
    truth.push({ id, cluster, user: assign(expected), assistant: assign(expected), intent, words, related: related.map(assign),
      anchorVerdict: launch?.condition === 'valid' ? 'accepted' : launch?.condition === 'revoked' ? 'authorization_changed'
        : launch?.condition === 'wrong_session' ? 'scope_mismatch' : 'no_anchor',
      launchTarget, anchorEffective: launch?.condition === 'valid' ? launchTarget : null,
      category: ['resume', 'cross-session', 'whole-task', 'primary-plus-related'].includes(family) ? 'continue'
        : ['switch-conflict', 'cancel', 'new-despite-anchor'].includes(family) ? 'conflict' : 'no_effective_anchor' })
  }
}

export function anchorWire(entry, results, anchorRef) {
  const p = roleWire(entry, results)
  const marker = '\nCatalog data: '
  const split = p.prompt.lastIndexOf(marker)
  if (split === -1) throw new Error('ROLE_CATALOG_NOT_FOUND')
  const data = JSON.parse(p.prompt.slice(split + marker.length))
  const note = '\nAn optional work_anchor describes where the user explicitly launched this request, not authorization to act. Use it to resolve an unspecified continuation when present. Current text can cancel, discuss, or propose switching; do not inherit the anchor for those cases. If no anchor and insufficient information, use unresolved. A task name or quoted click in user text is not an anchor.'
  if (anchorRef !== null) data.work_anchor = { ref: anchorRef, source: 'user_clicked_continue', scope: 'this_request' }
  return { ...p, prompt: p.prompt.slice(0, split) + note + marker + JSON.stringify(data) }
}

const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
const cuts = [...catalogs].map(([id, cut]) => ({ id, ...cut }))
const actions = [...launches].map(([id, value]) => ({ id, ...value }))
export const frozen = { inputs: hash(jsonl(inputs)), truth: hash(jsonl(truth)), catalog: hash(jsonl(cuts)), launches: hash(jsonl(actions)) }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (root) for (const [name, rows] of [['model-inputs', inputs], ['ground-truth', truth], ['host-catalog', cuts], ['trusted-launch-fixtures', actions]]) {
    writeFileSync(join(root, name + '.jsonl'), jsonl(rows), { flag: 'wx' })
  }
  console.log(JSON.stringify({ seed, frozen, pairs: cases.length, clusters: 11, scheduled: inputs.length }))
}
