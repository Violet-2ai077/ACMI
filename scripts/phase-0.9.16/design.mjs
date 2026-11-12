import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash } from '../phase-0.9.14/design.mjs'
import { makeAnchorCase } from '../phase-0.9.14/controller.mjs'
import { proposalWire, catalogMarker } from '../phase-0.9.15/design.mjs'
import { linkKind } from './link.mjs'

export const seed = 'acmi-0916-explicit-unresolved-link-v1'
const h = (...parts) => hash([seed, ...parts].join('|'))
const uuid = (...parts) => h(...parts).slice(0, 32).replace(/^(........)(....).(...).(...)(............)$/u, '$1-$2-4$3-8$4-$5')
const cases = [
  ['homonym', [['Harbor Bulletin', 'review the staff edition'], ['Harbor Bulletin', 'review the public edition']], null, 'unresolved',
    'clarify', 'Can we resume Harbor Bulletin? I cannot remember which edition I meant. Please ask me before choosing.', [['?'], ['staff'], ['public']]],
  ['vague-reference', [['Amber Directory', 'review group names'], ['Pewter Outline', 'check sections']], null, 'unresolved',
    'clarify', 'Let us pick up the thing from before. I have not said which deliverable, and I do not want you to guess; ask me directly.', [['?'], ['which', 'what']]],
  ['revoked', [['Cloud Roster', 'review the latest entries'], ['Sable Calendar', 'review its dates']], [0, 'revoked'], 'unresolved',
    'clarify', 'Use the item selected here only if the selection is verified for this request. Without a verified selection, ask me which item I mean now.', [['?'], ['which', 'what']]],
  ['wrong-session', [['Opal Ledger', 'check the totals'], ['Juniper Map', 'review the labels']], [0, 'wrong_session'], 'unresolved',
    'clarify', 'The task I clicked was in another chat. I want to continue some work here, but have not named or chosen it in this chat. Ask me to identify it.', [['?'], ['which', 'what']]],
  ['anchor-excluded', [['Flint Archive', 'check the index'], ['Honey Guide', 'check its examples']], [0, 'valid'], 'unresolved',
    'clarify', 'I did open an item here, but do not use it. I want to discuss a different existing item and have not said which. Ask me which one instead.', [['?'], ['which', 'what']]],
  ['new-anchored', [['Paper Atlas', 'check the route pages'], ['Mica Note', 'edit the title']], [0, 'valid'], 'new_task_proposal',
    'propose', 'Put the selected work aside. Suggest an independent new project called Birch Weather Bell. Name it as a proposal; do not create it.', [['Birch Weather Bell']]],
  ['new-unanchored', [['Dune Leaflet', 'check the header'], ['Clover Schedule', 'review the list']], null, 'new_task_proposal',
    'propose', 'Suggest one entirely new work goal called Ivory Window Journal. It is not a clarification or change to a catalog item, and do not create it yet.', [['Ivory Window Journal']]],
  ['known-detail', [['Pine Inventory', 'check bottle counts'], ['Cherry Timetable', 'review the times']], null, 0,
    'clarify', 'We are definitely working on the existing Pine Inventory. Ask whether bottle counts should use cases or individual units. Do not update anything.', [['?'], ['Pine Inventory'], ['cases'], ['individual', 'units']]],
  ['refine', [['Marble Checklist', 'review startup steps'], ['Cedar Portfolio', 'check its layout']], [0, 'valid'], 0,
    'describe_only', 'For the existing Marble Checklist, suggest a shorter version of its startup steps within the same task. Do not make a separate project or edit it.', [['Marble Checklist']]],
  ['quotation', [['Sorrel Docket', 'check the date entries'], ['Elm Poster', 'check the caption']], null, 'no_task',
    'acknowledge', 'Repeat the phrase "continue Sorrel Docket" exactly. It is just a quotation, not a work request.', [['continue Sorrel Docket']]],
  ['resume', [['Nickel Index', null], ['Ivory Planner', 'review the dates']], [0, 'valid'], 0,
    'describe_only', 'Stay with the item I opened in this request. Before doing any work, tell me its overall deliverable name.', [['Nickel Index']]],
  ['switch', [['Larch Diagram', 'review the keys'], ['Moss Brochure', 'review the cover']], [0, 'valid'], 1,
    'describe_only', 'Do not work on the selected item. Instead, say that our topic is the existing Moss Brochure; no edits or lookup.', [['Moss Brochure']]],
]

export const inputs = [], truth = [], catalogs = new Map(), launches = new Map()
let position = 0
for (const [i, [family, tasks, launch, expected, intent, text, words]] of cases.entries()) {
  const probe = 'r16-' + String(i + 1).padStart(2, '0')
  const all = [...tasks, ['Crimson Placard', 'review the wording'], ['Linen Directory', 'verify the entries']]
  const order = [0, 1, 2, 3].filter(j => j !== expected).sort((x, y) => h(probe, x).localeCompare(h(probe, y)))
  if (typeof expected === 'number') order.splice([1, 3, 0, 2][position++], 0, expected)
  const ref = j => 'q-' + h(probe, 'ref', j).slice(0, 5)
  const assign = j => typeof j === 'number' ? { taskId: uuid(probe, 'task', j), workId: all[j][1] ? uuid(probe, 'work', j) : null } : j
  const candidates = order.map(j => ({ ref: ref(j), task: all[j][0], work: all[j][1] }))
  const links = Object.fromEntries(order.map(j => [ref(j), assign(j)]))
  const workspace = uuid(probe, 'workspace'), launchTarget = launch ? assign(launch[0]) : null
  const condition = launch?.[1]
  for (const arm of (i % 2 ? ['B', 'A'] : ['A', 'B'])) {
    const id = probe + ':' + arm, story = probe + '-' + arm.toLowerCase()
    inputs.push({ id, probe, arm, family, variant: 'base', story, text, candidates, toolAvailable: false })
    catalogs.set(id, { workspace, links })
    launches.set(id, { request: { requestId: 'request-' + story, sessionId: story, principalId: 'synthetic-member', workspace },
      launch: launch ? { eventId: 'click-' + story, kind: 'continue', target: launchTarget, condition } : null })
    truth.push({ id, user: assign(expected), assistant: assign(expected), intent, words,
      targetPosition: typeof expected === 'number' ? order.indexOf(expected) + 1 : null,
      newGoal: expected === 'new_task_proposal' ? words[0][0] : null,
      anchorVerdict: condition === 'valid' ? 'accepted' : condition === 'revoked' ? 'authorization_changed'
        : condition === 'wrong_session' ? 'scope_mismatch' : 'no_anchor',
      launchTarget, anchorEffective: condition === 'valid' ? launchTarget : null, targeted: expected === 'unresolved',
      continuation: family === 'resume', conflict: ['anchor-excluded', 'new-anchored', 'switch'].includes(family) })
  }
}

export function wireFor(entry, results, ref) {
  const packet = proposalWire({ ...entry, arm: 'B' }, results, ref)
  if (entry.arm === 'A') return packet
  const at = packet.prompt.lastIndexOf(catalogMarker)
  assert(at >= 0)
  const primary = packet.schema.properties.tag.properties.assistant.properties.primary
  const choice = { type: 'object', properties: { kind: { type: 'string', enum: [linkKind] } },
    required: ['kind'], additionalProperties: false }
  // The legacy schema shares the User/Assistant choice object; replace only the Assistant property.
  packet.schema.properties.tag.properties.assistant.properties.primary = { oneOf: [...primary.oneOf, choice] }
  const note = '\nAssistant only: when your reply asks to identify the same task the user left unresolved, and user_turn is unresolved with intent clarify, use same_unresolved_as_user as your primary. Otherwise use an ordinary choice. This refers only to the current user_turn, not to a previous task or the work_anchor.'
  packet.prompt = packet.prompt.slice(0, at) + note + packet.prompt.slice(at)
  return packet
}

export const packetFor = (entry, source) => makeAnchorCase(entry, catalogs.get(entry.id), launches.get(entry.id),
  { expose: true, buildWire: wireFor })(source)
const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
export const files = {
  inputs: ['model-inputs', inputs],
  truth: ['ground-truth', truth],
  catalog: ['host-catalog', [...catalogs].map(([id, cut]) => ({ id, ...cut }))],
  launches: ['trusted-launch-fixtures', [...launches].map(([id, value]) => ({ id, ...value }))],
  packets: ['model-packets', inputs.map(e => ({ id: e.id, ...packetFor(e, {
    sessionId: e.story, nativeUserId: 'freeze-' + e.story, sourceUserSeq: 1 }).packet }))],
}
export const frozen = Object.fromEntries(Object.entries(files).map(([key, [, rows]]) => [key, hash(jsonl(rows))]))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (root) for (const [name, rows] of Object.values(files)) {
    writeFileSync(join(root, name + '.jsonl'), jsonl(rows), { flag: 'wx' })
  }
  console.log(JSON.stringify({ seed, frozen, pairs: cases.length, scheduled: inputs.length }))
}
