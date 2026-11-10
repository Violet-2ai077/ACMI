import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import * as acmi from '../dist/index.js'

const sha = s => createHash('sha256').update(s).digest('hex')
const task = i => '09100000-0000-4000-8000-' + i.toString(16).padStart(12, '0')
const workspaceId = 'q91-catalog'
const session = { adapterId: 'fixture', instanceId: workspaceId, sessionId: 's', incarnation: '1' }
const row = (i, title, rest = {}) => ({ taskId: task(i), workspaceId, title, objective: title, status: 'open', lastActive: i,
  revision: sha(String(i)), ...rest })
function setup() {
  const authority = acmi.createScopeAuthority(), scope = authority.grant(workspaceId)
  const denied = new Set()
  const index = new acmi.TaskCandidateIndex({ workspaceId, authority, digest: sha, permitsTask: (_, id) => !denied.has(id) })
  return { authority, scope, index, denied }
}

test('bounded retrieval ranks literal references, session recency and lexical matches without creating authority', () => {
  const f = setup()
  for (let i = 1; i <= 200; i++) f.index.upsert(f.scope, row(i, 'Backup worker ' + i))
  f.index.upsert(f.scope, row(1, 'Cold parser restart', { session, lastActive: 2 }))
  f.index.upsert(f.scope, row(2, 'Cold parser migration', { status: 'closed' }))
  f.denied.add(task(3))
  const foreign = { ...row(400, 'Cold parser restart'), workspaceId: 'other' }
  expect(() => f.index.upsert(f.scope, foreign)).toThrow()
  const result = f.index.retrieve(f.scope, { session, currentTaskId: task(4), query: 'Cold parser restart', explicitTaskIds: [task(1), task(2), task(3)], limit: 8 })
  expect(result.candidates[0]).toMatchObject({ taskId: task(1), source: 'explicit_reference', access: 'allowed', rank: 1 })
  expect(result.candidates.map(x => x.taskId)).toContain(task(4))
  expect(result.candidates.map(x => x.taskId)).not.toContain(task(2))
  expect(result.candidates.map(x => x.taskId)).not.toContain(task(3))
  expect(result.candidates.length).toBeLessThanOrEqual(8)
  expect(result.postingsVisited).toBeLessThanOrEqual(12 * 32)
  expect(f.index.retrieve(f.authority.grant('foreign'), { query: task(1) }).candidates).toEqual([])
  f.authority.revoke(f.scope)
  expect(f.index.retrieve(f.scope, { query: task(1) }).candidates).toEqual([])
})

test('new incarnation cannot receive the prior Session signal, and edits invalidate the candidate revision', () => {
  const f = setup()
  f.index.upsert(f.scope, row(1, '\u542f\u52a8\u6d41\u7a0b\u4fee\u590d', { session }))
  const a = f.index.retrieve(f.scope, { session, query: '\u542f\u52a8\u6d41\u7a0b' })
  expect(a.candidates[0]).toMatchObject({ source: 'session_recent' })
  const b = f.index.retrieve(f.scope, { session: { ...session, incarnation: '2' }, query: '\u542f\u52a8\u6d41\u7a0b' })
  expect(b.candidates[0]).toMatchObject({ source: 'lexical' })
  f.index.upsert(f.scope, row(1, '\u542f\u52a8\u6d41\u7a0b\u4fee\u590d', { session, revision: sha('changed') }))
  expect(f.index.retrieve(f.scope, { session }).revision).not.toBe(a.revision)
})
