import { describe, expect, it } from 'vitest'
import { capabilityOffer, parseAdapterCapabilities, parseNormalizedEvent } from '../dist/index.js'

const caps = {
  schemaVersion: 1, adapterId: 'sample', adapterVersion: '1', runtimeVersion: '2',
  sessionEvents: true, messageEvents: true, toolCallEvents: false, causalToolResults: false,
  subagentEvents: false, persistentHistory: false, contextInjection: false, taskBindingHooks: false,
  eventReplay: true, stableSessionIdentity: true,
}
const ref = {
  session: { adapterId: 'sample', instanceId: 'instance', sessionId: 'session', incarnation: 'incarnation' },
  sourceRevision: 'cut', localSeq: 1,
}

describe('adapter SDK', () => {
  it('validates a versioned partial profile and offers only its implemented wire capability', () => {
    expect(parseAdapterCapabilities(caps)).toEqual(caps)
    expect(capabilityOffer(caps)).toEqual({ major: 0, minor: 1, offered: ['observe-session'], required: [] })
    expect(parseAdapterCapabilities({ ...caps, schemaVersion: 2 })).toBeNull()
    expect(parseAdapterCapabilities({ ...caps, causalToolResults: true })).toBeNull()
    expect(parseAdapterCapabilities({ ...caps, taskBindingHooks: true })).toBeNull()
    expect(parseAdapterCapabilities({ ...caps, messageEvents: 'yes' })).toBeNull()
  })

  it('accepts only bounded normalized metadata and preserves explicit absence of causality', () => {
    const event = { kind: 'tool-result', ref, turnId: 'turn', stepId: 'step', toolCallId: 'tool', originalCall: null }
    expect(parseNormalizedEvent(event)).toEqual(event)
    expect(parseNormalizedEvent({ ...event, rawPayload: 'private' })).toBeNull()
    expect(parseNormalizedEvent({ kind: 'assistant', ref, text: 'private' })).toBeNull()
    expect(parseNormalizedEvent({ kind: 'user', ref: { ...ref, localSeq: -1 } })).toBeNull()
    expect(parseNormalizedEvent({ kind: 'delta', ref })).toBeNull()
    expect(parseNormalizedEvent({ ...event, originalCall: undefined })).toBeNull()
  })
})
