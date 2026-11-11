import type { ScopeAuthority, UnderstandingCut, UnderstandingTaskInput, WorkspaceScope } from '@acmi/contracts'
import { buildLayeredContext, canonical, identityAdvicePrompt, identityAdviceSchema, measureUnderstandingText,
  prepareIdentityAdvice, validateIdentityAdvice, type IdentityAdvice, type IdentityAdviceModelView } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { DSH_VERSION } from './harness.ts'
import type { JsonlCompression } from './journal-format.ts'
import { continuityDigest as sha256 } from './local-digest.ts'
import { nextBinding } from './records.ts'
import { dshRuntimeIdentity } from './runtime-facts.ts'
import { openStorageIsolation } from './storage-isolation.ts'

export interface DshIdentityAdviceCatalog {
  readonly authorizationEpoch: number
  readonly graphRevision: number
  readonly candidateRevision: number
  readonly complete: boolean
  readonly candidates: readonly UnderstandingTaskInput[]
}
export interface DshIdentityPrior { readonly session: Session; readonly seq: number }
export interface DshIdentityAdviceOptions {
  readonly enabled?: boolean
  readonly synthetic?: boolean
  readonly runtimeVersion: string
  readonly workspaceRoot: string
  readonly journalRoot: string
  readonly compression: JsonlCompression
  readonly session: Session
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly scope: WorkspaceScope
  readonly readCatalog: () => DshIdentityAdviceCatalog | null
  readonly permitsTask: (scope: WorkspaceScope, id: string) => boolean
  readonly prior?: DshIdentityPrior
  readonly permitsPrior: (scope: WorkspaceScope, prior: DshIdentityPrior) => boolean
}
export interface DshIdentityAdviceRequest {
  readonly requestDigest: string
  readonly focus: string
  readonly prompt: string
  readonly model: IdentityAdviceModelView
  readonly schema: typeof identityAdviceSchema
}
export interface DshIdentityAdviceBridge {
  prepare(sessionId: string | undefined, nativeUserText: string): Promise<DshIdentityAdviceRequest | null>
  review(): Promise<IdentityAdvice | { readonly status: 'unavailable' }>
  dispose(): void
}

const maxEvents = 256
function textOf(blocks: readonly { readonly type: string; readonly text?: string }[], bytes: number): string | null {
  if (!blocks.length || blocks.length > 16 || blocks.some(x => x.type !== 'text' || typeof x.text !== 'string')) return null
  const result = blocks.map(x => x.text).join('\n')
  return result.trim() && measureUnderstandingText(result).bytes <= bytes ? result : null
}

/** One isolated native turn. The bridge has no writer and does not install a dynamic Journal context. */
export async function registerDshIdentityAdvice(ctx: Context, options: DshIdentityAdviceOptions): Promise<DshIdentityAdviceBridge | null> {
  if (options.enabled !== true || options.synthetic !== true || options.runtimeVersion !== DSH_VERSION
    || getDshRuntimeVersion() !== DSH_VERSION) return null
  const { session, scope, authority } = options
  let isolation: Awaited<ReturnType<typeof openStorageIsolation>>
  try { isolation = await openStorageIsolation(options.journalRoot, options.workspaceRoot, options.compression) } catch { return null }
  const { partitionId } = isolation
  let disposed = false
  const owned = (s: Session) => !disposed && authority.permits(scope, partitionId)
    && s.header.cwd === options.workspaceRoot && ctx.sessions.get(s.id) === s && s.seq <= maxEvents
  try { if (!owned(session)) return null } catch { return null }
  const ref = dshRuntimeIdentity(session.header, partitionId)
  const access = { authority, scope, sha256, permitsTask: options.permitsTask }
  let start: SessionEvent<'turn/start'> | undefined
  let focus: SessionEvent<'user/message'> | undefined
  let answer: SessionEvent<'assistant/message'> | undefined
  let end: SessionEvent<'turn/end'> | undefined
  let invalid = false
  let used = false
  let seal: string | undefined
  const stop = ctx.on('session/event', (sender, e) => {
    if (sender !== session || disposed) return
    if (e.type === 'turn/start') {
      if (start) invalid = true
      else start = e
    } else if (e.type === 'user/message' && e.data.source.kind === 'user') {
      if (!start || focus || e.surfaceOp !== 'append' || e.seq <= start.seq) invalid = true
      else focus = e
    } else if (e.type === 'assistant/message') {
      if (!focus || !start || answer || e.data.interrupted || e.data.turn !== start.data.turn || e.seq <= focus.seq) invalid = true
      else answer = e
    } else if (e.type === 'turn/end') {
      if (!start || !answer || end || e.data.turn !== start.data.turn || e.data.reason.kind !== 'completed' || e.seq <= answer.seq) invalid = true
      else end = e
    } else if (e.type === 'tool/call' || e.type === 'tool/result') invalid = true
  })

  function history(cut: UnderstandingCut) {
    const prior = options.prior
    if (!prior || prior.session === session || !owned(prior.session) || !options.permitsPrior(scope, prior)) return null
    const events = prior.session.snapshotEvents()
    const message = events.find(e => e.seq === prior.seq)
    if (message?.type !== 'user/message' || message.surfaceOp !== 'append' || message.data.source.kind !== 'user') return null
    const before = [...events].reverse().find(e => e.seq < message.seq && (e.type === 'turn/start' || e.type === 'turn/end'))
    const after = events.find(e => e.seq > message.seq && (e.type === 'turn/end' || e.type === 'turn/start'
      || e.type === 'user/message' && e.data.source.kind === 'user'))
    if (before?.type !== 'turn/start' || after?.type !== 'turn/end' || after.data.turn !== before.data.turn
      || after.data.reason.kind !== 'completed') return null
    const text = textOf(message.data.content, 256)
    if (!text) return null
    const id = dshRuntimeIdentity(prior.session.header, partitionId)
    const verified = buildLayeredContext({ cut: { ...cut, cursor: message.seq, sessionId: id.sessionId, incarnation: id.incarnation },
      binding: { taskId: null }, current: { id: 'dsh-user-' + message.seq, actor: 'user', kind: 'message', text } }, access)
    if (verified.status !== 'ready' || !owned(prior.session) || !options.permitsPrior(scope, prior)) return null
    return { evidence: { text, digest: verified.packet.current.digest },
      stamp: sha256(canonical([id, prior.session.seq, message.seq, after.seq, verified.packet.current.digest])) }
  }

  function capture() {
    if (invalid || !owned(session) || !focus) return null
    const text = textOf(focus.data.content, 12288)
    const view = options.readCatalog()
    if (!text || !view || view.candidates.length > 512) return null
    let binding: ReturnType<typeof nextBinding>
    for (const e of session.snapshotEvents()) binding = nextBinding(e, session.id, binding?.revision ?? 0) ?? binding
    const cut: UnderstandingCut = { workspaceId: partitionId, sessionId: ref.sessionId, incarnation: ref.incarnation,
      cursor: focus.seq, graphRevision: view.graphRevision, sourceRevision: 1, candidateRevision: view.candidateRevision,
      authorizationEpoch: view.authorizationEpoch, bindingRevision: binding?.revision ?? 0, policyVersion: 'dsh-identity-advice-v1' }
    const built = buildLayeredContext({ cut, binding: { taskId: binding?.taskId ?? null }, candidates: view.candidates,
      current: { id: 'dsh-user-' + focus.seq, actor: 'user', kind: 'message', text } }, access)
    if (built.status !== 'ready') return null
    const prior = history(cut)
    const prepared = prepareIdentityAdvice(built.packet, prior?.evidence ?? null, sha256, view.complete)
    if (!prepared) return null
    const stamp = sha256(canonical([prepared.requestDigest, prior?.stamp ?? null]))
    return { text, prepared, stamp }
  }
  return {
    async prepare(sessionId, nativeUserText) {
      if (used || disposed || sessionId !== session.id || answer || end) return null
      used = true
      try {
        await isolation.verify()
        if (answer || end) return null
        const frozen = capture()
        if (!frozen || nativeUserText !== frozen.text) return null
        seal = frozen.stamp
        return Object.freeze({ requestDigest: frozen.prepared.requestDigest, focus: frozen.text,
          prompt: identityAdvicePrompt, model: frozen.prepared.model, schema: identityAdviceSchema })
      } catch { return null }
    },
    async review() {
      if (!seal || !answer || !end || invalid || disposed) return { status: 'unavailable' }
      try {
        await isolation.verify()
        const frozen = capture()
        if (!frozen || frozen.stamp !== seal) return { status: 'unavailable' }
        const raw = textOf(answer.data.message.content, 4096)
        return validateIdentityAdvice(frozen.prepared, raw ?? '')
      } catch { return { status: 'unavailable' } }
    },
    dispose() { disposed = true; stop(); seal = undefined },
  }
}
