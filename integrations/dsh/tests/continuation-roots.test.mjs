import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { expect, test, vi } from 'vitest'

const built = process.env.ACMI_TEST_BUILT === '1'
const entry = new URL(built ? '../dist/index.js' : '../src/index.ts', import.meta.url).href
const acmi = await import(entry)
const pair = 'continuation-pair.json'
const owner = 'continuation-owner.sqlite'

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-continuation-')))
  t.onTestFinished(() => rm(base, { recursive: true, force: true }))
  const config = {
    workspaceRoot: join(base, 'workspace'), journalRoot: join(base, 'journal'), graphRoot: join(base, 'graph'), compression: 'none',
  }
  await Promise.all(Object.values(config).slice(0, 3).map(path => mkdir(path)))
  return config
}

test('standalone Journal stays strict; provisioning does not change existing roots', async t => {
  const cfg = await fixture(t)
  const marker = await acmi.createStorageIsolationMarker(cfg.journalRoot, cfg.workspaceRoot, cfg.compression)
  const before = await readFile(marker.path)
  await expect(acmi.openDshJournal(cfg.journalRoot, cfg.workspaceRoot, cfg.compression)).resolves.toMatchObject({ partitionId: marker.partitionId })
  await expect(acmi.provisionContinuationRoots(cfg)).rejects.toThrow()
  expect(await readFile(marker.path)).toEqual(before)
  await writeFile(join(cfg.journalRoot, owner), '')
  await expect(acmi.openDshJournal(cfg.journalRoot, cfg.workspaceRoot, cfg.compression)).rejects.toThrow('ACMI_JOURNAL_SCOPE')
})

test('partial or changed pair, wrong format, and wrong roots fail closed', async t => {
  const cfg = await fixture(t)
  await expect(acmi.acquireContinuationRoots(cfg)).rejects.toThrow()
  await acmi.provisionContinuationRoots(cfg)
  await expect(acmi.acquireContinuationRoots({ ...cfg, compression: 'zstd' })).rejects.toThrow()
  await expect(acmi.acquireContinuationRoots({ ...cfg, graphRoot: cfg.workspaceRoot })).rejects.toThrow()
  await expect(acmi.acquireContinuationRoots({ ...cfg, workspaceRoot: cfg.graphRoot })).rejects.toThrow()
  const file = join(cfg.graphRoot, pair)
  const original = await readFile(file, 'utf8')
  await writeFile(file, original + '\n')
  await expect(acmi.acquireContinuationRoots(cfg)).rejects.toThrow()
  await writeFile(file, original)
  await rm(join(cfg.graphRoot, owner))
  await expect(acmi.acquireContinuationRoots(cfg)).rejects.toThrow()
})

test('continuation cannot use the configured dsh Home as Workspace', async t => {
  const cfg = await fixture(t)
  vi.stubEnv('DSH_HOME', cfg.workspaceRoot)
  try { await expect(acmi.provisionContinuationRoots(cfg)).rejects.toMatchObject({ code: 'unavailable' }) }
  finally { vi.unstubAllEnvs() }
})

test('paired Journal supports the stock writer and exact Session inspection', async t => {
  const cfg = await fixture(t)
  await acmi.provisionContinuationRoots(cfg)
  const lease = await acmi.acquireContinuationRoots(cfg)
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Jsonl, { root: cfg.journalRoot, compression: cfg.compression })
    const harness = await mountAgentLoopTestHarness(ctx)
    const agent = await harness.create(SessionId('continuation'), {}, { cwd: cfg.workspaceRoot })
    expect(await ctx.sessions.flush(agent.session)).toBeTruthy()
    const journal = await acmi.openDshJournal(cfg.journalRoot, cfg.workspaceRoot, cfg.compression)
    expect(journal.partitionId).toBe(lease.workspaceId)
    const signal = AbortSignal.timeout(5000)
    const snapshot = await journal.inspect(agent.session.id, signal)
    expect(snapshot?.header.createdAt).toBe(agent.session.header.createdAt)
    expect((await journal.read(snapshot, signal)).events.length).toBe(agent.session.seq)
    await writeFile(join(cfg.journalRoot, pair), '{}')
    await expect(journal.inspect(agent.session.id, signal)).rejects.toThrow('ACMI_JOURNAL_SCOPE')
  } finally {
    try { await ctx.fiber.dispose() } finally { lease.close() }
  }
})

test.for(['journalRoot', 'graphRoot'])('independent %s owner conflicts and crash releases ownership', async (root, t) => {
  const cfg = await fixture(t)
  await acmi.provisionContinuationRoots(cfg)
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { DatabaseSync } from 'node:sqlite'
    const db = new DatabaseSync(process.argv[1], { timeout: 0 })
    db.exec('BEGIN EXCLUSIVE')
    process.send('locked')
    process.on('message', message => { if (message === 'close') { db.close(); process.disconnect() } })
  `, join(cfg[root], owner)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  const closed = new Promise(resolve => child.once('close', resolve))
  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        child.once('message', resolve)
        child.once('error', reject)
        child.once('exit', () => reject(new Error('Owner child exited before locking')))
      }),
      delay(4000, undefined, { ref: false }).then(() => { throw new Error('Owner child did not acquire lock') }),
    ])
    await expect(acmi.acquireContinuationRoots(cfg)).rejects.toMatchObject({ code: 'busy' })
    child.kill()
    await closed
    const lease = await acmi.acquireContinuationRoots(cfg)
    try {
      await expect(acmi.acquireContinuationRoots(cfg)).rejects.toMatchObject({ code: 'busy' })
    } finally { lease.close() }
    const reopened = await acmi.acquireContinuationRoots(cfg)
    reopened.close()
  } finally {
    child.kill()
    await closed
  }
}, 12000)
