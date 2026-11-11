import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, vi } from 'vitest'
import { createNativeIdentityHost } from './fixtures/native-identity-host.mjs'

const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const story = { id: 'fixture-cross', titles: ['Floor plan', 'Door repair'], prior: 'I meant Door repair.',
  focus: 'Return to the task from the previous session.' }

async function host(t, transport) {
  const temp = await realpath(tmpdir())
  const path = await realpath(await mkdtemp(join(temp, 'acmi-099-native-')))
  vi.stubEnv('DSH_HOME', join(path, 'unused-home'))
  vi.stubEnv('DSH_AGENTS_HOME', join(path, 'unused-agents'))
  const instance = await createNativeIdentityHost(acmi, path, transport)
  t.onTestFinished(async () => {
    try { await instance.close() } finally {
      vi.unstubAllEnvs()
      const actual = await realpath(path)
      if (actual !== path || dirname(actual) !== temp || !basename(actual).startsWith('acmi-099-native-')) throw new Error('Unexpected fixture path')
      await rm(actual, { recursive: true })
    }
  })
  return instance
}

test('isolated dsh prepares identity advice from native input and reviews only the native assistant response', async t => {
  const dsh = await host(t, async request => request.model.prior
    ? JSON.stringify({ decision: 'suggest', handle: 'a2', source: 'prior', quote: 'Door repair' })
    : '{"decision":"clarify"}')
  const off = await dsh.runCase(story, 'off')
  const on = await dsh.runCase(story, 'on')
  expect(off.review.status).toBe('clarify')
  expect(on.review).toMatchObject({ status: 'suggestion', taskId: on.taskIds[1], source: 'prior' })
  expect(off.candidateDigest).toBe(on.candidateDigest)
  expect(off.priorVisible).toBe(false)
  expect(on.priorVisible).toBe(true)
  expect(dsh.calls()).toBe(2)
})

test('default off, denied antecedent and mid-call revocation do not publish a task identity', async t => {
  let allowed = true
  const dsh = await host(t, async request => {
    if (!request.model.prior) return '{"decision":"clarify"}'
    allowed = false
    return '{"decision":"suggest","handle":"a2","source":"prior","quote":"Door repair"}'
  })
  expect((await dsh.runCase(story, 'disabled', { enabled: undefined })).calls).toBe(0)
  expect((await dsh.runCase({ ...story, id: 'fixture-denied', denied: true }, 'on')).priorVisible).toBe(false)
  expect((await dsh.runCase({ ...story, id: 'fixture-revoked' }, 'on', { permitsPrior: () => allowed })).review.status).toBe('unavailable')
}, 10000)
