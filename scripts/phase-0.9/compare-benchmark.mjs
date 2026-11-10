import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [reference, reproduced] = process.argv.slice(2)
assert(reference && reproduced, 'Pass both benchmark output directories')
const load = (root, name) => readFileSync(join(root, 'phase-0.9-' + name + '.json'), 'utf8')
assert.equal(load(reference, 'scenarios'), load(reproduced, 'scenarios'))
const stable = root => {
  const { latencyMs: _latency, runtime: _runtime, ...result } = JSON.parse(load(root, 'results'))
  return result
}
const actual = stable(reproduced)
assert.deepEqual(stable(reference), actual)
console.log(`Identical corpus ${actual.corpusHash}, ${actual.rows.length} stable case/mode rows and ${actual.host.samples} review cases.`)
