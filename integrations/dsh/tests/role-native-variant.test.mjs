import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { assignmentHost } from './fixtures/assignment-native-host.mjs'
import { catalogs, inputs, roleWire } from '../../../scripts/phase-0.9.12/design.mjs'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const { splitRoles } = built ? await import('../dist/role-attribution.js') : await import('../src/role-attribution.ts')
const { CausalAttribution } = built ? await import('../dist/inline-attribution.js') : await import('../src/inline-attribution.ts')

test('paired-arm variant IDs become filesystem-safe session IDs and retain the isolated native journal', async () => {
  const tmp = await realpath(tmpdir())
  const root = await realpath(await mkdtemp(join(tmp, 'acmi-0912-variant-')))
  const item = inputs.find(x => x.id === 'case-03:B:rotate')
  const ref = item.candidates.find(x => x.task === 'Thyme Calendar').ref
  let host
  try {
    host = await assignmentHost(acmi, splitRoles, CausalAttribution, root, async () => ({
      raw: JSON.stringify({ answer: 'Thyme Calendar.', tag: { user_turn: { kind: 'existing', ref },
        assistant: { primary: { kind: 'existing', ref }, related: [] }, intent: 'describe_only' } }),
      stop: 'eos', ticket: 1, usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, latencyMs: 0,
    }), 'scripted', { buildPacket: roleWire })
    const row = await host.run(item, catalogs.get(item.id))
    expect(row.native.session).toBe('case-03-B-rotate')
    expect(row.native.end).toBe('completed')
    expect(row.journalDigest).toMatch(/^[a-f0-9]{64}$/u)
    expect(row.leaked).toBe(false)
  } finally {
    try { await host?.close() } finally {
      if (dirname(root) !== tmp || !basename(root).startsWith('acmi-0912-variant-')) throw new Error('Invalid cleanup path')
      await rm(root, { recursive: true, force: true })
    }
  }
})
