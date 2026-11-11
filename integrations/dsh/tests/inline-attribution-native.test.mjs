import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { input, truth } from '../../../scripts/phase-0.9.10/corpus.mjs'
import { createInlineNativeHost } from './fixtures/inline-native-host.mjs'

const built = process.env.ACMI_TEST_BUILT === '1'
const acmi = built ? await import('../dist/index.js') : await import('../src/index.ts')
const protocol = built ? await import('../dist/inline-attribution.js') : await import('../src/inline-attribution.ts')
const tool = input.find(x => x.family === 'multi-tool' && x.turn === 4)
const gold = truth.find(x => x.id === tool.id)
const catalogs = new Map([[tool.id, { workspace: gold.workspace, tasks: gold.tasks }]])

for (const terminalTools of [true, false]) {
  test('stock dsh: separate answer, two native results, ' + (terminalTools ? 'terminal' : 'normal continuation'), async () => {
    const tmp = await realpath(tmpdir())
    const base = await realpath(await mkdtemp(join(tmp, 'acmi-0910-native-')))
    let host
    try {
      let calls = 0
      host = await createInlineNativeHost(acmi, protocol, base, async (packet, ticket) => {
        const { source_user_turn_ref, candidates } = JSON.parse(packet.prompt.split('Request data: ')[1])
        const [a, b] = candidates.filter(x => x.objective.startsWith('Quartz')).sort((x, y) => y.objective.localeCompare(x.objective))
        const actions = [{ ref: 'a1', key: 'amber', task: a.task, work: a.work }, { ref: 'a2', key: 'indigo', task: b.task, work: b.work }]
        const result = { assistant_response: calls ? 'Checked.' : 'Checking the synthetic values.',
          acmi_attribution: { version: 1, generation_ref: ticket.generation, source_user_turn_ref,
            user: a.task, response: a.task, work: a.work, support: 'sufficient', related: [b.task] },
          ...(calls ? {} : { actions }) }
        return { raw: JSON.stringify(result), ticket: ++calls, stop: 'eos', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, latencyMs: 0 }
      }, { model: 'scripted', catalogs, terminalTools })
      const record = await host.run(tool, 'B', 'pilot')
      expect(record.error).toBeNull()
      expect(record.native.end).toBe('completed')
      expect(calls).toBe(terminalTools ? 1 : 2)
      expect(record.native.calls).toHaveLength(2)
      expect(record.native.results.map(r => [r.text, r.isError, r.inherits?.task])).toEqual([
        ['amber=17', false, gold.calls[0].taskId], ['indigo=29', false, gold.calls[1].taskId],
      ])
      expect(record.metadataLeak).toBe(false)
      expect(record.unchanged).toEqual({ graph: true, otherJournals: true, binding: true })
      expect(record.steps[0].generation).toBe(record.steps[0].proposal.generation)
      expect(record.native.assistant[0].text).toBe('Checking the synthetic values.')
    } finally {
      try { await host?.close() } finally {
        if (dirname(base) !== tmp || !basename(base).startsWith('acmi-0910-native-')) throw new Error('Invalid cleanup path')
        await rm(base, { recursive: true, force: true })
      }
    }
  }, 15000)
}
