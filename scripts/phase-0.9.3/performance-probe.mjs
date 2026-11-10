import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { buildLayeredContext, createScopeAuthority, LayeredCandidateIndex, LayeredState, validateLayeredClaims,
  understandLayered, scriptedLayeredProposalAnalyzer } from '../../packages/core/dist/index.js'

const sha256 = text => createHash('sha256').update(text).digest('hex')
const authority = createScopeAuthority()
const scope = authority.grant('perf-lab')
const access = { authority, scope, sha256 }
const cut = { workspaceId: 'perf-lab', sessionId: 'session', incarnation: 'incarnation', cursor: 10, graphRevision: 1,
  authorizationEpoch: 1, bindingRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: 'perf-v1' }
const binding = { taskId: 't1' }
const current = { id: 'turn10', kind: 'message', actor: 'user', text: 'Refine objective: verify checksum on signed crate slips' }
const rows = Array.from({ length: 512 }, (_, i) => ({
  taskId: 't' + (i + 1), workspaceId: cut.workspaceId, catalogRevision: 1, revision: 1, status: i % 17 === 16 ? 'closed' : 'open',
  objective: 'Check signed crate manifest and instrument inventory ' + i,
  aliases: ['crate slip ' + i], lastActivity: 512 - i, acceptedDecisions: ['Use printed station signs'],
  blockers: ['Pending audit'], reason: 'lexical',
}))
const query = { cut, query: current.text, bindingTaskId: binding.taskId }
const startIndex = performance.now()
const catalog = new LayeredCandidateIndex(cut.workspaceId, rows)
const indexBuildMs = performance.now() - startIndex
const candidates = catalog.retrieve(query, access).candidates
const graph = { workspaceId: cut.workspaceId, graphRevision: 1, topologyComplete: false, nodes: [], decisions: [], results: [], edges: [] }
const durations = { retrieval: [], packet: [], validator: [], packetPlusValidator: [] }
let packetBytes = 0
let estimatedTokens = 0
for (let i = 0; i < 550; i++) {
  let t = performance.now()
  catalog.retrieve(query, access)
  const retrieval = performance.now() - t
  t = performance.now()
  const result = buildLayeredContext({ cut, current, binding, candidates }, access)
  const packetMs = performance.now() - t
  assert.equal(result.status, 'ready')
  const { packet } = result
  const draft = JSON.parse(scriptedLayeredProposalAnalyzer.propose(packet, understandLayered(packet)))
  t = performance.now()
  const validation = validateLayeredClaims(packet, graph, draft)
  const validator = performance.now() - t
  assert.equal(validation.status, 'draft')
  if (i >= 50) {
    durations.retrieval.push(retrieval)
    durations.packet.push(packetMs)
    durations.validator.push(validator)
    durations.packetPlusValidator.push(packetMs + validator)
  }
  packetBytes = packet.budget.bytes
  estimatedTokens = packet.budget.estimatedTokens
}
const quantile = (sorted, p) => sorted[Math.ceil(sorted.length * p) - 1]
const timing = Object.fromEntries(Object.entries(durations).map(([key, samples]) => {
  samples.sort((a, b) => a - b)
  return [key, { p50Ms: quantile(samples, 0.5), p95Ms: quantile(samples, 0.95), samples: samples.length }]
}))
const state = new LayeredState({ maxSessions: 64, concurrency: 4, now: () => 0 })
let peakSessions = 0
const memoryStartBytes = process.memoryUsage().heapUsed
let peakHeapBytes = memoryStartBytes
for (let i = 0; i < 300; i++) {
  const currentCut = { ...cut, sessionId: 'session-' + i }
  const result = await state.run({ cut: currentCut, fromCursor: 9, bindingTaskId: binding.taskId,
    digest: sha256(String(i)) }, () => ({ status: 'complete', value: null,
    updates: { recentTaskIds: [binding.taskId], unresolvedRefs: ['missing'], pendingProposalIds: ['draft-1'] } }))
  assert.equal(result.status, 'evaluated')
  peakSessions = Math.max(peakSessions, state.metrics().cachedSessions)
  peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed)
}
assert.equal(peakSessions, 64)
assert.equal(process.argv.length, 3, 'Usage: node performance-probe.mjs <new-json-file>')
const result = { timing, indexBuildMs, indexedTasks: rows.length, packetBytes, estimatedTokens,
  memory: { enteredSessions: 300, peakSessions, heapStartBytes: memoryStartBytes, sampledPeakHeapBytes: peakHeapBytes,
    caveat: 'whole process sampled heap, not a per-object size estimate' },
  providerRequests: 0, writes: 0 }
await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(result))
