import { expect, it } from 'vitest'
import { authorizeScope, createScopeAuthority, negotiate, project, validateProposal } from '@acmi/core'

const a = '11111111-1111-4111-8111-111111111111'
const ref = {
  session: { adapterId: 'fixture', instanceId: 'synthetic', sessionId: 'one', incarnation: '1' },
  sourceRevision: 'cut', localSeq: 1,
}

it('denies unsupported mandatory offers and admits only mutual known features', () => {
  const local = { major: 0, minor: 1, offered: ['observe-session'], required: ['observe-session'] }
  expect(negotiate(local, { major: 0, minor: 2, offered: ['observe-session', 'future'], required: [] }))
    .toEqual({ ok: true, major: 0, minor: 1, enabled: ['observe-session'] })
  expect(negotiate(local, { major: 0, minor: 2, offered: ['observe-session', 'future'], required: ['future'] }))
    .toEqual({ ok: false, code: 'missing-capability' })
  expect(negotiate(local, { ...local, offered: Array(1) }).ok).toBe(false)
})

it('does not confuse Workspace identifiers with grants or proposals with write commands', () => {
  const authority = createScopeAuthority()
  const scope = authority.grant('work')
  const candidate = { taskId: a, workspaceId: 'work', status: 'open' }
  const input = { authority, scope, candidates: [candidate], currentTaskId: null, evidenceRefs: [ref], policyVersion: 'alpha' }
  const raw = { action: 'switch_existing', candidateTaskId: a, reasonCode: 'explicit-target', evidenceRefs: [ref] }
  expect(authorizeScope(authority, { ...scope }, 'work')).toBe(false)
  expect(authorizeScope(authority, scope, 'other')).toBe(false)
  expect(validateProposal(input, raw)).toMatchObject({ action: 'switch_existing', policyVersion: 'alpha' })
  expect(validateProposal(input, { ...raw, bind: true }).action).toBe('uncertain')
  expect(validateProposal(input, { ...raw, evidenceRefs: [] }).action).toBe('uncertain')
  expect(validateProposal({ ...input, candidates: [{ ...candidate, status: 'closed' }] }, raw).action).toBe('uncertain')
  authority.revoke(scope)
  expect(validateProposal(input, raw).action).toBe('uncertain')
})

it('normalizes source coordinates without copying extra native payload fields into history', () => {
  const raw = { ...ref, privateBody: 'synthetic-payload-canary', session: { ...ref.session, privateBody: 'synthetic-payload-canary' } }
  const rows = project([{ kind: 'user', ref: raw, privateBody: 'synthetic-payload-canary' }], [])
  expect(rows[0].ref).toEqual(ref)
  expect(JSON.stringify(rows)).not.toContain('synthetic-payload-canary')
})
