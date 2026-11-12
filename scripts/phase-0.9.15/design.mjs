import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { anchorWire, hash } from '../phase-0.9.14/design.mjs'
import { makeAnchorCase } from '../phase-0.9.14/controller.mjs'

export const seed = 'acmi-0915-relative-proposal-pairs-v1'
const h = (...parts) => hash([seed, ...parts].join('|'))
const uuid = (...parts) => h(...parts).slice(0, 32).replace(/^(........)(....).(...).(...)(............)$/u, '$1-$2-4$3-8$4-$5')
const cases = [
  ['resume', [['Granite Ledger', 'review renewal rows'], ['Violet Map', 'review station markers']], [0, 'valid'], 0,
    'describe_only', 'Pick up the work I opened here. Tell me the deliverable name before we begin; do not edit it.', [['Granite Ledger']]],
  ['whole-task', [['Marigold Portfolio', null], ['Cobalt Checklist', 'format the checklist']], [0, 'valid'], 0,
    'describe_only', 'Stay with the selected work. Give me its overall name, not a phase, and hold off on making changes.', [['Marigold Portfolio']]],
  ['switch', [['Silver Registry', 'check duplicate entries'], ['Coral Brochure', 'review the fold']], [0, 'valid'], 1,
    'describe_only', 'Ignore the work I opened. Instead, tell me we will discuss the existing Coral Brochure; no edits now.', [['Coral Brochure']]],
  ['cancel', [['Aster Agenda', 'check the schedule'], ['Wheat Folder', 'group the files']], [0, 'valid'], 'no_task',
    'acknowledge', 'I opened this by accident. Cancel the request; just confirm you will not proceed.', [['cancel', 'not proceed', "won't proceed", 'stopped', 'no action']]],
  ['new-override', [['Granular Map', 'review the legend'], ['Vermilion Roster', 'verify names']], [0, 'valid'], 'new_task_proposal',
    'propose', 'Leave the selected work alone. As a separate new objective, suggest creating Indigo Transit Chime. Name the objective but do not create it.', [['Indigo Transit Chime']]],
  ['homonym', [['Lotus Register', 'review the volunteer edition'], ['Lotus Register', 'review the vendor edition']], null, 'unresolved',
    'clarify', 'Can we pick up Lotus Register? I have not specified whether this is the volunteer or vendor edition; ask which one.', [['volunteer'], ['vendor']]],
  ['revoked', [['Brick Index', 'check its sections'], ['Spruce Calendar', 'review dates']], [0, 'revoked'], 'unresolved',
    'clarify', 'Continue the work I selected only if this chat has a verified selection. Otherwise ask which item I mean.', [['which', 'specify', 'identify']]],
  ['wrong-session', [['Poppy Handbook', 'check the appendix'], ['Pine Label', 'review the instructions']], [0, 'wrong_session'], 'unresolved',
    'clarify', 'The selection may have been made in another chat. I have not picked or named the item in this chat. Ask me which item to continue.', [['which', 'specify', 'identify']]],
  ['known-detail', [['Bronze Timeline', 'review date labels'], ['Jade Program', 'review its design']], null, 0,
    'clarify', 'For the existing Bronze Timeline, ask whether the labels should use local time or UTC. Do not choose a convention or edit anything.', [['Bronze Timeline'], ['local'], ['UTC']]],
  ['refine', [['Saffron Manual', 'review its installation steps'], ['Glass Dial', 'verify markings']], [0, 'valid'], 0,
    'describe_only', 'For the existing Saffron Manual, suggest a way to shorten its installation steps within that same task. Do not create new work or edit it.', [['Saffron Manual']]],
  ['new-unanchored', [['Carmine Badge', 'check the image'], ['Oat Planner', 'review headings']], null, 'new_task_proposal',
    'propose', 'Nothing in the existing catalog is the goal. Suggest a distinct new project called Alder Rain Log; propose it only.', [['Alder Rain Log']]],
  ['quotation', [['Wren Invoice', 'review subtotal labels'], ['Lilac Grid', 'check the spacing']], null, 'no_task',
    'acknowledge', 'Quote the phrase "continue Wren Invoice" verbatim. This is a quotation only, not a work request.', [['continue Wren Invoice']]],
]

export const inputs = [], truth = [], catalogs = new Map(), launches = new Map()
let position = 0
for (const [i, [family, tasks, launch, expected, intent, focus, words]] of cases.entries()) {
  const probe = 'r15-' + String(i + 1).padStart(2, '0')
  const all = [...tasks, ['Fennel Key', 'review the descriptions'], ['Raven Board', 'read its headings']]
  const order = [0, 1, 2, 3].filter(j => j !== expected).sort((x, y) => h(probe, x).localeCompare(h(probe, y)))
  if (typeof expected === 'number') order.splice([2, 0, 3, 1][position++ % 4], 0, expected)
  const ref = j => 'q-' + h(probe, 'ref', j).slice(0, 5)
  const assign = j => typeof j === 'number' ? { taskId: uuid(probe, 'task', j), workId: all[j][1] ? uuid(probe, 'work', j) : null } : j
  const candidates = order.map(j => ({ ref: ref(j), task: all[j][0], work: all[j][1] }))
  const links = Object.fromEntries(order.map(j => [ref(j), assign(j)]))
  const workspace = uuid(probe, 'workspace'), launchTarget = launch ? assign(launch[0]) : null
  const condition = launch?.[1]
  for (const arm of (i % 2 ? ['B', 'A'] : ['A', 'B'])) {
    const id = probe + ':' + arm, story = probe + '-' + arm.toLowerCase()
    inputs.push({ id, probe, arm, family, variant: 'base', story, text: focus, candidates, toolAvailable: false })
    catalogs.set(id, { workspace, links })
    launches.set(id, { request: { requestId: 'request-' + story, sessionId: story, principalId: 'synthetic-member', workspace },
      launch: launch ? { eventId: 'click-' + story, kind: 'continue', target: launchTarget, condition } : null })
    truth.push({ id, user: assign(expected), assistant: assign(expected), intent, words,
      targetPosition: typeof expected === 'number' ? order.indexOf(expected) + 1 : null,
      newGoal: expected === 'new_task_proposal' ? words[0][0] : null,
      anchorVerdict: condition === 'valid' ? 'accepted' : condition === 'revoked' ? 'authorization_changed'
        : condition === 'wrong_session' ? 'scope_mismatch' : 'no_anchor',
      launchTarget, anchorEffective: condition === 'valid' ? launchTarget : null,
      targeted: expected === 'unresolved' || expected === 'new_task_proposal',
      continuation: i < 2, conflict: i >= 2 && i <= 4 })
  }
}

const enumOf = (...values) => ({ type: 'string', enum: values })
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const catalogMarker = '\nCatalog data: '

function proposalWire(entry, results, ref) {
  assert(results === null && !entry.toolAvailable, 'TEXT_ONLY_PROPOSAL_CONTRACT')
  const p = anchorWire(entry, results, ref)
  if (entry.arm === 'A') return p
  const base = p.schema.properties
  const original = base.tag.properties
  const choice = { oneOf: [
    ...(ref === null ? [] : [object({ kind: enumOf('continue_anchor') })]),
    object({ kind: enumOf('refer_existing'), ref: enumOf(...entry.candidates.map(c => c.ref)) }),
    object({ kind: enumOf('propose_new'), goal: { type: 'string' } }),
    object({ kind: enumOf('unresolved') }),
    object({ kind: enumOf('no_task') }),
  ] }
  const at = p.prompt.lastIndexOf(catalogMarker)
  assert(at >= 0)
  const lines = p.prompt.slice(0, at).split('\n')
  assert(lines[1]?.startsWith('Decide identity') && lines[2]?.startsWith('In tag.user_turn'))
  lines[1] = 'For each role choose exactly one proposal: continue_anchor for continuing the verified selection without naming a different task; refer_existing with the exact catalog ref for a named existing task, including discussing, planning, or refining it without execution; propose_new with a goal for a distinct new objective; unresolved when a work task is intended but you need its identity; no_task when there is no work subject.'
  lines[2] = 'Select the primary subject of the request in tag.user_turn, and the primary subject of what you say in tag.assistant.primary. If task identity is known, a question about its details still refers to that task. WHOLE TASK needs no phase. When both tasks are mentioned, put only the secondary ones in related. Do not repeat the primary.'
  return { ...p, prompt: lines.join('\n') + p.prompt.slice(at), schema: object({ answer: base.answer,
    tag: object({ user_turn: choice, assistant: object({ primary: choice, related: original.assistant.properties.related }),
      intent: original.intent }) }) }
}

export const compose = (entry, catalog, fixture) => makeAnchorCase(entry, catalog, fixture, { expose: true, buildWire: proposalWire })
export const packetFor = (entry, source) => compose(entry, catalogs.get(entry.id), launches.get(entry.id))(source)
const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
const files = {
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
