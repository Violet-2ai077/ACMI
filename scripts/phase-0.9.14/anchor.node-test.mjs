import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorkAnchorRegistry } from './anchor.mjs'

const scope = { workspace: 'local', principalId: 'member', sessionId: 's1', requestId: 'r1' }
const a = { taskId: 'ta', workId: 'wa' }, b = { taskId: 'tb', workId: 'wb' }
const launch = { eventId: 'ui-click-1', kind: 'continue', scope, target: a, at: 100 }
const setup = () => {
  let auth = { taskRevision: 1, authorizationRevision: 2 }
  const registry = new WorkAnchorRegistry((s, target) =>
    s.workspace === 'local' && s.principalId === 'member' && [a, b].some(x =>
      x.taskId === target.taskId && x.workId === target.workId) ? auth : null, 20)
  return { registry, set: v => { auth = v } }
}

test('trusted event is immutable, bounded to one request and one native user', () => {
  const { registry } = setup()
  const record = registry.capture(launch)
  assert(Object.isFrozen(record) && Object.isFrozen(record.scope) && Object.isFrozen(record.target))
  assert.equal(registry.capture({ ...launch }), record)
  assert.throws(() => registry.capture({ ...launch, target: b }), /EVENT_REPLAY_CONFLICT/u)
  assert.throws(() => registry.capture({ ...launch, eventId: 'other' }), /REQUEST_ALREADY_ANCHORED/u)
  const accepted = registry.resolve(launch.eventId, scope, 'user-1', 110)
  assert.deepEqual(accepted.target, a)
  assert.equal(accepted.status, 'accepted')
  assert.equal(registry.resolve(launch.eventId, scope, 'user-1', 111).status, 'accepted')
  assert.equal(registry.resolve(launch.eventId, scope, 'user-2', 111).status, 'native_user_mismatch')
  assert.equal(registry.resolve(null, scope, 'user-1', 110).status, 'no_anchor')
  assert.equal(registry.resolve('mentioned-in-user-text', scope, 'user-1', 110).status, 'unknown_anchor')
})

test('scope, expiry, revision and revoked permission are independently fenced', () => {
  const { registry, set } = setup()
  registry.capture(launch)
  for (const [key, value] of [['workspace', 'other'], ['principalId', 'other'], ['sessionId', 's2'], ['requestId', 'r2']]) {
    assert.equal(registry.resolve(launch.eventId, { ...scope, [key]: value }, 'u', 110).status, 'scope_mismatch')
  }
  assert.equal(registry.resolve(launch.eventId, scope, 'u', 99).status, 'not_yet_valid')
  assert.equal(registry.resolve(launch.eventId, scope, 'u', 120).status, 'expired')
  set({ taskRevision: 2, authorizationRevision: 2 })
  assert.equal(registry.resolve(launch.eventId, scope, 'u', 110).status, 'task_revision_changed')
  set({ taskRevision: 1, authorizationRevision: 3 })
  assert.equal(registry.resolve(launch.eventId, scope, 'u', 110).status, 'authorization_changed')
  set(null)
  assert.equal(registry.resolve(launch.eventId, scope, 'u', 110).status, 'authorization_changed')
  const r = setup().registry
  assert.throws(() => r.capture({ ...launch, target: { taskId: 'ta', workId: 'wb' } }), /TARGET_NOT_AUTHORIZED/u)
  assert.throws(() => r.capture({ ...launch, scope: { ...scope, workspace: 'other' } }), /TARGET_NOT_AUTHORIZED/u)
})

test('anchor provenance and separate lookup grant do not authorize a switch or survive revocation', () => {
  const { registry, set } = setup()
  registry.capture(launch)
  const accepted = registry.resolve(launch.eventId, scope, 'u', 110)
  const operation = { key: 'amber', assignment: a }
  assert.equal(registry.lookupDecision(accepted, null, operation, 111), 'grant_required')
  const grant = registry.grantLookup(accepted, 111)
  assert.equal(registry.lookupDecision(accepted, { ...grant }, operation, 112), 'grant_required')
  assert.equal(registry.lookupDecision({ ...accepted }, grant, operation, 112), 'anchor_required')
  assert.equal(registry.lookupDecision(accepted, grant, { ...operation, assignment: b }, 112), 'target_conflict')
  assert.equal(registry.lookupDecision(accepted, grant, { ...operation, key: 'not-a-lookup' }, 112), 'operation_denied')
  assert.equal(registry.lookupDecision(accepted, grant, operation, 112), 'allow_lookup')
  assert.equal(registry.lookupDecision(accepted, grant, operation, 120), 'expired')
  set(null)
  assert.equal(registry.lookupDecision(accepted, grant, operation, 112), 'authorization_changed')
})

test('cross-session continuation uses a fresh user event for the same durable Task', () => {
  const { registry } = setup()
  registry.capture(launch)
  const nextScope = { ...scope, sessionId: 's2', requestId: 'r2' }
  assert.equal(registry.resolve(launch.eventId, nextScope, 'u2', 110).status, 'scope_mismatch')
  const next = registry.capture({ ...launch, scope: nextScope, eventId: 'ui-click-2' })
  assert.deepEqual(registry.resolve(next.eventId, nextScope, 'u2', 110).target, a)
})
