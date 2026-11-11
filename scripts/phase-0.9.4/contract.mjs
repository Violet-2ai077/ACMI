import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

export const version = 'acmi-094-authored-v1'
export const policy = 'acmi-094-preregistered-v1'
export const reviewVersion = 'acmi-094-blind-review-v1'
export const seed = 941711
export const sha = value => createHash('sha256').update(value).digest('hex')
export const opaque = (...parts) => sha(JSON.stringify([seed, ...parts])).slice(0, 24)
export const json = value => JSON.stringify(value, null, 2) + '\n'
export const read = path => JSON.parse(readFileSync(path, 'utf8'))
export const write = (path, data) => writeFileSync(path, json(data), { flag: 'wx' })
export const exact = value => value === 'active' || value === 'historical'
export const acts = 'question report suggestion rejection selection explicit_acceptance conditional_acceptance partial_acceptance correction authorization acknowledgement social quoted mixed request'.split(' ')
export const intents = 'continue return switch new refine change narrow broaden discuss pause wait resume close none uncertain'.split(' ')
export const identities = 'active historical ambiguous missing unavailable out_of_scope none new unresolved'.split(' ')
export const operations = 'none clarify review create switch bind apply unsupported'.split(' ')
export const claims = 'objective work_node decision constraint result dependency branch join next_action lifecycle'.split(' ')
export const protectedKinds = ['decision', 'result', 'dependency', 'join', 'lifecycle']
export const forbiddenMutations = ['graph_write', 'binding', 'apply', 'result_acceptance', 'join_satisfaction', 'task_closure', 'global_memory']

export const counts = values => Object.fromEntries([...new Set(values)].sort().map(x => [x, values.filter(v => v === x).length]))
export const evidenceSpan = (turn, start = 0, end = turn.text.length) =>
  ({ turn: turn.id, actor: turn.actor, start, end, quote: turn.text.slice(start, end) })

export function spanOK(turns, span) {
  const turn = turns.find(x => x.id === span?.turn)
  if (!turn || turn.actor !== span.actor || !Number.isInteger(span.start) || !Number.isInteger(span.end)
    || span.start < 0 || span.end <= span.start || span.end > turn.text.length) return false
  const split = index => /[\uD800-\uDBFF]/u.test(turn.text[index - 1] ?? '') && /[\uDC00-\uDFFF]/u.test(turn.text[index] ?? '')
  return !split(span.start) && !split(span.end) && span.quote === turn.text.slice(span.start, span.end)
}
