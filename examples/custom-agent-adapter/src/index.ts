import type { RuntimeSessionRef } from '@acmi/contracts'
import type { SessionFixture } from '@acmi/conformance'
import { runConformance } from '@acmi/conformance'
import { createScopeAuthority } from '@acmi/core'
import { capabilities, createMessageAdapter } from './adapter.ts'

const workspaceId = 'example-workspace'
const authority = createScopeAuthority()
const scope = authority.grant(workspaceId)
const foreignScope = authority.grant('another-workspace')
const revision = 'example-cut-1'
const ref = (incarnation: string): RuntimeSessionRef => ({
  adapterId: capabilities.adapterId, instanceId: 'example-instance', sessionId: 'reused-session-id', incarnation,
})
const fixture = (session: RuntimeSessionRef): SessionFixture => ({
  session,
  events: [
    { kind: 'user', ref: { session, sourceRevision: revision, localSeq: 1 } },
    { kind: 'assistant', ref: { session, sourceRevision: revision, localSeq: 3 } },
  ],
})
const first = fixture(ref('first'))
const second = fixture(ref('second'))
const adapter = createMessageAdapter({
  async read(session) {
    const source = [first, second].find(candidate => candidate.session.adapterId === session.adapterId
      && candidate.session.instanceId === session.instanceId && candidate.session.sessionId === session.sessionId
      && candidate.session.incarnation === session.incarnation)
    return source === undefined ? null : { session: source.session, revision, envelopes: [
      { state: 'committed', kind: 'request', offset: 1, body: 'synthetic request' },
      { state: 'delta', kind: 'reply', offset: 2, body: 'synthetic partial reply' },
      { state: 'committed', kind: 'reply', offset: 3, body: 'synthetic reply' },
    ] }
  },
}, authority, workspaceId)

const report = await runConformance({ adapter, capabilities, sessions: [first, second], scope, foreignScope })
for (const check of report.checks) process.stdout.write(`${check.passed ? 'PASS' : 'FAIL'} ${check.id}\n`)
process.stdout.write(`Level ${report.level}: message-only adapter (tool causality unavailable)\n`)
if (!report.passed || report.level !== 2) process.exitCode = 1
