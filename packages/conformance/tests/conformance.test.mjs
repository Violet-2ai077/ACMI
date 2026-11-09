import { describe, expect, it } from 'vitest'
import { createScopeAuthority, resolveToolResult } from '../../core/dist/index.js'
import { capabilityOffer } from '../../sdk/dist/index.js'
import { runConformance } from '../dist/index.js'

function fixture() {
  const authority = createScopeAuthority()
  const workspaceId = 'conformance-test'
  const scope = authority.grant(workspaceId)
  const foreignScope = authority.grant('another-workspace')
  const capabilities = {
    schemaVersion: 1, adapterId: 'sample', adapterVersion: '1', runtimeVersion: '2',
    sessionEvents: false, messageEvents: true, toolCallEvents: false, causalToolResults: false,
    subagentEvents: false, persistentHistory: false, contextInjection: false, taskBindingHooks: false,
    eventReplay: true, stableSessionIdentity: true,
  }
  const sessions = ['one', 'two'].map(incarnation => {
    const session = { adapterId: 'sample', instanceId: 'instance', sessionId: 'shared', incarnation }
    return { session, events: ['user', 'assistant'].map((kind, index) => ({ kind, ref: { session, sourceRevision: 'cut', localSeq: index + 1 } })) }
  })
  const adapter = {
    adapterId: capabilities.adapterId,
    adapterVersion: capabilities.adapterVersion,
    getCapabilities: async () => capabilityOffer(capabilities),
    async *observeSession(session, grant, cancel) {
      if (!authority.permits(grant, workspaceId)) return
      for (const event of sessions.find(item => item.session.incarnation === session.incarnation)?.events ?? []) {
        if (cancel.cancelled) return
        yield event
      }
    },
    resolveCausality: async () => null,
  }
  return { adapter, capabilities, sessions, scope, foreignScope }
}

describe('fixture conformance', () => {
  it('can report observation alone without claiming projection was exercised', async () => {
    const result = await runConformance({ ...fixture(), observationOnly: true })
    expect(result).toMatchObject({ level: 1, passed: true })
    expect(result.checks.some(check => check.id === 'binding-inheritance')).toBe(false)
  })

  it('awards a partial adapter attribution without tool or continuity claims', async () => {
    const result = await runConformance(fixture())
    expect(result.passed).toBe(true)
    expect(result.level).toBe(2)
  })

  it('rejects raw fields, out-of-scope observation and unsupported causality', async () => {
    const input = fixture()
    const first = input.sessions[0].events[0]
    input.adapter.observeSession = async function * () { yield { ...first, body: 'private' } }
    input.adapter.resolveCausality = async () => ({ kind: 'tool-result-of', call: first.ref })
    const result = await runConformance(input)
    expect(result.passed).toBe(false)
    expect(result.level).toBe(0)
    for (const id of ['event-normalization', 'workspace-isolation', 'unsupported-capability']) {
      expect(result.checks).toContainEqual({ id, passed: false })
    }
  })

  it('fails a tool-causality declaration with no corresponding behavior evidence', async () => {
    const input = fixture()
    input.capabilities.toolCallEvents = true
    input.capabilities.causalToolResults = true
    const result = await runConformance(input)
    expect(result.passed).toBe(false)
    expect(result.level).toBe(0)
    expect(result.checks).toContainEqual({ id: 'capability-honesty', passed: false })
    expect(result.checks).toContainEqual({ id: 'tool-causality', passed: false })
  })

  it('detects tool events that the profile denies emitting', async () => {
    const input = fixture()
    const session = input.sessions[0]
    session.events.push({
      kind: 'tool-result', ref: { ...session.events[0].ref, localSeq: 3 },
      turnId: 'turn', stepId: 'step', toolCallId: 'tool', originalCall: null,
    })
    const result = await runConformance(input)
    expect(result.checks).toContainEqual({ id: 'capability-honesty', passed: false })
  })

  it('requires proved causality and independent reopening for the higher levels', async () => {
    const input = fixture()
    input.capabilities.toolCallEvents = true
    input.capabilities.causalToolResults = true
    const first = input.sessions[0]
    const second = input.sessions[1]
    const boundary = { turnId: 'turn', stepId: 'step', toolCallId: 'reused-tool-id' }
    const call = { ...boundary, kind: 'tool-call', ref: { ...first.events[0].ref, localSeq: 3 } }
    const paired = { ...boundary, kind: 'tool-result', ref: { ...call.ref, localSeq: 4 }, originalCall: call.ref }
    const unpaired = { ...boundary, kind: 'tool-result', ref: { ...second.events[0].ref, localSeq: 4 }, originalCall: null }
    first.events.push(call, paired)
    second.events.push(unpaired)
    input.adapter.resolveCausality = async (result, scope, cancel) => result.kind === 'tool-result' && scope === input.scope && !cancel.cancelled
      ? resolveToolResult(result, call)
      : null
    expect(await runConformance(input)).toMatchObject({ level: 3, passed: true })
    input.capabilities.persistentHistory = true
    expect(await runConformance(input)).toMatchObject({ level: 0, passed: false })
    input.reopen = async () => input.adapter
    expect(await runConformance(input)).toMatchObject({ level: 0, passed: false })
    input.reopen = async () => ({ ...input.adapter })
    expect(await runConformance(input)).toMatchObject({ level: 4, passed: true })
  })
})
