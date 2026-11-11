import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { catalogs, inputs } from '../../../scripts/phase-0.9.11/design.mjs'
import { assignmentHost } from './fixtures/assignment-native-host.mjs'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const { splitAssignment } = built ? await import('../dist/assignment-inline.js') : await import('../src/assignment-inline.ts')
const { CausalAttribution } = built ? await import('../dist/inline-attribution.js') : await import('../src/inline-attribution.ts')
const receipt = (data, ticket) => ({ raw: typeof data === 'string' ? data : JSON.stringify(data), stop: 'eos', ticket,
  usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }, latencyMs: 0 })
const get = id => inputs.find(x => x.id === id)

async function run(entry, scripted) {
  const tmp = await realpath(tmpdir())
  const base = await realpath(await mkdtemp(join(tmp, 'acmi-0911-native-')))
  let host
  try {
    host = await assignmentHost(acmi, splitAssignment, CausalAttribution, base, scripted, 'synthetic')
    return await host.run(entry, catalogs.get(entry.id))
  } finally {
    try { await host?.close() } finally {
      if (dirname(base) !== tmp || !basename(base).startsWith('acmi-0911-native-')) throw new Error('Invalid cleanup path')
      await rm(base, { recursive: true, force: true })
    }
  }
}

test('stock native turn publishes a safe answer and no sidecar despite forged attribution', async () => {
  const entry = get('fresh-1-1:base')
  const row = await run(entry, async () => receipt({
    answer: 'I will continue Acorn Roster.',
    tag: { user_turn: 'q-00000', assistant: 'q-00000', basis: 'explicit' },
  }, 1))
  expect(row.native.end).toBe('completed')
  expect(row.native.assistant.map(a => a.text)).toEqual(['I will continue Acorn Roster.'])
  expect(row.steps[0].decoded.user).toBe('unresolved')
  expect(row.steps[0].decoded.issues).toContain('USER_UNRESOLVED')
  expect(row.leaked).toBe(false)
  expect(Object.values(row.unchanged).every(Boolean)).toBe(true)
})

test('unsafe visible metadata never enters assistant blocks or Journal', async () => {
  const entry = get('fresh-1-1:base')
  const row = await run(entry, async () => receipt({ answer: 'assignment_ref ' + entry.binding, tag: null }, 1))
  expect(row.native.end).toBe('error')
  expect(row.native.assistant).toEqual([])
  expect(row.steps[0].withheld).toBe('UNSAFE_ANSWER')
  expect(row.leaked).toBe(false)
})

test('different tasks survive out-of-order body returns and an ordinary native continuation', async () => {
  const entry = get('fresh-5-2:base')
  const a = entry.candidates.find(c => c.task === 'Azure Chart').ref
  const b = entry.candidates.find(c => c.task === 'Juniper Ticket').ref
  const tag = { user_turn: a, assistant: a, basis: 'explicit' }
  let n = 0
  const row = await run(entry, async packet => {
    if (++n === 1) return receipt({ answer: 'Checking both items.', tag: { ...tag, operations: [
      { ref: 'a1', key: 'amber', assignment: a }, { ref: 'a2', key: 'indigo', assignment: b },
    ] } }, n)
    expect(packet.prompt).toContain('amber=17')
    expect(packet.prompt).toContain('indigo=29')
    return receipt({ answer: 'Amber is 17 and indigo is 29.', tag }, n)
  })
  expect(row.error).toBeNull()
  expect(row.native.end).toBe('completed')
  expect(n).toBe(2)
  const [first, second] = row.steps[0].actions
  expect(row.arrivals.map(x => x.callId)).toEqual([second.callId, first.callId])
  expect(row.arrivals.map(x => x.inherited.task)).toEqual([second.assignment.taskId, first.assignment.taskId])
  expect(row.native.results.map(x => x.callId)).toEqual([first.callId, second.callId])
  expect(row.native.results.map(x => x.inherited.task)).toEqual([first.assignment.taskId, second.assignment.taskId])
  expect(row.native.results.map(x => x.sourceEventSeqs)).toEqual(row.native.calls.map(c => [c.seq]))
  expect(row.leaked).toBe(false)
})
