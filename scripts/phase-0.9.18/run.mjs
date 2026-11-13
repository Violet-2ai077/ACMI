import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { auditNative } from './audit.mjs'

const { values } = parseArgs({ options: { mode: { type: 'string', default: 'walkthrough' },
  out: { type: 'string' }, endpoint: { type: 'string', default: 'http://127.0.0.1:19118/v1/chat/completions' },
  gate: { type: 'string', default: 'retrieval' },
  model: { type: 'string', default: 'Qwen3-14B-Q4_K_M' } } })
assert.ok(['walkthrough', 'fake', 'real'].includes(values.mode))
assert.ok(['retrieval', 'derived'].includes(values.gate))
assert.ok(values.out, '--out must name a new dedicated evidence directory')
const directory = resolve(values.out)
await mkdir(dirname(directory), { recursive: true })
await mkdir(directory) // Refuse reuse instead of overwriting evidence or live stores.
for (const name of ['workspace', 'journal', 'graph', 'home']) await mkdir(join(directory, name))
const home = join(directory, 'home')
const env = { HOME: home, USERPROFILE: home, DSH_HOME: join(home, '.dsh'), DSH_AGENTS_HOME: join(home, '.dsh-agents') }
for (const [key, value] of Object.entries(process.env)) {
  if (/^(systemroot|windir|comspec|path|pathext|temp|tmp|tmpdir)$/iu.test(key)) env[key] = value
}
const expectedRequests = values.mode === 'walkthrough' ? 0 : values.gate === 'derived' ? 4 : 3
const summary = { mode: values.mode, gate: values.gate, node: process.version, directory, startedAt: new Date().toISOString(),
  maxRequests: 8, expectedRequests,
  maxOutputTokens: 512, requestTimeoutMs: 120_000, retries: 0, processes: [] }
for (const phase of ['seed', 'reopen']) {
  const args = [fileURLToPath(new URL('./worker.mjs', import.meta.url)), `${values.mode}-${phase}`,
    directory, values.endpoint, values.model, values.gate]
  const outcome = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, args, { env, cwd: join(directory, 'workspace'), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value })
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value })
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 400_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolveResult({ phase, pid: child.pid, code, signal, timedOut, stdout, stderr })
    })
  })
  summary.processes.push(outcome)
  await writeFile(join(directory, `${phase}.stdout.txt`), outcome.stdout)
  await writeFile(join(directory, `${phase}.stderr.txt`), outcome.stderr)
  if (outcome.code !== 0) break
}
summary.passed = summary.processes.length === 2 && summary.processes.every(item => item.code === 0)
if (summary.passed && values.mode !== 'walkthrough') {
  const requests = (await readFile(join(directory, 'requests.jsonl'), 'utf8')).trim().split('\n')
  summary.actualRequests = requests.length
  summary.passed = requests.length === expectedRequests && requests.length <= summary.maxRequests
  try { summary.native = await auditNative(directory) }
  catch (error) { summary.passed = false; summary.nativeError = error.message }
}
summary.finishedAt = new Date().toISOString()
await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
if (!summary.passed) process.exitCode = 1
