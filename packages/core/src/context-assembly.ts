import type {
  ContextAssemblyRequest, ContextAssemblyResult, ContextItem, Digest, OmissionReason, TaskContextPackage,
  TaskGraphReader, WorkspaceScope,
} from '@acmi/contracts'
import { canonical, freeze } from './canonical.ts'
import { collectCandidates } from './context-candidates.ts'
import { isTaskId, natural } from './guards.ts'

const policy = 'task-context-v1' as const
const schema = 'task-context-package-v1' as const
const reserve = 192
const maxBudget = 262_144
const placeholder = '0'.repeat(64)
const estimator = 'utf8-byte-upper-estimate-v1' as const
const rank = (item: ContextItem) => item.kind === 'next-action' ? 0 : item.kind === 'decision' ? 1
  : item.kind === 'dependency-result' ? 2 : item.kind === 'unreviewed_dependency_output' ? 3 : 4
const byId = (a: ContextItem, b: ContextItem) =>
  a.tier - b.tier || rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** One unit per UTF-8 byte, not an exact model token count. */
export function estimateContextTokens(input: string): number {
  let count = 0
  for (const ch of input) {
    const code = ch.codePointAt(0)!
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
  }
  return count
}

export const serializeTaskContext = (pkg: TaskContextPackage): string => canonical(pkg)

function shorten(item: ContextItem): ContextItem {
  if (!['artifact', 'progress', 'tool-outcome'].includes(item.kind)) return item
  if (estimateContextTokens(item.text) <= 1024) return item
  let text = ''
  let units = 0
  for (const ch of item.text) {
    units += estimateContextTokens(ch)
    if (units > 1009) break
    text += ch
  }
  return { ...item, text: text + '\n[truncated]', truncated: true }
}

export function assembleTaskContext(
  graph: TaskGraphReader,
  scope: WorkspaceScope,
  request: ContextAssemblyRequest,
  digest: Digest,
): ContextAssemblyResult {
  if (!request || !isTaskId(request.taskId) || request.policyVersion !== policy || !natural(request.tokenBudget)
    || request.tokenBudget === 0 || request.tokenBudget > maxBudget || typeof request.includeDependencyResults !== 'boolean') {
    return { status: 'invalid_request' }
  }
  const cut = graph.read(scope)
  if (!cut || cut.taskId !== request.taskId) return { status: 'unavailable' }
  const active = cut.nodes.find(n => n.id === cut.activeNodeId)
  if (!cut.task || !active || !cut.position || cut.pending !== 0
    || (request.activeNodeId !== undefined && request.activeNodeId !== active.id)) return { status: 'unresolved' }
  const omissions: Record<OmissionReason, number> = {
    low_relevance: 0, duplicate: 0, superseded: 0, unverified: 0, not_consumed: 0, stale: 0,
    budget_exceeded: 0, policy_disabled: 0, unsupported_source: 0,
  }
  const diagnostics: { id: string; reason: OmissionReason }[] = []
  const candidates = collectCandidates(cut, active, request.includeDependencyResults, (id, reason) => {
    omissions[reason]++
    diagnostics.push({ id, reason })
  }).sort(byId)
  const items: ContextItem[] = []
  const assembly = {
    policyVersion: policy, sourceRevision: cut.sourceRevision, graphVersion: cut.version,
    tokenBudget: request.tokenBudget, reservedTokens: reserve, estimatedTokens: 0, estimator,
    includedCount: 0, omittedCount: diagnostics.length + candidates.filter(x => x.tier !== 0).length,
  }
  const base = {
    schemaVersion: schema, taskId: cut.taskId, activeNodeId: active.id,
    currentState: { task: cut.task.closed ? 'closed' as const : 'open' as const, work: active.state, attempt: active.attempt },
    omissions,
  }
  omissions.budget_exceeded = assembly.omittedCount - diagnostics.length
  let itemCost = 0
  function size(): number {
    // The only variable-width self-reference is the decimal token estimate.
    assembly.estimatedTokens = 0
    const shell = estimateContextTokens(canonical({ ...base, items: [], assembly: { ...assembly, deterministicHash: placeholder } }))
    let estimate = shell + itemCost + reserve
    while (true) {
      const revised = shell + itemCost + reserve + String(estimate).length - 1
      if (estimate === revised) return estimate
      estimate = revised
    }
  }
  const append = (item: ContextItem) => {
    const price = estimateContextTokens(canonical(item)) + (items.length ? 1 : 0)
    itemCost += price
    items.push(item)
    assembly.includedCount++
    return price
  }
  for (const item of candidates) if (item.tier === 0) append(item)
  const minimumEstimatedTokens = size()
  if (minimumEstimatedTokens > request.tokenBudget) return { status: 'budget_insufficient', minimumEstimatedTokens }
  for (const candidate of candidates) {
    if (candidate.tier === 0) continue
    const price = append(shorten(candidate))
    omissions.budget_exceeded--
    assembly.omittedCount--
    if (size() <= request.tokenBudget) continue
    itemCost -= price
    items.pop()
    assembly.includedCount--
    omissions.budget_exceeded++
    assembly.omittedCount++
    diagnostics.push({ id: candidate.id, reason: 'budget_exceeded' })
  }
  assembly.estimatedTokens = size()
  const body = { ...base, items, assembly }
  const deterministicHash = digest(canonical(body))
  if (!/^[a-f0-9]{64}$/u.test(deterministicHash)) throw new TypeError('Host must supply SHA-256')
  return freeze({ status: 'ok', package: { ...body, assembly: { ...assembly, deterministicHash } }, diagnostics })
}

/** Verify an authorized host's expected package hash, never a hash trusted solely from the payload. */
export function loadTaskContext(
  serialized: string,
  expected: { readonly taskId: string; readonly hash: string },
  digest: Digest,
): TaskContextPackage | null {
  if (typeof serialized !== 'string' || serialized.length > maxBudget || !isTaskId(expected.taskId)
    || !/^[a-f0-9]{64}$/u.test(expected.hash)) return null
  try {
    const pkg = JSON.parse(serialized) as TaskContextPackage
    const { deterministicHash, ...assembly } = pkg.assembly
    if (pkg.schemaVersion !== schema || pkg.taskId !== expected.taskId || deterministicHash !== expected.hash
      || assembly.policyVersion !== policy || assembly.estimator !== estimator || assembly.reservedTokens !== reserve
      || assembly.estimatedTokens !== estimateContextTokens(serialized) + reserve
      || !natural(assembly.tokenBudget) || assembly.tokenBudget > maxBudget || assembly.estimatedTokens > assembly.tokenBudget
      || serialized !== serializeTaskContext(pkg) || digest(canonical({ ...pkg, assembly })) !== expected.hash) return null
    return freeze(pkg)
  } catch {
    return null
  }
}
