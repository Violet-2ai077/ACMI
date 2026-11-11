import assert from 'node:assert/strict'
import { sameAssignment, WorkAnchorRegistry } from './anchor.mjs'
import { anchorWire, hash } from './design.mjs'

export function makeAnchorCase(entry, catalog, fixture) {
  assert(catalog.workspace === fixture.request.workspace && entry.story === fixture.request.sessionId, 'INVALID_HOST_FIXTURE')
  const { launch, request } = fixture
  const links = Object.entries(catalog.links)
  assert.equal(links.length, entry.candidates.length)
  assert(entry.candidates.every(x => Object.hasOwn(catalog.links, x.ref)), 'MISSING_CATALOG_SCOPE')
  let launchAllowed = true
  const registry = new WorkAnchorRegistry((scope, target) =>
    scope.workspace === catalog.workspace && scope.principalId === request.principalId && launchAllowed
      && links.some(([, assignment]) => sameAssignment(target, assignment))
      ? { taskRevision: 7, authorizationRevision: 3 } : null)
  if (launch) {
    assert(['valid', 'wrong_session', 'revoked'].includes(launch.condition), 'UNKNOWN_LAUNCH_FIXTURE')
    registry.capture({ eventId: launch.eventId, kind: launch.kind, at: 100, target: launch.target,
      scope: launch.condition === 'wrong_session' ? { ...request, sessionId: request.sessionId + '-other' } : request })
    // Launch authority is separate from permission to read the candidate directory.
    launchAllowed = launch.condition !== 'revoked'
  }
  return (source, results = null) => {
    assert(source.sessionId === request.sessionId && typeof source.nativeUserId === 'string'
      && Number.isSafeInteger(source.sourceUserSeq), 'MISSING_NATIVE_SOURCE')
    const resolved = registry.resolve(launch?.eventId ?? null, request, source.nativeUserId, 110)
    const effective = resolved.status === 'accepted' ? resolved.target : null
    const ref = effective && entry.arm === 'B' ? links.find(([, assignment]) => sameAssignment(effective, assignment))?.[0] : null
    assert(ref !== undefined, 'ANCHOR_NOT_IN_MODEL_CATALOG')
    const packet = anchorWire(entry, results, ref)
    const wire = JSON.stringify(packet)
    assert(!wire.includes(request.workspace) && !wire.includes(request.requestId) && !wire.includes(source.nativeUserId)
      && (!launch || !wire.includes(launch.eventId)), 'PRIVATE_HOST_ID_IN_WIRE')
    const receipt = { id: entry.id, arm: entry.arm, request, source, eventId: launch?.eventId ?? null,
      launchTarget: launch?.target ?? null, status: resolved.status, effective, modelAnchorRef: ref, requestDigest: hash(wire) }
    return { packet, receipt }
  }
}
