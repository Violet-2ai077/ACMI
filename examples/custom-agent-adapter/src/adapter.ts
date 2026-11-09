import type { AdapterCapabilities, HarnessAdapter, RuntimeSessionRef, ScopeAuthority } from '@acmi/contracts'
import { capabilityOffer, parseNormalizedEvent, parseRuntimeSessionRef } from '@acmi/sdk'

export const capabilities: AdapterCapabilities = {
  schemaVersion: 1, adapterId: 'custom-message-agent', adapterVersion: '0.1.0', runtimeVersion: 'synthetic-v1',
  sessionEvents: false, messageEvents: true, toolCallEvents: false, causalToolResults: false,
  subagentEvents: false, persistentHistory: false, contextInjection: false, taskBindingHooks: false,
  eventReplay: true, stableSessionIdentity: true,
}

export interface SourceSnapshot {
  readonly session: RuntimeSessionRef
  readonly revision: string
  readonly envelopes: readonly unknown[]
}

/** Replace only this trusted host-side source reader when adapting a real runtime. */
export interface MessageSource {
  readonly read: (session: RuntimeSessionRef) => Promise<SourceSnapshot | null>
}

export function createMessageAdapter(source: MessageSource, authority: Pick<ScopeAuthority, 'permits'>, workspaceId: string): HarnessAdapter {
  return {
    adapterId: capabilities.adapterId,
    adapterVersion: capabilities.adapterVersion,
    getCapabilities: async () => capabilityOffer(capabilities),
    async *observeSession(requested, scope, cancellation) {
      if (cancellation.cancelled || !authority.permits(scope, workspaceId)) return
      const session = parseRuntimeSessionRef(requested)
      if (session === null || session.adapterId !== capabilities.adapterId) return
      const snapshot = await source.read(session)
      if (snapshot === null || JSON.stringify(parseRuntimeSessionRef(snapshot.session)) !== JSON.stringify(session)) return
      let previous = -1
      for (const value of snapshot.envelopes) {
        if (cancellation.cancelled || !authority.permits(scope, workspaceId)) return
        if (typeof value !== 'object' || value === null || !('state' in value) || value.state !== 'committed'
          || !('kind' in value) || !('offset' in value)) continue
        const kind = value.kind === 'request' ? 'user' : value.kind === 'reply' ? 'assistant' : null
        if (kind === null) continue
        const event = parseNormalizedEvent({ kind, ref: { session, sourceRevision: snapshot.revision, localSeq: value.offset } })
        if (event === null || event.ref.localSeq <= previous) throw new Error('Invalid committed message metadata')
        previous = event.ref.localSeq
        yield event
      }
    },
    resolveCausality: async () => null,
  }
}
