import assert from 'node:assert/strict'

const scopeKeys = ['workspace', 'principalId', 'sessionId', 'requestId']
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,127}$/iu.test(value)
const time = value => Number.isSafeInteger(value) && value >= 0
const scopeValid = s => s && scopeKeys.every(key => id(s[key]))
const sameScope = (a, b) => scopeValid(b) && scopeKeys.every(key => a[key] === b[key])
const copyScope = s => Object.freeze(Object.fromEntries(scopeKeys.map(key => [key, s[key]])))
export const sameAssignment = (a, b) => Boolean(a && b && id(a.taskId) && a.taskId === b.taskId && a.workId === b.workId)
const targetValid = t => t && id(t.taskId) && (t.workId === null || id(t.workId))
const live = v => v && time(v.taskRevision) && time(v.authorizationRevision)
const verdict = status => Object.freeze({ status })

// Synthetic Host boundary; no model value may enter capture or grantLookup.
export class WorkAnchorRegistry {
  #events = new Map()
  #requests = new Map()
  #nativeUsers = new Map()
  #receipts = new WeakSet()
  #grants = new WeakMap()
  #authorize
  #ttl

  constructor(authorize, ttl = 120) {
    assert(typeof authorize === 'function' && time(ttl) && ttl > 0, 'ANCHOR_CONFIGURATION')
    this.#authorize = authorize
    this.#ttl = ttl
  }

  capture({ eventId, kind, scope, target, at }) {
    assert(id(eventId) && kind === 'continue' && scopeValid(scope) && targetValid(target)
      && time(at) && time(at + this.#ttl), 'INVALID_TRUSTED_EVENT')
    const old = this.#events.get(eventId)
    if (old) {
      if (!sameScope(old.scope, scope) || !sameAssignment(old.target, target) || old.at !== at) throw new Error('EVENT_REPLAY_CONFLICT')
      return old
    }
    const request = JSON.stringify([scope.workspace, scope.principalId, scope.requestId])
    if (this.#requests.has(request)) throw new Error('REQUEST_ALREADY_ANCHORED')
    const checkedScope = copyScope(scope), assignment = Object.freeze({ taskId: target.taskId, workId: target.workId })
    const auth = this.#authorize(checkedScope, assignment)
    if (!live(auth)) throw new Error('TARGET_NOT_AUTHORIZED')
    const record = Object.freeze({ eventId, kind, scope: checkedScope, target: assignment, at, expiresAt: at + this.#ttl,
      taskRevision: auth.taskRevision, authorizationRevision: auth.authorizationRevision })
    this.#requests.set(request, eventId)
    this.#events.set(eventId, record)
    return record
  }

  resolve(eventId, scope, nativeUserId, now) {
    if (eventId === null) return verdict('no_anchor')
    const event = this.#events.get(eventId)
    if (!event) return verdict('unknown_anchor')
    if (!sameScope(event.scope, scope)) return verdict('scope_mismatch')
    if (!id(nativeUserId) || !time(now)) return verdict('invalid_native_source')
    if (now < event.at) return verdict('not_yet_valid')
    if (now >= event.expiresAt) return verdict('expired')
    const current = this.#authorize(event.scope, event.target)
    if (!live(current) || current.authorizationRevision !== event.authorizationRevision) return verdict('authorization_changed')
    if (current.taskRevision !== event.taskRevision) return verdict('task_revision_changed')
    const prior = this.#nativeUsers.get(eventId)
    if (prior !== undefined && prior !== nativeUserId) return verdict('native_user_mismatch')
    this.#nativeUsers.set(eventId, nativeUserId)
    const accepted = Object.freeze({ status: 'accepted', eventId, scope: event.scope, target: event.target, nativeUserId })
    this.#receipts.add(accepted)
    return accepted
  }

  grantLookup(receipt, now) {
    assert(this.#receipts.has(receipt), 'ANCHOR_RECEIPT_REQUIRED')
    const liveReceipt = this.resolve(receipt.eventId, receipt.scope, receipt.nativeUserId, now)
    assert.equal(liveReceipt.status, 'accepted', 'ANCHOR_INVALID_FOR_GRANT')
    const grant = Object.freeze({ kind: 'lookup_only', requestId: receipt.scope.requestId })
    this.#grants.set(grant, receipt)
    return grant
  }

  lookupDecision(receipt, grant, operation, now) {
    if (!this.#receipts.has(receipt)) return 'anchor_required'
    const permission = this.#grants.get(grant)
    if (!permission || permission.eventId !== receipt.eventId || permission.nativeUserId !== receipt.nativeUserId
      || !sameScope(permission.scope, receipt.scope)) return 'grant_required'
    const current = this.resolve(receipt.eventId, receipt.scope, receipt.nativeUserId, now)
    if (current.status !== 'accepted') return current.status
    if (!['amber', 'indigo'].includes(operation?.key)) return 'operation_denied'
    return sameAssignment(current.target, operation.assignment) ? 'allow_lookup' : 'target_conflict'
  }
}
