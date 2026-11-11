import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { adviseTaskReference, createScopeAuthority } from '../src/index.ts'

const authority = createScopeAuthority()
const scope = authority.grant('w')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const cut = { workspaceId: 'w', sessionId: 'session', incarnation: 'inc', cursor: 10,
  authorizationEpoch: 4, bindingRevision: 2, graphRevision: 3, sourceRevision: 2, candidateRevision: 1, policyVersion: 'v1' }
const row = (taskId, objective, extras = {}) => ({ taskId, objective, workspaceId: 'w', status: 'open',
  catalogRevision: 1, revision: 1, reason: 'lexical', lastActivity: 1, ...extras })
const candidates = [row('a', 'Ferry timetable'), row('b', 'Pier lighting', { aliases: ['west lamps'] }),
  row('c', 'Gate keys', { status: 'closed' })]
const context = (text, extra = {}) => ({ cut, current: { id: 'turn10', text, actor: 'user', kind: 'message' },
  candidates, binding: { taskId: 'a' }, ...extra })
const host = { authority, scope, sha256, permitsTask: () => true, readCurrentCut: () => cut }
const call = (text, { input = {}, ctx = {}, access = {} } = {}) =>
  adviseTaskReference({ enabled: true, catalogComplete: true, context: context(text, ctx), ...input }, { ...host, ...access })
const prior = { kind: 'explicit_user_selection', cut: { ...cut, cursor: 9 }, eventId: 'choice9', taskId: 'b', taskRevision: 1 }

describe('read-only task reference advice', () => {
  it('defaults off before reading host state', () => {
    expect(adviseTaskReference({ context: context('Switch to Pier lighting.') }, {
      ...host, readCurrentCut: () => { throw new Error('must not read') },
    })).toEqual({ status: 'disabled' })
  })

  it('uses a unique explicit alias, not rank or the current binding, and returns only inert advice', () => {
    const value = call('Switch to west lamps.', { ctx: { candidates: [...candidates].reverse() } })
    expect(value).toMatchObject({ status: 'suggest_active', taskId: 'b', basis: 'explicit_name',
      source: { turnId: 'turn10', span: { start: 10, end: 20 } }, packetDigest: expect.stringMatching(/^[a-f0-9]{64}$/u) })
    expect(Object.isFrozen(value)).toBe(true)
    expect(value).not.toHaveProperty('operation')
    expect(call('切到 Pier lighting。')).toMatchObject({ status: 'suggest_active', taskId: 'b' })
  })

  it('does not pick the first same-name row, and does not assume a truncated catalog is unique', () => {
    const collision = [...candidates, row('twin', 'Pier lighting')]
    expect(call('Switch to Pier lighting.', { ctx: { candidates: collision } }))
      .toEqual({ status: 'clarify', reason: 'ambiguous_reference' })
    expect(call('Switch to Pier lighting.', { input: { catalogComplete: false } }))
      .toEqual({ status: 'clarify', reason: 'incomplete_catalog' })
    const overflow = [...candidates, ...Array.from({ length: 8 }, (_, i) => row('x' + i, 'Other ' + i))]
    expect(call('Switch to Pier lighting.', { ctx: { candidates: overflow } }))
      .toEqual({ status: 'clarify', reason: 'incomplete_catalog' })
    expect(call('Switch to task:b.', { input: { catalogComplete: false } }))
      .toMatchObject({ status: 'suggest_active', taskId: 'b', basis: 'explicit_id' })
  })

  it('never exposes an unauthorized, foreign, stale or out-of-packet ID', () => {
    const variants = [
      { access: { permitsTask: (_, id) => id !== 'b' } },
      { ctx: { candidates: [candidates[0], { ...candidates[1], workspaceId: 'elsewhere' }] } },
      { ctx: { candidates: [candidates[0], { ...candidates[1], catalogRevision: 0 }] } },
      { ctx: { candidates: [candidates[0]] } },
    ]
    for (const variant of variants) expect(call('Switch to task:b.', variant))
      .toEqual({ status: 'clarify', reason: 'reference_unresolved' })
  })

  it('makes a historical reference only on a read-only request', () => {
    expect(call('Look up Gate keys.')).toMatchObject({ status: 'reference_history', taskId: 'c' })
    expect(call('Switch to Gate keys.')).toEqual({ status: 'clarify', reason: 'historical_not_actionable' })
    expect(call('Look up Pier lighting.')).toEqual({ status: 'no_suggestion' })
  })

  it('does not infer a task from quoted, conditional, compound, or tool-origin content', () => {
    for (const text of ['"Switch to Pier lighting."', 'If it rains, switch to Pier lighting.',
      'Switch to Pier lighting; and close Gate keys.', 'Switch to Pier lighting?']) {
      expect(call(text)).toEqual({ status: 'no_suggestion' })
    }
    expect(call('Switch to Pier lighting.', { ctx: { current: {
      id: 'tool1', text: 'Switch to Pier lighting.', actor: 'tool', kind: 'causal',
    } } })).toEqual({ status: 'no_suggestion' })
    expect(call('Go back to the previous task.')).toEqual({ status: 'clarify', reason: 'reference_unresolved' })
  })

  it('uses only an explicit, immediately preceding, scoped and current Host selection', () => {
    const text = 'Go back to the one I just confirmed.'
    expect(call(text, { input: { prior } })).toMatchObject({
      status: 'suggest_active', taskId: 'b', basis: 'confirmed_predecessor', priorEventId: 'choice9',
    })
    for (const bad of [undefined, { ...prior, kind: 'hypothesis' }, { ...prior, taskRevision: 0 },
      { ...prior, cut: { ...prior.cut, cursor: 8 } }, { ...prior, cut: { ...prior.cut, sessionId: 'other' } },
      { ...prior, cut: { ...prior.cut, authorizationEpoch: 3 } }]) {
      expect(call(text, { input: { prior: bad } })).toEqual({ status: 'clarify', reason: 'reference_unresolved' })
    }
    expect(call(text, { input: { prior }, access: { permitsTask: (_, id) => id !== 'b' } }))
      .toEqual({ status: 'clarify', reason: 'reference_unresolved' })
  })

  it('binds the receipt to the authenticated confirmation as well as the shared packet', () => {
    const text = 'Go back to the one I just confirmed.'
    const first = call(text, { input: { prior } })
    const second = call(text, { input: { prior: { ...prior, eventId: 'another-choice9', taskId: 'a' } } })
    expect(first.packetDigest).toBe(second.packetDigest)
    expect(first.predecessorDigest).toMatch(/^[a-f0-9]{64}$/u)
    expect(first.predecessorDigest).not.toBe(second.predecessorDigest)
    expect(call(text, { input: { prior: { ...prior, eventId: undefined } } }))
      .toEqual({ status: 'clarify', reason: 'reference_unresolved' })
  })

  it('fails closed on cut drift, scope revocation, oversized current text and callback errors', () => {
    let reads = 0
    expect(call('Switch to Pier lighting.', { access: {
      readCurrentCut: () => ++reads === 1 ? cut : { ...cut, authorizationEpoch: 5 },
    } })).toEqual({ status: 'unavailable', reason: 'snapshot_unavailable' })
    const ephemeral = createScopeAuthority()
    const revoked = ephemeral.grant('w')
    ephemeral.revoke(revoked)
    expect(call('Switch to Pier lighting.', { access: { authority: ephemeral, scope: revoked } }))
      .toEqual({ status: 'unavailable', reason: 'snapshot_unavailable' })
    expect(call('切到 ' + '长'.repeat(3500))).toEqual({ status: 'unavailable', reason: 'snapshot_unavailable' })
    expect(call('Switch to Pier lighting.', { access: { readCurrentCut: () => { throw new Error('unavailable') } } }))
      .toEqual({ status: 'unavailable', reason: 'snapshot_unavailable' })
    let permits = true, snapshots = 0
    expect(call('Switch to Pier lighting.', { access: {
      permitsTask: (_, id) => permits || id !== 'b',
      readCurrentCut: () => { if (++snapshots === 2) permits = false; return cut },
    } })).toEqual({ status: 'unavailable', reason: 'snapshot_unavailable' })
  })
})
