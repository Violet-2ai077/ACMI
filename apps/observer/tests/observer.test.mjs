import { expect, it } from 'vitest'
import { createScopeAuthority } from '../../../packages/core/dist/index.js'
import { renderObserver } from '../dist/index.js'

const session = { adapterId: 'synthetic', instanceId: 'run', sessionId: '<script>alert(1)</script>', incarnation: 'inc' }
const ref = { session, sourceRevision: 'cut', localSeq: 2 }
const taskId = '10000000-0000-4000-8000-000000000001'
const timeline = [
  { kind: 'user', row: { ref, attribution: { kind: 'bound', binding: { taskId, revision: 1, effectiveAfter: { ...ref, localSeq: 1 } }, method: 'forward' }, raw: 'SENSITIVE-PAYLOAD' } },
  { row: { ref: { ...ref, localSeq: 3 }, attribution: { kind: 'unresolved', reason: 'no-binding' } } },
]

it('renders a scoped, escaped, payload-free timeline with no write controls', async () => {
  const authority = createScopeAuthority()
  const scope = authority.grant('workspace')
  const html = await renderObserver({ authority, scope, workspaceId: 'workspace', readTimeline: async () => timeline })
  for (const label of ['Read-only', taskId, 'Session-local binding revision', 'Unresolved', 'Source revision', '&lt;script&gt;']) {
    expect(html).toContain(label)
  }
  expect(html).not.toMatch(/<script|<form|<button|SENSITIVE-PAYLOAD/)
})

it('denies foreign, forged and revoked scope without calling the timeline service', async () => {
  const authority = createScopeAuthority()
  const revoked = authority.grant('workspace')
  authority.revoke(revoked)
  for (const scope of [authority.grant('another'), {}, revoked]) {
    let reads = 0
    const request = { authority, scope, workspaceId: 'workspace', readTimeline: async () => { reads++; return timeline } }
    await expect(renderObserver(request)).rejects.toThrow('not authorized')
    expect(reads).toBe(0)
  }
})

it('fails closed if a grant is revoked during the authorized query', async () => {
  const authority = createScopeAuthority()
  const scope = authority.grant('workspace')
  await expect(renderObserver({ authority, scope, workspaceId: 'workspace', async readTimeline() {
    authority.revoke(scope)
    return timeline
  } })).rejects.toThrow('not authorized')
})
