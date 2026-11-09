/** Neutral, read-only ACMI adapter contract. No runtime, storage or browser imports. */
export type * from './task-graph.ts'

declare const scopeBrand: unique symbol
export type WorkspaceScope = { readonly [scopeBrand]: never }

export interface ScopeAuthority {
  grant(workspaceId: string): WorkspaceScope
  revoke(grant: WorkspaceScope): void
  permits(grant: unknown, workspaceId: string): boolean
}

export const features = ['observe-session', 'causal-tool-pair', 'scoped-task-read', 'scoped-history-read', 'checkpoint-read'] as const
export type Capability = typeof features[number]

export interface Offer {
  readonly major: number
  readonly minor: number
  readonly offered: readonly string[]
  readonly required: readonly string[]
}

export type Negotiation = { readonly ok: true; readonly major: number; readonly minor: number; readonly enabled: readonly Capability[] }
  | { readonly ok: false; readonly code: 'unsupported-protocol' | 'missing-capability' }

export interface AdapterCapabilities {
  readonly schemaVersion: 1
  readonly adapterId: string
  readonly adapterVersion: string
  readonly runtimeVersion: string
  readonly sessionEvents: boolean
  readonly messageEvents: boolean
  readonly toolCallEvents: boolean
  readonly causalToolResults: boolean
  readonly subagentEvents: boolean
  readonly persistentHistory: boolean
  readonly contextInjection: boolean
  readonly taskBindingHooks: boolean
  readonly eventReplay: boolean
  readonly stableSessionIdentity: boolean
}

export interface RuntimeSessionRef {
  readonly adapterId: string
  readonly instanceId: string
  readonly sessionId: string
  readonly incarnation: string
}

/** A local coordinate comparable only within one authorized Session incarnation and cut. */
export interface EventRef {
  readonly session: RuntimeSessionRef
  readonly sourceRevision: string
  readonly localSeq: number
}

interface ToolBoundary {
  readonly ref: EventRef
  readonly turnId: string
  readonly stepId: string
  readonly toolCallId: string
}
export type ToolCall = ToolBoundary & { readonly kind: 'tool-call' }
export type ToolResult = ToolBoundary & { readonly kind: 'tool-result'; readonly originalCall: EventRef | null }
export type NormalizedRuntimeEvent = ToolCall | ToolResult | {
  readonly kind: 'user' | 'assistant' | 'session-open' | 'session-close' | 'agent-open' | 'agent-close'
    | 'turn-open' | 'turn-complete' | 'turn-interrupted' | 'step-open' | 'step-close'
  readonly ref: EventRef
  readonly turnId?: string
  readonly stepId?: string
  readonly agentId?: string
}
export interface CausalReference { readonly kind: 'tool-result-of'; readonly call: EventRef }
export interface Cancellation { readonly cancelled: boolean }
export interface HarnessAdapter {
  readonly adapterId: string
  readonly adapterVersion: string
  getCapabilities(): Promise<Offer>
  observeSession(session: RuntimeSessionRef, scope: WorkspaceScope, cancel: Cancellation): AsyncIterable<NormalizedRuntimeEvent>
  resolveCausality(event: NormalizedRuntimeEvent, scope: WorkspaceScope, cancel: Cancellation): Promise<CausalReference | null>
}

export type TaskId = string
export interface TaskRecord { readonly taskId: TaskId; readonly workspaceId: string; readonly status: 'open' | 'closed' }
export type Cursor = string
export interface Checkpoint {
  readonly session: RuntimeSessionRef
  readonly sourceRevision: string
  readonly throughExclusive: number
  readonly projectionVersion: string
}
export interface BindingRecord { readonly taskId: TaskId; readonly revision: number; readonly effectiveAfter: EventRef }
export type Attribution = { readonly kind: 'bound'; readonly binding: BindingRecord; readonly method: 'forward' | 'original-call' }
  | { readonly kind: 'unresolved'; readonly reason: string }
export interface HistoryRow { readonly ref: EventRef; readonly attribution: Attribution }
export interface TaskQuery { readonly limit: number; readonly cursor?: Cursor }
export interface TaskPage { readonly tasks: readonly TaskRecord[]; readonly next?: Cursor }
export interface TaskHistoryQuery extends TaskQuery { readonly selector: { readonly taskId: TaskId } | { readonly kind: 'unresolved' } }
export interface TaskHistoryPage {
  readonly rows: readonly HistoryRow[]
  readonly checkpoints: readonly Checkpoint[]
  readonly complete: boolean
  readonly next?: Cursor
}
export interface StorageAdapter {
  readonly adapterId: string
  readonly adapterVersion: string
  getCapabilities(): Promise<Offer>
  getTask(taskId: TaskId, scope: WorkspaceScope, cancel: Cancellation): Promise<TaskRecord | null>
  listTasks(query: TaskQuery, scope: WorkspaceScope, cancel: Cancellation): Promise<TaskPage>
  queryTaskHistory(query: TaskHistoryQuery, scope: WorkspaceScope, cancel: Cancellation): Promise<TaskHistoryPage>
}

/** A normalized explicit binding fact, never created by a model proposal. */
export interface ExplicitBinding {
  readonly kind: 'bind'
  readonly ref: EventRef
  readonly taskId: TaskId
  readonly turnId?: string
}
export type ProjectionInput = NormalizedRuntimeEvent | ExplicitBinding
export type AttributionAction = 'continue_current' | 'switch_existing' | 'create_new' | 'uncertain' | 'no_task'
export interface AttributionProposal {
  readonly action: AttributionAction
  readonly candidateTaskId?: TaskId
  readonly reasonCode: string
  readonly evidenceRefs: readonly EventRef[]
  readonly policyVersion: string
}
export interface ProposalGuardInput {
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly scope: WorkspaceScope
  readonly candidates: readonly TaskRecord[]
  readonly currentTaskId: TaskId | null
  readonly evidenceRefs: readonly EventRef[]
  readonly policyVersion: string
}
export interface AttributionEngine {
  decide(input: Pick<ProposalGuardInput, 'currentTaskId' | 'candidates' | 'evidenceRefs'>): Promise<unknown>
}
