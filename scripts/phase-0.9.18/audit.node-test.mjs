import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import { auditNative } from './audit.mjs'

test('native audit rejects completion text that differs from the recorded answer', async t => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-ledger-audit-')))
  t.after(() => rm(base, { recursive: true, force: true }))
  const directory = join(base, 'evidence')
  await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./run.mjs', import.meta.url)), '--mode', 'fake', '--out', directory],
    { timeout: 60_000, windowsHide: true })
  assert.equal((await auditNative(directory)).passed, true)
  const ledger = join(directory, 'completions.jsonl')
  const completions = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)
  completions[2].result.text = 'WRONG_COMPLETION_NOT_PRESENT_IN_NATIVE_JOURNAL'
  await writeFile(ledger, completions.map(row => JSON.stringify(row)).join('\n') + '\n')
  await assert.rejects(auditNative(directory), { code: 'ERR_ASSERTION' })
})
