import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'acmi-0912-role-paired-v1'
export const hash = s => createHash('sha256').update(s).digest('hex')
const h = (...p) => hash([seed, ...p].join('|'))
const uuid = (...p) => {
  const s = h(...p)
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20, 32)
}

const cases = [
  ['existing-no-execution', 'Verbena Route', 'outline stops', 'Clover Route', 'review timing',
    'Verbena Route is already on the list. Only tell me which item we will work on later; do not outline anything now.',
    0, 0, 'describe_only', ['Verbena Route']],
  ['existing-no-execution', 'Ash Album', 'sort captions', 'Ash Cover', 'draft cover title',
    'Do not sort anything. For the already-listed Ash Album, just say which deliverable the captions belong to.',
    0, 0, 'describe_only', ['Ash Album']],
  ['whole-task', 'Thyme Calendar', null, 'Moss Calendar', 'check dates',
    'For Thyme Calendar, stay at the whole-task level, not a phase. Only name the item.',
    0, 0, 'describe_only', ['Thyme Calendar']],
  ['whole-task', 'Saffron Catalog', null, 'Saffron Notes', 'outline entries',
    'Name the existing Saffron Catalog as a whole; do not pick a phase and do not work on Saffron Notes.',
    0, 0, 'describe_only', ['Saffron Catalog']],
  ['new-goal', 'Pine Album', 'review captions', 'Pear Menu', 'check dishes',
    'Suggest a brand-new task, an Elm Lighting Map, distinct from the listed tasks. Name it; do not create it.',
    'new_task_proposal', 'new_task_proposal', 'propose', ['Elm Lighting Map']],
  ['ambiguous', 'Citrine Banner', 'draft text', 'Aqua Stamp', 'review text',
    'I mean one of those tasks, but I am not giving its name or any clue. Ask me which one before proceeding.',
    'unresolved', 'unresolved', 'clarify', ['which']],
  ['no-task', 'Poppy Calendar', 'format dates', 'Pebble Folio', 'sort images',
    'Thanks. There is no task to work on; a brief acknowledgment is all I want.',
    'no_task', 'no_task', 'acknowledge', []],
  ['multi-response', 'Cobalt Board', 'draft its layout', 'Ruby Board', 'review its layout',
    'The primary item is Cobalt Board. In the same answer name Cobalt Board first and Ruby Board as the related item. Do not work on them.',
    0, 0, 'describe_only', ['Cobalt Board', 'Ruby Board'], [1]],
  ['multi-response', 'Iris Register', 'summarize entries', 'Heather Register', 'proofread entries',
    'Heather Register is background only. Name Iris Register as the main deliverable and mention Heather Register separately; do not make edits.',
    0, 0, 'describe_only', ['Iris Register', 'Heather Register'], [1]],
  ['multi-tool', 'Fennel Guide', 'read its amber value', 'Barley Ticket', 'read its indigo value',
    'Primary task: Fennel Guide. Look up its amber value first. Then look up indigo for Barley Ticket as a separate related task. Report both observed values.',
    0, 0, 'execute', ['17', '29'], [1], ['amber', 'indigo']],
]
const fillers = [['Juniper Placard', 'proofread the placard'], ['Orchid Index', 'sort the index']]
const truth = [], inputs = [], catalogs = new Map()
const positions = [2, 0, 3, 1]
let existing = 0
const variants = []
for (const [i, row] of cases.entries()) {
  const [family, a, ap, b, bp, text, user, assistant, intent, words, related = [], tools = []] = row
  const probe = 'case-' + String(i + 1).padStart(2, '0')
  const tasks = [[a, ap], [b, bp], ...fillers]
  const order = [0, 1, 2, 3].filter(j => j !== user).sort((x, y) => h(probe, x).localeCompare(h(probe, y)))
  if (typeof user === 'number') order.splice(positions[existing++ % positions.length], 0, user)
  const entity = j => typeof j === 'number' ? { taskId: uuid(probe, 't', j), workId: tasks[j][1] === null ? null : uuid(probe, 'w', j) } : j
  const add = (arm, variant) => {
    const id = probe + ':' + arm + ':' + variant
    const arrangement = variant === 'rotate' ? [...order.slice(2), ...order.slice(0, 2)] : order
    const namespace = variant === 'rename' ? id : probe
    const ref = j => 'q-' + h(namespace, 'ref', j).slice(0, 5)
    const candidates = arrangement.map(j => ({ ref: ref(j), task: tasks[j][0], work: tasks[j][1] }))
    const binding = ref(parseInt(h(probe, 'binding').slice(0, 8), 16) % tasks.length)
    const item = { id, probe, arm, variant, family, story: id.replaceAll(':', '-'), text, binding, candidates, toolAvailable: tools.length > 0 }
    const links = Object.fromEntries(arrangement.map(j => [ref(j), entity(j)]))
    catalogs.set(id, { workspace: uuid(probe, 'workspace'), links })
    truth.push({ id, user: entity(user), assistant: entity(assistant), related: related.map(entity), intent, words,
      targetPosition: typeof user === 'number' ? arrangement.indexOf(user) + 1 : null,
      tools: tools.map((key, k) => ({ key, assignment: entity(k) })) })
    return item
  }
  const arms = i % 2 ? ['B', 'A'] : ['A', 'B']
  inputs.push(...arms.map(arm => add(arm, 'base')))
  if (i === 2) variants.push(add('B', 'rotate'))
  if (i === 8) variants.push(add('B', 'rename'))
}
inputs.push(...variants)

const str = { type: 'string' }
const object = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false })
const enumOf = (...values) => ({ type: 'string', enum: values })
const arr = (items, maxItems) => ({ type: 'array', items, maxItems })
export function roleWire(entry, results) {
  const ref = enumOf(...entry.candidates.map(c => c.ref))
  const choice = { oneOf: [
    object({ kind: enumOf('existing'), ref }),
    object({ kind: enumOf('new_task_proposal'), goal: str }),
    object({ kind: enumOf('unresolved', 'no_task') }),
  ] }
  const hasTools = entry.toolAvailable && !results
  const tag = { user_turn: choice, assistant: object({ primary: choice, related: arr(ref, 2) }),
    intent: enumOf('describe_only', 'execute', 'clarify', 'acknowledge', 'propose') }
  if (hasTools) tag.operations = arr(object({ ref: enumOf('a1', 'a2'), key: enumOf('amber', 'indigo'), assignment: ref }), 2)
  const prompt = [
    'Return JSON with a short visible English answer and a private tag. Never print protocol fields, refs or IDs in the answer.',
    'Decide identity separately from intent. Naming, discussing, planning later work, or not executing it now still refers to an existing named catalog task. WHOLE TASK is an existing choice without a phase. Propose a new goal only when a distinct new objective is explicitly requested. If genuinely ambiguous use unresolved and ask which item. Social acknowledgment alone is no_task.',
    'In tag.user_turn select the primary subject of the request. In tag.assistant.primary select the primary subject of what you say. If you answer about both, keep the explicitly primary item as primary, and put only the other named tasks in related. Do not repeat primary in related. Use the exact catalog ref for an existing choice.',
    'Intent describes what this request asks to do: describe_only for explanation or future work without execution, execute for requested lookup, clarify for ambiguity, acknowledge for social text, and propose for a distinct new goal. Do not equate describe_only with no_task.',
    'In visible answer, name the requested deliverable(s) when relevant.',
    ...(hasTools ? ['Say what you are checking, not the values yet. In operations give one call per requested key in the requested order with distinct a1/a2 refs. Assign each call to the catalog task that owns its key.'] : []),
    ...(results ? ['The tools already executed. Summarize the observed values; do not call them again.'] : []),
    'Catalog data: ' + JSON.stringify({ candidates: entry.candidates.map(c => ({ ref: c.ref, task: c.task, scope: c.work ?? 'WHOLE TASK' })),
      current_binding_hint: entry.binding, ...(results ? { tool_results: results } : {}) }),
  ]
  return { prompt: prompt.join('\n'), focus: entry.text, schema: object({ answer: str, tag: object(tag) }) }
}
export { inputs, truth, catalogs }
const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
const catalogRows = [...catalogs].map(([id, cut]) => ({ id, ...cut }))
export const frozen = { inputs: hash(jsonl(inputs)), truth: hash(jsonl(truth)), catalog: hash(jsonl(catalogRows)) }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (root) for (const [name, rows] of [['model-inputs', inputs], ['ground-truth', truth], ['host-catalog', catalogRows]]) {
    writeFileSync(join(root, name + '.jsonl'), jsonl(rows), { flag: 'wx' })
  }
  console.log(JSON.stringify({ seed, frozen, basePairs: 10, variants: 2, scheduled: inputs.length }))
}
