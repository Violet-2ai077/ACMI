import { readFileSync } from 'node:fs'
import { createPlan } from './plan.mjs'
import { checkReadiness } from './readiness.mjs'
import { verifyFreezeBundle } from './freeze.mjs'

const [command, path, ...extra] = process.argv.slice(2)
try {
  const frozen = ['verify-freeze', 'verify-corpus'].includes(command)
  if (!['plan', 'check', 'verify-freeze', 'verify-corpus'].includes(command) || !path || (frozen ? extra.length !== 1 : extra.length !== 0)) throw new Error('usage')
  let result
  if (frozen) result = verifyFreezeBundle({ manifestPath: path, expectedManifestHash: extra[0], checkCorpus: command === 'verify-corpus' })
  else {
    const input = JSON.parse(readFileSync(path, 'utf8'))
    result = command === 'plan' ? createPlan(input) : checkReadiness(input)
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  if (command === 'check' && !result.configuration_complete) process.exitCode = 2
  if (command === 'verify-corpus' && !result.corpus_preflight_passed) process.exitCode = 2
} catch {
  process.stderr.write('Offline usage: node gate2/cli.mjs <plan|check> <JSON-file> OR <verify-freeze|verify-corpus> <manifest> <expected-sha256>; invalid command or input.\n')
  process.exitCode = 1
}
