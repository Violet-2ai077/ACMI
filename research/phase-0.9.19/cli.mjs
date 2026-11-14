import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { evaluateArchive } from './report/build.mjs'
import { assertEvidencePath } from './ledger/store.mjs'

export function main(argv) {
  const [command, ...rest] = argv
  if (!['evaluate', 'report', 'verify'].includes(command)) throw new Error('Offline commands: evaluate|report|verify --archive PATH --oracle PATH [--output NEW_FILE]')
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--archive', '--oracle', '--output'].includes(rest[i]) || !rest[i + 1] || options[rest[i]]) throw new Error('unknown/duplicate option; live/provider modes forbidden')
    options[rest[i]] = rest[i + 1]
  }
  if (!options['--archive'] || !options['--oracle']) throw new Error('archive and oracle required')
  const report = evaluateArchive({ archiveRoot: options['--archive'], oraclePath: options['--oracle'] })
  const output = command === 'report' ? report.markdown : JSON.stringify(report.json, null, 2) + '\n'
  if (options['--output']) {
    assertEvidencePath(options['--output'])
    writeFileSync(options['--output'], output, { flag: 'wx' })
  }
  else process.stdout.write(output)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)) } catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1 }
}
