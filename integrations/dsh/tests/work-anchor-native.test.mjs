import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { assignmentHost } from './fixtures/assignment-native-host.mjs'
import { catalogs, inputs, anchorWire } from '../../../scripts/phase-0.9.14/design.mjs'
import { sameAssignment, WorkAnchorRegistry } from '../../../scripts/phase-0.9.14/anchor.mjs'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const { splitRoles } = built ? await import('../dist/role-attribution.js') : await import('../src/role-attribution.ts')
const { CausalAttribution } = built ? await import('../dist/inline-attribution.js') : await import('../src/inline-attribution.ts')

for (const explicitGrant of [true, false]) {
  test('stock dsh: explicit lookup grant is independent of launch anchor: ' + explicitGrant, async () => {
    const item = { ...inputs.find(x => x.id === 'probe-04:B'), toolAvailable: true,
      text: 'Look up amber for the selected item and indigo for the different item.' }
    const catalog = catalogs.get(item.id)
    const a = item.candidates.find(x => x.task === 'Quince Docket').ref, b = item.candidates.find(x => x.task === 'Teal Poster').ref
    const scope = { workspace: catalog.workspace, principalId: 'member', sessionId: item.story, requestId: 'scripted-request' }
    const registry = new WorkAnchorRegistry((s, target) => s.workspace === catalog.workspace
      && Object.values(catalog.links).some(x => sameAssignment(x, target)) ? { taskRevision: 1, authorizationRevision: 1 } : null)
    registry.capture({ eventId: 'trusted-continue', kind: 'continue', scope, target: catalog.links[a], at: 100 })
    let host, use, grant, n = 0
    const denied = []
    const tmp = await realpath(tmpdir()), root = await realpath(await mkdtemp(join(tmp, 'acmi-0914-anchor-')))
    try {
      host = await assignmentHost(acmi, splitRoles, CausalAttribution, root, async packet => {
        const first = ++n === 1
        if (!first) expect(packet.prompt).toContain('amber=17')
        const data = { answer: first ? 'Here is the lookup plan.' : 'Amber is 17.', tag: {
          user_turn: { kind: 'existing', ref: b }, assistant: { primary: { kind: 'existing', ref: b }, related: [a] },
          intent: 'execute', ...(first ? { operations: [{ ref: 'a1', key: 'amber', assignment: a },
            { ref: 'a2', key: 'indigo', assignment: b }] } : {}),
        } }
        return { ticket: n, raw: JSON.stringify(data), stop: 'eos', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, latencyMs: 0 }
      }, 'scripted', {
        buildPacket(entry, results, source) {
          use = registry.resolve('trusted-continue', scope, source.nativeUserId, 110)
          expect(use.status).toBe('accepted')
          if (!grant && explicitGrant) grant = registry.grantLookup(use, 110)
          return anchorWire(entry, results, a)
        },
        gateOperations(operations) {
          return operations.filter(op => {
            const decision = registry.lookupDecision(use, grant, op, 111)
            if (decision !== 'allow_lookup') denied.push(decision)
            return decision === 'allow_lookup'
          })
        },
      })
      const row = await host.run(item, catalog)
      expect(row.native.end).toBe('completed')
      expect(row.steps[0].decoded.user).toEqual(catalog.links[b])
      expect(row.steps[0].decoded.operations).toHaveLength(2)
      expect(row.leaked).toBe(false)
      expect(Object.values(row.unchanged).every(Boolean)).toBe(true)
      if (explicitGrant) {
        expect(denied).toEqual(['target_conflict'])
        expect(row.native.calls).toHaveLength(1)
        expect(row.native.results).toHaveLength(1)
        expect(row.native.results[0]).toMatchObject({ callId: row.native.calls[0].callId,
          text: 'amber=17', inherited: { task: catalog.links[a].taskId, work: catalog.links[a].workId } })
        expect(n).toBe(2)
      } else {
        expect(denied).toEqual(['grant_required', 'grant_required'])
        expect(row.native.calls).toEqual([])
        expect(row.native.results).toEqual([])
        expect(n).toBe(1)
      }
    } finally {
      try { await host?.close() } finally {
        if (dirname(root) !== tmp || !basename(root).startsWith('acmi-0914-anchor-')) throw new Error('Invalid cleanup path')
        await rm(root, { recursive: true, force: true })
      }
    }
  })
}

test('late result retains originating call snapshot after a fresh conflicting work anchor', () => {
  const scope = { workspace: 'local', principalId: 'member', sessionId: 's1', requestId: 'r1' }
  const a = { taskId: 'a', workId: 'wa' }, b = { taskId: 'b', workId: 'wb' }
  const registry = new WorkAnchorRegistry(() => ({ taskRevision: 1, authorizationRevision: 1 }), 20)
  registry.capture({ eventId: 'click-a', kind: 'continue', scope, target: a, at: 100 })
  const original = registry.resolve('click-a', scope, 'user-a', 110)
  const causal = new CausalAttribution()
  const origin = { workspace: 'local', session: 's1', callId: 'call-1' }
  causal.recordCall({ ...origin, task: original.target.taskId, work: original.target.workId, generation: 'g1',
    ref: 'a1', execution: 's1:1', causation: 's1:5' })
  const next = { ...scope, requestId: 'r2' }
  registry.capture({ eventId: 'click-b', kind: 'continue', scope: next, target: b, at: 130 })
  expect(registry.resolve('click-b', next, 'user-b', 131).target).toEqual(b)
  expect(registry.resolve('click-a', scope, 'user-a', 131).status).toBe('expired')
  expect(causal.result(origin)).toMatchObject({ task: 'a', work: 'wa', causation: 's1:5' })
  expect(causal.result({ ...origin, workspace: 'other' })).toBeNull()
})
