import { freeze } from './canonical.ts'
import { boundedText, exactFields } from './runtime-facts.ts'

const keyPattern = '^[A-Za-z0-9_.:-]{1,96}$'
type Field =
  | { readonly type: 'string'; readonly minLength: 1; readonly maxLength: number; readonly pattern?: string }
  | { readonly enum: readonly string[] }
  | { readonly type: 'array'; readonly minItems: number; readonly maxItems: number; readonly uniqueItems: true; readonly items: Field }

const str = (maxLength: number, pattern?: string): Extract<Field, { type: 'string' }> =>
  ({ type: 'string', minLength: 1, maxLength, ...(pattern ? { pattern } : {}) })
const key = str(96, keyPattern)
const one = <T extends string>(...values: T[]) => ({ enum: values })
const list = (items: Field, maxItems: number, minItems = 1): Extract<Field, { type: 'array' }> =>
  ({ type: 'array', minItems, maxItems, items, uniqueItems: true })
const brief = str(256)
const body = str(1024)
const definitions = {
  decompose: { parent: key, titles: list(brief, 6) },
  branch: { parent: key, titles: list(brief, 6, 2) },
  refine: { nodeId: key, description: body, criteria: list(brief, 6) },
  objective: { objective: body, criteria: list(brief, 6) },
  dependency: { from: key, to: key },
  successor: { from: key, to: key },
  join: { title: brief, required: list(key, 6), optional: list(key, 6, 0), next: list(key, 1, 0), policy: one('all-required-accepted') },
  decision: { topic: key, text: body, rationale: body, alternatives: list(brief, 6, 0),
    state: one('proposed', 'accepted', 'rejected', 'disputed', 'superseded'), replaces: list(key, 1, 0) },
  constraint: { node: list(key, 1, 0), text: body, category: one('technical', 'performance', 'security', 'compatibility', 'scope', 'acceptance'),
    validity: one('task', 'temporary') },
  state: { nodeId: key, state: one('ready', 'blocked', 'completed') },
  'execution-link': { nodeId: key, executionId: key },
  'work-result': { executionId: key, text: body },
  'result-review': { nodeId: key, resultId: key, stage: one('available', 'inspected', 'consumed') },
  'result-assessment': { nodeId: key, resultId: key, state: one('rejected', 'superseded'), text: body },
  'next-action': { text: body },
  'needs-confirmation': { subject: one('task-completion', 'result-acceptance', 'join-satisfaction', 'execution-association') },
} satisfies Record<string, Record<string, Field>>

type Value<F> = F extends { type: 'array' } ? readonly string[] : F extends { enum: readonly (infer E)[] } ? E : string
type Op = keyof typeof definitions
export type UnderstandingOperation = { [K in Op]: { readonly kind: K } &
  { readonly [F in keyof typeof definitions[K]]: Value<(typeof definitions)[K][F]> } }[Op]

function schema(kind: string, fields: Record<string, Field>) {
  return { type: 'object', properties: { kind: { const: kind }, ...fields }, additionalProperties: false,
    required: ['kind', ...Object.keys(fields)] }
}

export const understandingOutputSchema = freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'array', maxItems: 8, items: { oneOf: Object.entries(definitions).map(([kind, fields]) => schema(kind, fields)) },
})
export const understandingOutputLimit = 8192
const valid = (field: Field, value: unknown): boolean => {
  if ('enum' in field) return typeof value === 'string' && field.enum.includes(value)
  if (field.type === 'array') return Array.isArray(value) && value.length >= field.minItems && value.length <= field.maxItems
    && new Set(value).size === value.length && value.every(x => valid(field.items, x))
  return boundedText(value, field.maxLength) && value.trim().length > 0
    && (!field.pattern || new RegExp(field.pattern, 'u').test(value))
}
export function parseUnderstandingOutput(json: string): readonly UnderstandingOperation[] | null {
  if (typeof json !== 'string' || json.length > understandingOutputLimit) return null
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return null }
  if (!Array.isArray(raw) || raw.length > understandingOutputSchema.maxItems) return null
  for (const op of raw) {
    if (!op || typeof op.kind !== 'string' || !Object.hasOwn(definitions, op.kind)) return null
    const fields = definitions[op.kind as Op]
    if (!exactFields(op, ['kind', ...Object.keys(fields)]) || !Object.entries(fields).every(([key, field]) => valid(field, op[key]))) return null
  }
  return raw as UnderstandingOperation[]
}
