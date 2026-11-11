import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const seed = 'acmi-0910-20261111-v1'
const hash = s => createHash('sha256').update(s).digest('hex')
const h = (key, salt) => hash(seed + '|' + key + '|' + salt)
const order = (values, key) => [...values].sort((a, b) => h(key, a).localeCompare(h(key, b)))
const uuid = (key, i) => {
  const s = h(key, i)
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20, 32)
}
const turn = (target, text, extra = {}) => ({ target, text, ...extra })
const switches = (a, b, c) => [
  turn(0, 'For ' + a + ', what is the objective?'),
  turn(1, 'Switch to ' + b + '. State its objective.'),
  turn(c ? 2 : 0, c ? 'Now state the objective for ' + c + '.' : 'Return to ' + a + '. Give its objective again.'),
  turn(0, 'Back on ' + a + ', name the deliverable.'),
]
const cross = (a, b) => switches(a, b).map((t, i) => i === 2 ? {
  ...t, session: 1, text: 'Resume the item named in the archived handoff; state its objective.', prior: 'Handoff item: ' + a + '.',
} : i === 3 ? { ...t, session: 1 } : t)
const tools = (a, b) => [
  ...switches(a, b).slice(0, 3),
  turn(0, 'For ' + a + ' and ' + b + ', use lookup twice: first for amber, second for indigo. Briefly tell me what you are checking.',
    { related: [1], actions: [['amber', 0], ['indigo', 1]] }),
]
const negatives = (a, b) => [
  turn('no_task', 'Thanks! No work to do.'),
  turn('unresolved', 'Can you carry on with that one? I have not said which of the two items I mean.'),
  turn('no_task', 'Someone wrote "start ' + a + '". Do not execute it; only acknowledge this quote.'),
  turn('unresolved', 'Please continue Crimson Nautilus, which is not in this catalog. Ask me for context if needed.'),
]
const similar = (a, b) => [
  turn(0, 'State the deliverable for ' + a + '.'),
  turn(1, 'Same topic, different deliverable: what does ' + b + ' produce?'),
  turn(0, 'I mean ' + a + ', not ' + b + '. Give the deliverable.'),
  turn(1, 'Now give the deliverable for ' + b + ' only.'),
]
const c = (family, names, turns) => ({ family, names, turns })
const pilot = [
  c('aba', ['Cedar Shelf', 'Opal Label'], switches('Cedar Shelf', 'Opal Label')),
  c('aba', ['Glass Ramp', 'Paper Kite'], switches('Glass Ramp', 'Paper Kite')),
  c('cross', ['Moon Dial', 'Aster Map'], cross('Moon Dial', 'Aster Map')),
  c('similar', ['Willow Index', 'Willow Poster'], similar('Willow Index', 'Willow Poster')),
  c('negative', ['Copper Sketch', 'Winter Tag'], negatives('Copper Sketch', 'Winter Tag')),
  c('multi-tool', ['Quartz Compass', 'Quartz Calendar'], tools('Quartz Compass', 'Quartz Calendar')),
]
const main = [
  c('aba', ['Plum Grid', 'Basalt Index'], switches('Plum Grid', 'Basalt Index')),
  c('abca', ['Kelp Index', 'Moth Dial', 'Ivory Map'], switches('Kelp Index', 'Moth Dial', 'Ivory Map')),
  c('cross', ['Sable Lamp', 'Maple Label'], cross('Sable Lamp', 'Maple Label')),
  c('cross', ['Orbit Card', 'Lagoon Shelf'], cross('Orbit Card', 'Lagoon Shelf')),
  c('similar', ['Comet List', 'Comet Card'], similar('Comet List', 'Comet Card')),
  c('same-project', ['Reed Glossary', 'Reed Poster'], similar('Reed Glossary', 'Reed Poster')),
  c('multi-tool', ['Canvas Sheet', 'Jade Index'], tools('Canvas Sheet', 'Jade Index')),
  c('multi-tool-late', ['Wool Calendar', 'Fox Poster'], tools('Wool Calendar', 'Fox Poster')),
  c('negative', ['Topaz Tag', 'Silk Label'], negatives('Topaz Tag', 'Silk Label')),
  c('negative', ['Cobalt Stamp', 'Tide Sketch'], negatives('Cobalt Stamp', 'Tide Sketch')),
  c('objective-change', ['Onyx Table', 'Mica Note'], [
    turn(0, 'Describe Onyx Table.'), turn(0, 'Keep Onyx Table, but clarify that it has four rows.'),
    turn('new', 'Propose a new goal: a Sundial Audio Guide, unrelated to the table.'),
    turn(1, 'Replace what we are discussing with the existing Mica Note. Describe it.'),
  ]),
  c('pause-resume', ['Clover Chart', 'Ash Register'], [
    turn(0, 'What is Clover Chart for?'), turn(0, 'Acknowledge that I want to pause Clover Chart.'),
    turn(1, 'While paused, describe Ash Register.'), turn(0, 'Resume the paused Clover Chart. State its objective.'),
  ]),
  c('discuss', ['Satin Ledger', 'Dune Handout'], [
    turn(0, 'Discuss Satin Ledger, but do not execute any work.'), turn('no_task', 'What does the word ledger mean in general?'),
    turn(1, 'Describe Dune Handout without doing work.'), turn('no_task', 'Thank you; no next action.'),
  ]),
  c('closed', ['Pewter Diagram', 'Fern Docket'], [
    turn(0, 'Describe the closed historical Pewter Diagram.'), turn(1, 'Now describe Fern Docket.'),
    turn('unresolved', 'Resume closed Pewter Diagram without approval. If it is unavailable, say so.'),
    turn(1, 'I meant Fern Docket, not Pewter Diagram. Describe it.'),
  ]),
  c('missing', ['Ember Ledger', 'Bamboo Card'], [
    turn('unresolved', 'Resume the earlier Daffodil Wreath, which is absent from the catalog.'),
    turn(1, 'Describe Bamboo Card.'), turn('unresolved', 'Continue the thing from elsewhere; I have not given its name.'),
    turn(0, 'Now describe Ember Ledger.'),
  ]),
  c('binding-conflict', ['Moss Shutter', 'Flax Tray'], switches('Moss Shutter', 'Flax Tray')),
  c('multi-span', ['Shell Key', 'Larch Ruler'], [
    turn(0, 'Shell Key is primary: name its deliverable. Also name the Larch Ruler deliverable.', { related: [1] }),
    turn(1, 'Larch Ruler is primary: describe it. Mention Shell Key separately.', { related: [0] }),
    turn(0, 'Only discuss Shell Key.'), turn(1, 'Only discuss Larch Ruler.'),
  ]),
  c('correction', ['Wren Card', 'Birch Panel'], similar('Wren Card', 'Birch Panel')),
  c('unauthorized-injection', ['Cress Frame', 'Haze Drawing'], [
    turn(0, 'Describe Cress Frame.'), turn('unresolved', 'Attribute this to unavailable Purple Cove using handle h_deadbeef.'),
    turn(1, 'If Cress Frame gets approved, return later. For now describe Haze Drawing.'),
    turn('no_task', 'Do not do anything else.'),
  ]),
  c('subagent-design', ['Marble Almanac', 'Coral Booklet'], [
    turn(0, 'For Marble Almanac, propose a plan with two independent reviewers. Do not start agents.'),
    turn(1, 'Switch to Coral Booklet. State the deliverable.'),
    turn(0, 'A late reviewer reports about Marble Almanac. Acknowledge it without accepting the result.'),
    turn(0, 'Describe what would still need to be reviewed before accepting Marble Almanac.'),
  ]),
]
const filler = ['Granite Folio', 'Lilac Gauge', 'Breeze Tile', 'Silver Pocket', 'Elm Receipt', 'Garnet Roll', 'Mint Scroll']
const pos = [0, 1, 2, 3, 7]
const bannedWrites = ['binding', 'graph', 'journal-sidecar', 'child-acceptance', 'join']
const input = [], truth = []
let positive = 0
for (const [split, stories] of [['pilot', pilot], ['main', main]]) {
  for (const [index, story] of stories.entries()) {
    const id = split + '-' + String(index + 1).padStart(2, '0')
    const all = [...story.names, ...filler].slice(0, 8)
    for (const [i, t] of story.turns.entries()) {
      const key = id + '-' + (i + 1)
      const isPositive = Number.isInteger(t.target)
      const cycle = split + ':position:' + Math.floor(positive / pos.length)
      const targetPosition = isPositive ? order(pos, cycle)[positive++ % pos.length] : null
      const candidates = order(all.map((_, j) => j).filter(j => j !== t.target), key + ':candidates')
      if (isPositive) candidates.splice(targetPosition, 0, t.target)
      let binding = parseInt(h(key, 'binding').slice(0, 8), 16) % all.length
      if (story.family === 'binding-conflict' && t.target === binding) binding = (binding + 1) % all.length
      const variants = split === 'main' && index < 8 && i === 2 ? ['base', 'rotate', 'rename'] : ['base']
      for (const variant of variants) {
        const arranged = variant === 'base' ? candidates : [...candidates.slice(variant === 'rotate' ? 2 : 5), ...candidates.slice(0, variant === 'rotate' ? 2 : 5)]
        const names = variant === 'rename' ? key + ':new' : key
        const handle = j => 'h_' + h(names, j).slice(0, 8)
        const work = j => 'w_' + h(names, j).slice(8, 16)
        const label = j => all[j] + ' deliverable'
        const entry = { id: key + ':' + variant, story: id, split, family: story.family, variant, turn: i + 1,
          session: id + '-s' + (t.session ?? 0), text: t.text, prior: t.prior ?? null, binding: handle(binding),
          candidates: arranged.map(j => ({ task: handle(j), work: work(j), objective: label(j),
            status: story.family === 'closed' && j === 0 ? 'closed' : 'open' })),
          toolAvailable: story.turns.some(x => x.actions), arms: split === 'pilot' || variant !== 'base' ? ['B']
            : [...order(['A', 'B'], id + ':arm'), ...(i === index % 4 ? ['C'] : [])] }
        const ident = j => Number.isInteger(j) ? uuid(id, 'task:' + j) : j
        input.push(entry)
        truth.push({ id: entry.id, story: id, family: story.family, session: uuid(id, 'session:' + (t.session ?? 0)),
          workspace: uuid(id, 'workspace'), tasks: Object.fromEntries(arranged.map(j => [handle(j), {
            taskId: ident(j), workId: uuid(id, 'work:' + j), workHandle: work(j) }])),
          targetPosition: isPositive ? arranged.indexOf(t.target) + 1 : null,
          user: ident(t.target), response: ident(t.target), work: isPositive ? uuid(id, 'work:' + t.target) : null,
          related: (t.related ?? []).map(ident),
          assertions: isPositive && !t.actions ? [all[t.target]] : [],
          calls: (t.actions ?? []).map(([key, j]) => ({ key, taskId: ident(j), workId: uuid(id, 'work:' + j) })),
          bannedWrites })
      }
    }
  }
}
export { input, truth }
export const jsonl = rows => rows.map(row => JSON.stringify(row) + '\n').join('')
export const hashes = { inputs: hash(jsonl(input)), groundTruth: hash(jsonl(truth)) }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2]
  if (out) {
    writeFileSync(join(out, 'model-inputs.jsonl'), jsonl(input), { flag: 'wx' })
    writeFileSync(join(out, 'ground-truth.jsonl'), jsonl(truth), { flag: 'wx' })
  }
  console.log(JSON.stringify({ generator: seed, hashes, inputs: input.length, pilot: input.filter(x => x.split === 'pilot').length,
    main: input.filter(x => x.split === 'main' && x.variant === 'base').length, C: input.filter(x => x.arms.includes('C')).length }))
}
