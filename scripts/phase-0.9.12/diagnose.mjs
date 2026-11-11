import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [corpus, scorePath, out] = process.argv.slice(2)
assert(corpus && scorePath && out, 'Usage: node diagnose.mjs <corpus-dir> <scored-results.json> <new-output.json>')
const rows = file => readFileSync(join(corpus, file + '.jsonl'), 'utf8').trim().split(/\r?\n/u).map(JSON.parse)
const inputs = rows('model-inputs').filter(r => r.arm === 'B' && r.variant === 'base')
const catalogs = new Map(rows('host-catalog').map(r => [r.id, r]))
const gold = new Map(rows('ground-truth').map(r => [r.id, r]))
const scored = new Map(JSON.parse(readFileSync(scorePath, 'utf8')).details.map(r => [r.id, r]))
const equal = (x, y) => x && y && typeof x === 'object' && typeof y === 'object'
  && x.taskId === y.taskId && x.workId === y.workId
const escape = s => s.replace(/[.*+?^{}()|[\]\\$]/gu, '\\$&')
const cases = inputs.map(r => {
  const exact = r.candidates.filter(c => new RegExp('(?<![\\p{L}\\p{N}])' + escape(c.task.normalize('NFC'))
    + '(?![\\p{L}\\p{N}])', 'iu').test(r.text.normalize('NFC')))
  const choice = exact.length === 1 ? catalogs.get(r.id).links[exact[0].ref] : null
  const target = gold.get(r.id).user, model = scored.get(r.id)
  const exactLiteral = Boolean(equal(choice, target))
  return { id: r.id, family: r.family, literalMatchCount: exact.length, selectedTitle: exact.length === 1 ? exact[0].task : null,
    exactLiteral, modelUserExact: model?.userExact ?? null,
    modelWrongExistingWasBinding: Boolean(model && !model.userExact && equal(model.user, catalogs.get(r.id).links[r.binding])),
    opportunity: exactLiteral && model?.userExact === false }
})
const result = { provenance: 'post_experiment_deterministic_diagnostic_not_a_qualified_resolver',
  total: cases.length, covered: cases.filter(x => x.selectedTitle).length, exact: cases.filter(x => x.exactLiteral).length,
  possibleRecoveries: cases.filter(x => x.opportunity).length, cases }
writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
