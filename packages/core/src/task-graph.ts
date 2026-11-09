import type {
  AgentExecution, DependencyReceipt, Digest, EvidenceContent, ExecutionState, GraphAppend, GraphEvidence,
  GraphIssue, GraphRef, RequiredResult, ResultReview, ScopeAuthority, TaskGraphEvent, TaskGraphEventWriter,
  TaskGraphReader, TaskGraphSnapshot, WorkEdge, WorkNode, WorkProgress, WorkResult, WorkState, WorkspaceScope,
} from '@acmi/contracts'
import { canonical, clone, freeze } from './canonical.ts'
import { cleanRef, isEventRef, isTaskId, natural, sessionKey } from './guards.ts'

const version = 'task-graph-v1' as const
export const graphEventLimit = 4096
const key = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(value)
const text = (value: unknown, max = 8192): value is string => typeof value === 'string' && value.length <= max
  && value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
const keys = (value: unknown, max: number): value is readonly string[] =>
  Array.isArray(value) && value.length <= max && value.every(key) && new Set(value).size === value.length
const inList = <T>(value: unknown, options: readonly T[]): value is T => options.some(x => x === value)
const workStates: Record<WorkState, readonly WorkState[]> = {
  planned: ['ready', 'blocked', 'cancelled', 'superseded'],
  ready: ['running', 'blocked', 'cancelled', 'superseded'],
  running: ['completed', 'failed', 'blocked', 'cancelled', 'superseded'],
  blocked: ['ready', 'failed', 'cancelled', 'superseded'],
  failed: ['ready', 'superseded'], completed: [], cancelled: [], superseded: [],
}
const executionStates: Record<ExecutionState, readonly ExecutionState[]> = {
  running: ['waiting', 'idle', 'completed', 'failed', 'cancelled'],
  waiting: ['running', 'failed', 'cancelled'], idle: ['running', 'completed', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
}
const stages = ['available', 'inspected', 'consumed', 'accepted'] as const
const terminal = (state: ExecutionState) => executionStates[state].length === 0
const reviewKey = (node: WorkNode, resultId: string) => JSON.stringify([node.id, node.attempt, resultId])

function validEvidence(content: EvidenceContent, source: GraphRef['source']): boolean {
  if (!content || !text(content.text)) return false
  let fields = ['kind', 'text']
  let valid = false
  switch (content.kind) {
    case 'decision':
      fields = [...fields, 'topic', 'state', 'rationale']
      valid = key(content.topic) && inList(content.state, ['proposed', 'accepted', 'superseded', 'rejected', 'disputed', 'unresolved'])
        && (content.rationale === undefined || text(content.rationale, 4096))
      break
    case 'artifact':
      fields.push('state')
      valid = inList(content.state, ['verified', 'unverified', 'stale'])
      break
    case 'tool-outcome':
      fields.push('call')
      valid = isEventRef(content.call) && sessionKey(content.call.session) === sessionKey(source.session)
        && content.call.sourceRevision === source.sourceRevision && content.call.localSeq < source.localSeq
      break
    default: valid = inList(content.kind, ['constraint', 'blocker', 'next-action', 'unresolved', 'runtime-state'])
  }
  return valid && Object.keys(content).every(k => fields.includes(k))
}

interface Receipt { readonly seq: number; readonly id: string; readonly hash: string; readonly applied: boolean }
interface CheckpointBody {
  readonly workspaceId: string
  readonly projection: TaskGraphSnapshot
  readonly receipts: readonly Receipt[]
}
export interface TaskGraphCheckpoint extends CheckpointBody { readonly checksum: string }
export interface TaskGraphOptions {
  readonly taskId: string
  readonly workspaceId: string
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly digest: Digest
}

/** In-memory trusted-writer projection. The host owns the append-only stream and checkpoint storage. */
export class TaskGraph implements TaskGraphReader, TaskGraphEventWriter {
  readonly #options: TaskGraphOptions
  readonly #nodes = new Map<string, WorkNode>()
  readonly #edges: WorkEdge[] = []
  readonly #executions = new Map<string, AgentExecution>()
  readonly #results = new Map<string, WorkResult>()
  readonly #dependencies = new Map<string, RequiredResult>()
  readonly #reviews = new Map<string, ResultReview>()
  readonly #evidence = new Map<string, GraphEvidence>()
  readonly #progress = new Map<string, WorkProgress>()
  readonly #unresolved: GraphIssue[] = []
  readonly #receipts = new Map<string, Receipt>()
  readonly #pending = new Map<number, { event: TaskGraphEvent; hash: string }>()
  readonly #pendingIds = new Map<string, number>()
  readonly #slots = new Map<number, string>()
  #task: TaskGraphSnapshot['task']
  #activeNodeId: string | undefined
  #position: GraphRef | undefined
  #through = 0
  #revision: string
  #invalid = false
  #cached: TaskGraphSnapshot | undefined

  constructor(options: TaskGraphOptions) {
    if (!isTaskId(options.taskId) || !text(options.workspaceId, 512)) throw new TypeError('Invalid graph identity')
    this.#options = { ...options }
    this.#revision = options.digest(canonical([version, options.workspaceId, options.taskId]))
  }

  #permits(scope: WorkspaceScope): boolean {
    return this.#options.authority.permits(scope, this.#options.workspaceId)
  }

  append(scope: WorkspaceScope, input: TaskGraphEvent): GraphAppend {
    if (!this.#permits(scope)) return 'scope-denied'
    if (this.#invalid) return 'conflict'
    if (!input || !natural(input.seq) || input.seq === 0 || !key(input.id) || !isEventRef(input.source)
      || (input.after !== undefined && !keys(input.after, 32))) return 'invalid-envelope'
    if (input.seq > graphEventLimit) return 'limit'
    let data: string
    try {
      data = canonical(input)
    } catch {
      return 'invalid-envelope'
    }
    if (data.length > 24_576) return 'limit'
    const event = JSON.parse(data) as TaskGraphEvent
    const hash = this.#options.digest(data)
    const occupied = this.#slots.get(event.seq)
    const existing = this.#receipts.get(event.id)
    const pending = this.#pending.get(event.seq)
    if (occupied === event.id && (existing?.hash ?? pending?.hash) === hash) return 'duplicate'
    if (occupied !== undefined || existing !== undefined || this.#pendingIds.has(event.id)) {
      this.#invalid = true
      return 'conflict'
    }
    this.#cached = undefined
    this.#slots.set(event.seq, event.id)
    this.#pending.set(event.seq, { event, hash })
    this.#pendingIds.set(event.id, event.seq)
    for (let entry = this.#pending.get(this.#through + 1); entry; entry = this.#pending.get(this.#through + 1)) {
      const next = entry.event
      const ref = freeze({ eventId: next.id, seq: next.seq, source: cleanRef(next.source) })
      const reason = next.after?.some(id => !this.#receipts.get(id)?.applied)
        ? 'missing-cause' : this.#apply(next, ref)
      if (reason) this.#unresolved.push({ reason, ref })
      this.#through = next.seq
      this.#revision = this.#options.digest(canonical([this.#revision, entry.hash]))
      this.#receipts.set(next.id, { seq: next.seq, id: next.id, hash: entry.hash, applied: !reason })
      this.#pending.delete(next.seq)
      this.#pendingIds.delete(next.id)
    }
    const receipt = this.#receipts.get(event.id)
    return receipt === undefined ? 'buffered' : receipt.applied ? 'applied' : 'unresolved'
  }

  read(scope: WorkspaceScope): TaskGraphSnapshot | null {
    if (!this.#permits(scope) || this.#invalid) return null
    return this.#snapshot()
  }

  #snapshot(): TaskGraphSnapshot {
    return this.#cached ??= freeze({
      version, taskId: this.#options.taskId, through: this.#through,
      pending: this.#pending.size, sourceRevision: this.#revision,
      ...(this.#task ? { task: this.#task } : {}),
      ...(this.#activeNodeId && this.#position ? { activeNodeId: this.#activeNodeId, position: this.#position } : {}),
      nodes: [...this.#nodes.values()], edges: [...this.#edges], executions: [...this.#executions.values()],
      results: [...this.#results.values()], dependencies: [...this.#dependencies.values()],
      reviews: [...this.#reviews.values()], evidence: [...this.#evidence.values()],
      progress: [...this.#progress.values()], unresolved: [...this.#unresolved],
    })
  }

  /** Pin a verified producer result from the same authorized Workspace. No implicit Task discovery. */
  captureDependency(scope: WorkspaceScope, producer: TaskGraph, resultId: string): DependencyReceipt | null {
    if (!this.#permits(scope) || !producer.#permits(scope) || this.#options.workspaceId !== producer.#options.workspaceId
      || this.#options.taskId === producer.#options.taskId || producer.#invalid || producer.#pending.size > 0) return null
    const result = producer.#results.get(resultId)
    if (!result?.verified || producer.#nodes.get(result.nodeId)?.attempt !== result.attempt
      || producer.#nodes.get(result.nodeId)?.state !== 'completed') return null
    return freeze({ taskId: producer.#options.taskId, sourceRevision: producer.#revision, result })
  }

  checkpoint(scope: WorkspaceScope): TaskGraphCheckpoint | null {
    const projection = this.read(scope)
    if (!projection || projection.pending !== 0) return null
    const body = { workspaceId: this.#options.workspaceId, projection, receipts: [...this.#receipts.values()] }
    return freeze({ ...body, checksum: this.#options.digest(canonical(body)) })
  }

  /** Restore a checkpoint from trusted local storage. The checksum detects corruption, not forgery. */
  restore(scope: WorkspaceScope, checkpoint: TaskGraphCheckpoint): TaskGraph | null {
    if (!this.#permits(scope)) return null
    const { checksum, ...body } = checkpoint
    const { workspaceId, projection: s, receipts } = body
    if (workspaceId !== this.#options.workspaceId || s.version !== version || s.taskId !== this.#options.taskId
      || s.pending !== 0 || !natural(s.through) || s.through > graphEventLimit || receipts.length !== s.through
      || this.#options.digest(canonical(body)) !== checksum) return null
    const next = new TaskGraph(this.#options)
    const p = freeze(clone(s))
    next.#cached = p
    next.#through = p.through
    next.#revision = p.sourceRevision
    next.#task = p.task
    next.#activeNodeId = p.activeNodeId
    next.#position = p.position
    for (const row of p.nodes) next.#nodes.set(row.id, row)
    next.#edges.push(...p.edges)
    for (const row of p.executions) next.#executions.set(row.id, row)
    for (const row of p.results) next.#results.set(row.id, row)
    for (const row of p.dependencies) next.#dependencies.set(row.id, row)
    for (const row of p.reviews) next.#reviews.set(JSON.stringify([row.nodeId, row.attempt, row.resultId]), row)
    for (const row of p.evidence) next.#evidence.set(row.id, row)
    for (const row of p.progress) next.#progress.set(row.nodeId, row)
    next.#unresolved.push(...p.unresolved)
    for (const row of receipts) {
      next.#receipts.set(row.id, { ...row })
      next.#slots.set(row.seq, row.id)
    }
    return next
  }

  #apply(e: TaskGraphEvent, ref: GraphRef): string | undefined {
    if (e.kind === 'task-opened') {
      if (this.#task || !text(e.objective, 4096) || !Array.isArray(e.criteria)
        || e.criteria.length < 1 || e.criteria.length > 16 || !e.criteria.every(x => text(x, 1024))) return 'invalid-task'
      this.#task = { objective: e.objective, criteria: e.criteria, opened: ref }
      return
    }
    if (!this.#task) return 'unknown-task'
    if (this.#task.closed) return 'task-closed'
    if (e.kind === 'task-closed') {
      if (!this.#activeNodeId || this.#nodes.get(this.#activeNodeId)?.state !== 'completed'
        || [...this.#executions.values()].some(x => !terminal(x.state))) return 'task-not-complete'
      this.#task = { ...this.#task, closed: ref }
      return
    }
    if (e.kind === 'node-added') {
      if (!key(e.nodeId) || this.#nodes.has(e.nodeId) || !text(e.title, 512) || !inList(e.role, ['work', 'join'])) return 'invalid-node'
      this.#nodes.set(e.nodeId, { id: e.nodeId, title: e.title, role: e.role, state: 'planned', attempt: 1, declared: ref, changed: ref })
      return
    }
    if (e.kind === 'edge-added') return this.#addEdge(e, ref)
    if (e.kind === 'execution-transitioned') return this.#executionTransition(e, ref)
    const node = 'nodeId' in e && e.nodeId !== undefined ? this.#nodes.get(e.nodeId) : undefined
    if (!node && !(e.kind === 'evidence-recorded' && e.nodeId === undefined)) return 'unknown-node'
    if (e.kind === 'evidence-recorded') return this.#recordEvidence(e, ref)
    if (!node) return 'unknown-node'
    switch (e.kind) {
      case 'work-transitioned': {
        if (!inList(e.state, workStates[node.state])) return 'invalid-work-transition'
        if (e.state === 'running' && this.#edges.some(edge => edge.from === node.id && edge.relation === 'depends_on'
          && this.#nodes.get(edge.to)?.state !== 'completed')) return 'dependency-blocked'
        const retry = node.state === 'failed' && e.state === 'ready'
        if (retry && [...this.#executions.values()].some(x => x.nodeId === node.id && !terminal(x.state))) return 'execution-still-live'
        if (retry) {
          const { joinSatisfied: _, ...rest } = node
          this.#nodes.set(node.id, { ...rest, state: e.state, changed: ref, attempt: node.attempt + 1 })
          this.#progress.delete(node.id)
        } else this.#nodes.set(node.id, { ...node, state: e.state, changed: ref })
        return
      }
      case 'work-progressed':
        if (node.state !== 'running' || !text(e.summary)) return 'invalid-progress'
        this.#progress.set(node.id, { nodeId: node.id, summary: e.summary, ref })
        return
      case 'execution-started': {
        const parent = e.parentId === undefined ? undefined : this.#executions.get(e.parentId)
        if (e.parentId !== undefined && (!parent || terminal(parent.state))) return 'unknown-live-parent'
        if (!key(e.executionId) || this.#executions.has(e.executionId) || !key(e.agentId) || node.state !== 'running') return 'invalid-execution'
        this.#executions.set(e.executionId, { id: e.executionId, nodeId: node.id, attempt: node.attempt, agentId: e.agentId,
          ...(parent ? { parentId: parent.id } : {}), state: 'running', started: ref, changed: ref })
        return
      }
      case 'result-produced': {
        const execution = this.#executions.get(e.executionId)
        if (node.state !== 'running' || execution?.nodeId !== node.id || execution.attempt !== node.attempt
          || execution.state !== 'running' || !key(e.resultId) || this.#results.has(e.resultId)
          || this.#dependencies.has(e.resultId) || !text(e.summary) || typeof e.verified !== 'boolean') return 'invalid-result'
        this.#results.set(e.resultId, { id: e.resultId, nodeId: node.id, executionId: execution.id,
          attempt: node.attempt, summary: e.summary, verified: e.verified, produced: ref })
        return
      }
      case 'dependency-required': {
        const receipt = e.receipt
        const r = receipt?.result
        if (node.joinSatisfied || !key(e.resultId) || this.#dependencies.has(e.resultId) || this.#results.has(e.resultId)
          || !isTaskId(receipt?.taskId) || receipt.taskId === this.#options.taskId
          || !/^[a-f0-9]{64}$/u.test(receipt.sourceRevision) || !r || r.verified !== true || !text(r.summary)
          || !key(r.id) || !key(r.nodeId) || !key(r.executionId) || !natural(r.attempt) || r.attempt === 0
          || !key(r.produced?.eventId) || !natural(r.produced.seq) || !isEventRef(r.produced.source)) return 'invalid-dependency'
        const result: WorkResult = { id: r.id, nodeId: r.nodeId, executionId: r.executionId, attempt: r.attempt, verified: true,
          summary: r.summary, produced: { eventId: r.produced.eventId, seq: r.produced.seq, source: cleanRef(r.produced.source) } }
        this.#dependencies.set(e.resultId, { id: e.resultId, nodeId: node.id, ref,
          receipt: { taskId: receipt.taskId, sourceRevision: receipt.sourceRevision, result } })
        return
      }
      case 'result-reviewed': return this.#review(node, e, ref)
      case 'join-satisfied':
        if (node.role !== 'join' || node.joinSatisfied || !this.#joinReady(node)) return 'join-not-ready'
        this.#nodes.set(node.id, { ...node, joinSatisfied: ref })
        return
      case 'mainline-advanced': {
        if (this.#activeNodeId === node.id || (node.role === 'join' && !node.joinSatisfied)
          || !inList(node.state, ['planned', 'ready', 'running'])
          || (this.#activeNodeId !== undefined && (this.#nodes.get(this.#activeNodeId)?.state !== 'completed'
            || !this.#edges.some(edge => edge.from === this.#activeNodeId && edge.to === node.id && edge.relation === 'continues_as')))) {
          return 'invalid-mainline-advance'
        }
        this.#activeNodeId = node.id
        this.#position = ref
        return
      }
      default: return 'unsupported-event'
    }
  }

  #executionTransition(e: Extract<TaskGraphEvent, { kind: 'execution-transitioned' }>, ref: GraphRef): string | undefined {
    const x = this.#executions.get(e.executionId)
    if (!x || !inList(e.state, executionStates[x.state])) return 'invalid-execution-transition'
    if (e.state === 'waiting' ? !keys(e.waitingFor, 32) || e.waitingFor.length === 0
      || e.waitingFor.some(id => {
        const child = this.#executions.get(id)
        return child?.parentId !== x.id || terminal(child.state)
      }) : e.waitingFor !== undefined) return 'invalid-wait-target'
    const { waitingFor: _, ...base } = x
    this.#executions.set(x.id, { ...base, state: e.state, changed: ref, ...(e.waitingFor ? { waitingFor: e.waitingFor } : {}) })
    return
  }

  #recordEvidence(e: Extract<TaskGraphEvent, { kind: 'evidence-recorded' }>, ref: GraphRef): string | undefined {
    if (!validEvidence(e.content, ref.source)) return 'invalid-evidence'
    if (e.supersedes !== undefined) {
      const prior = this.#evidence.get(e.supersedes)
      if (!prior || prior.superseded || prior.nodeId !== e.nodeId || prior.content.kind !== e.content.kind
        || (e.content.kind === 'decision' && (prior.content.kind !== 'decision' || prior.content.topic !== e.content.topic
          || (prior.content.state === 'accepted' && !inList(e.content.state, ['accepted', 'superseded', 'disputed']))))) {
        return 'invalid-supersession'
      }
      this.#evidence.set(prior.id, { ...prior, superseded: ref })
    }
    const content = e.content.kind === 'tool-outcome' ? { ...e.content, call: cleanRef(e.content.call) } : e.content
    this.#evidence.set(e.id, { id: e.id, ...(e.nodeId ? { nodeId: e.nodeId } : {}), content, ref })
    return
  }

  #review(node: WorkNode, e: Extract<TaskGraphEvent, { kind: 'result-reviewed' }>, ref: GraphRef): string | undefined {
    const local = this.#results.get(e.resultId)
    const required = this.#dependencies.get(e.resultId)
    if (!local && !required) return 'unknown-result'
    if (required && required.nodeId !== node.id) return 'result-not-required'
    if (local && (this.#nodes.get(local.nodeId)?.attempt !== local.attempt
      || !this.#edges.some(edge => (edge.from === local.nodeId && edge.to === node.id && edge.relation === 'joins_into')
        || (edge.from === node.id && edge.to === local.nodeId && edge.relation === 'depends_on')))) return 'result-not-required'
    const id = reviewKey(node, e.resultId)
    const previous = this.#reviews.get(id)
    const index = previous === undefined ? 0 : stages.indexOf(previous.stage) + 1
    if (stages[index] !== e.stage || (e.stage === 'accepted' && !(local?.verified ?? required?.receipt.result.verified))) {
      return 'invalid-review-transition'
    }
    this.#reviews.set(id, { resultId: e.resultId, nodeId: node.id, attempt: node.attempt, stage: e.stage, ref })
    return
  }

  #joinReady(node: WorkNode): boolean {
    const branches = new Set(this.#edges.filter(e => e.to === node.id && e.relation === 'joins_into').map(e => e.from))
    const required = [...this.#dependencies.values()].filter(d => d.nodeId === node.id)
    if (branches.size === 0 && required.length === 0) return false
    for (const branch of branches) if (this.#nodes.get(branch)?.state !== 'completed') return false
    for (const r of this.#results.values()) if (branches.has(r.nodeId) && this.#nodes.get(r.nodeId)?.attempt === r.attempt
      && this.#reviews.get(reviewKey(node, r.id))?.stage === 'accepted') branches.delete(r.nodeId)
    return branches.size === 0 && required.every(r => this.#reviews.get(reviewKey(node, r.id))?.stage === 'accepted')
  }

  #addEdge(e: Extract<TaskGraphEvent, { kind: 'edge-added' }>, ref: GraphRef): string | undefined {
    const from = this.#nodes.get(e.from)
    const to = this.#nodes.get(e.to)
    if (!from || !to) return 'unknown-node'
    if (!inList(e.relation, ['decomposes_into', 'depends_on', 'continues_as', 'joins_into', 'references'])
      || (e.relation === 'joins_into' && (to.role !== 'join' || to.joinSatisfied))
      || this.#edges.some(x => x.from === e.from && x.to === e.to && x.relation === e.relation)) return 'invalid-edge'
    if (e.relation !== 'references') {
      const neighbors = new Map<string, string[]>()
      for (const edge of this.#edges) {
        if (edge.relation !== e.relation) continue
        const list = neighbors.get(edge.from)
        if (list) list.push(edge.to)
        else neighbors.set(edge.from, [edge.to])
      }
      const stack = [e.to]
      const seen = new Set<string>()
      while (stack.length) {
        const current = stack.pop()!
        if (current === e.from) return 'edge-cycle'
        if (seen.has(current)) continue
        seen.add(current)
        for (const next of neighbors.get(current) ?? []) stack.push(next)
      }
    }
    this.#edges.push({ from: from.id, to: to.id, relation: e.relation, ref })
    return
  }
}
