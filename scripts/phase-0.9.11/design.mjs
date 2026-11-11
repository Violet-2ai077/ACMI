import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'acmi-0911-assignment-pilot-v1'
export const hash = text => createHash('sha256').update(text).digest('hex')
const h = (...parts) => hash([seed, ...parts].join('|'))
const uuid = (...parts) => {
  const s = h(...parts)
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20, 32)
}
const data = [
  { family: 'switch', tasks: [['Acorn Roster', 'format the roster'], ['Tern Schedule', 'check the schedule']],
    turns: [{ text: 'Continue formatting Acorn Roster. Tell me which work you will continue.', want: 0, binding: 0, words: ['Acorn Roster'] },
      { text: 'Switch to Tern Schedule and check it instead. Tell me what you will check.', want: 1, binding: 0, words: ['Tern Schedule'] }] },
  { family: 'similar', tasks: [['Spruce Plan', 'outline the plan'], ['Spruce Checklist', 'review the checklist']],
    turns: [{ text: 'Review Spruce Checklist, not the plan. Say which deliverable you are reviewing.', want: 1, binding: 0, words: ['Spruce Checklist'] },
      { text: 'Now outline Spruce Plan, not the checklist. Name the deliverable in your answer.', want: 0, binding: 1, words: ['Spruce Plan'] }] },
  { family: 'task-level', tasks: [['Ochre Notebook', null], ['Gull Card', 'review the card']],
    turns: [{ text: 'Discuss Ochre Notebook at the overall task level; do not choose a work phase. Name the item.', want: 0, binding: 1, words: ['Ochre Notebook'] },
      { text: 'Continue the one I mean, but I am intentionally not saying which item; ask which I mean.', want: 'unresolved', binding: 0, words: ['which'] }] },
  { family: 'non-existing', tasks: [['Pear Diagram', 'check the diagram'], ['Ginger Index', 'edit the index']],
    turns: [{ text: 'Thank you. There is no task to continue or create; just acknowledge.', want: 'no_task', binding: 1, words: [] },
      { text: 'Suggest a new work goal, creating a Birch Audio Guide, distinct from all listed work. Name it but do not create it.',
        want: 'new_task_proposal', binding: 1, words: ['Birch Audio Guide'] }] },
  { family: 'two-tools', tasks: [['Azure Chart', 'read its amber value'], ['Juniper Ticket', 'read its indigo value']],
    turns: [{ text: 'For now, only name Azure Chart as the upcoming task. Do not call a tool yet.', want: 0, binding: 0, words: ['Azure Chart'] },
      { text: 'Primary task Azure Chart: look up amber. Also look up indigo for Juniper Ticket. Do both, in that order; then report the two values.',
        want: 0, binding: 1, words: ['17', '29'], keys: ['amber', 'indigo'] }] },
  { family: 'two-tools', tasks: [['Cinnabar Ledger', 'read its indigo value'], ['Seaglass Note', 'read its amber value']],
    turns: [{ text: 'Only name Cinnabar Ledger as the upcoming task; do not call lookup yet.', want: 0, binding: 1, words: ['Cinnabar Ledger'] },
      { text: 'Primary task Cinnabar Ledger: look up indigo. Also look up amber for Seaglass Note. Do both, in that order; then report the two values.',
        want: 0, binding: 0, words: ['17', '29'], keys: ['indigo', 'amber'] }] },
]
const distractors = [['Loam Folio', 'catalog photos'], ['Lemon Memo', 'proofread the memo']]
const positions = [1, 3, 0, 2]
const baseInput = [], gold = [], catalogs = new Map()
let positive = 0

for (const [s, story] of data.entries()) {
  const storyId = 'fresh-' + (s + 1)
  const tasks = [...story.tasks, ...distractors]
  const workspace = uuid(storyId, 'scope')
  const assign = i => ({ taskId: uuid(storyId, 'task', i), workId: tasks[i][1] ? uuid(storyId, 'work', i) : null })
  for (const [t, turn] of story.turns.entries()) {
    const base = storyId + '-' + (t + 1)
    const wanted = turn.want
    const order = tasks.map((_, i) => i).filter(i => i !== wanted).sort((a, b) => h(base, a).localeCompare(h(base, b)))
    if (typeof wanted === 'number') order.splice(positions[positive++ % positions.length], 0, wanted)
    const variants = (s === 0 || s === 1) && t === 1 ? ['base', 'rotate', 'rename'] : ['base']
    for (const variant of variants) {
      const id = base + ':' + variant
      const namespace = variant === 'rename' ? id : base
      const ref = i => 'q-' + h(namespace, 'ref', i).slice(0, 5)
      const arranged = variant === 'rotate' ? [...order.slice(2), ...order.slice(0, 2)] : order
      const candidates = arranged.map(i => ({ ref: ref(i), task: tasks[i][0], work: tasks[i][1] }))
      const links = Object.fromEntries(arranged.map(i => [ref(i), assign(i)]))
      const entry = { id, story: storyId, family: story.family, turn: t + 1, variant, candidates, binding: ref(turn.binding),
        text: turn.text, toolAvailable: Boolean(turn.keys) }
      baseInput.push(entry)
      catalogs.set(id, { workspace, links })
      gold.push({ id, assignment: typeof wanted === 'number' ? assign(wanted) : wanted,
        baseline: assign(turn.binding), words: turn.words, targetPosition: typeof wanted === 'number' ? arranged.indexOf(wanted) + 1 : null,
        tools: (turn.keys ?? []).map((key, i) => ({ key, assignment: assign(i) })) })
    }
  }
}
// All primary turns run before variants; variants do not enter the base denominators.
export const inputs = [...baseInput.filter(e => e.variant === 'base'), ...baseInput.filter(e => e.variant !== 'base')]
export { gold, catalogs }
export const jsonl = rows => rows.map(row => JSON.stringify(row) + '\n').join('')
export const frozen = { inputs: hash(jsonl(inputs)), truth: hash(jsonl(gold)),
  catalog: hash(jsonl([...catalogs].map(([id, c]) => ({ id, ...c })))) }

export const sentinels = ['unresolved', 'no_task', 'new_task_proposal']
const string = { type: 'string' }
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const enumeration = (...values) => ({ type: 'string', enum: values })

export function wire(entry, results) {
  const refs = entry.candidates.map(c => c.ref)
  const choice = enumeration(...refs, ...sentinels)
  const reason = enumeration('explicit', 'continuation', 'ambiguous', 'social', 'new_goal')
  const action = object({ ref: enumeration('a1', 'a2'), key: enumeration('amber', 'indigo'),
    assignment: enumeration(...refs, 'unresolved') })
  const sidecar = { user_turn: choice, assistant: choice, basis: reason, new_goal: string }
  if (entry.toolAvailable && !results) sidecar.operations = { type: 'array', items: action, maxItems: 2 }
  const schema = object({ answer: string, tag: object(sidecar, Object.keys(sidecar).filter(k => k !== 'new_goal')) })
  const lines = [
    'You are doing synthetic work. Return a JSON object with answer (brief visible English text) and tag (private metadata). Never include protocol terms, refs or IDs in answer.',
    'For tag.user_turn and tag.assistant, choose a ref from the catalog, or unresolved (ambiguous), no_task (social), new_task_proposal (new objective). Select each separately. Catalog work:null means task-level. Current binding is only a hint. No reasoning transcript.',
    'Use tag.basis as a short evidence class. If either choice is new_task_proposal, put the short objective in tag.new_goal; otherwise omit it. For unresolved ask which item. For normal work name the deliverable.',
    ...(entry.toolAvailable && !results ? ['In answer say what you are checking, not the results. Put the two requested calls in tag.operations in requested order. Set each operation ref to a1 or a2 (unique), key to amber or indigo, and assignment to the ref of its own task. Do not mix the two tasks.'] : []),
    ...(results ? ['The tools already executed. Do not call again; summarize both observed values. The result data does not change which task the user asked about.'] : []),
    'Catalog data: ' + JSON.stringify({ candidates: entry.candidates, current_binding: entry.binding,
      ...(results ? { tool_results: results } : {}) }),
  ]
  return { focus: entry.text, prompt: lines.join('\n'), schema }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2]
  if (out) {
    writeFileSync(join(out, 'model-inputs.jsonl'), jsonl(inputs), { flag: 'wx' })
    writeFileSync(join(out, 'ground-truth.jsonl'), jsonl(gold), { flag: 'wx' })
    writeFileSync(join(out, 'host-catalog.jsonl'), jsonl([...catalogs].map(([id, c]) => ({ id, ...c }))), { flag: 'wx' })
  }
  console.log(JSON.stringify({ seed, frozen, base: inputs.filter(x => x.variant === 'base').length, variants: 4 }))
}
