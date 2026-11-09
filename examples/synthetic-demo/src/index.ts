import type { EventRef, NormalizedRuntimeEvent, ProjectionInput, RuntimeSessionRef, TaskRecord, ToolCall, ToolResult } from '@acmi/contracts'
import { createScopeAuthority, project, resolveToolResult, taskHistory } from '@acmi/core'
import type { ObserverEntry } from '@acmi/observer'
import { renderObserver } from '@acmi/observer'

const workspaceId = 'synthetic-workspace'
const taskA: TaskRecord = { taskId: '10000000-0000-4000-8000-000000000001', workspaceId, status: 'open' }
const taskB: TaskRecord = { ...taskA, taskId: '10000000-0000-4000-8000-000000000002' }
const sessionOne: RuntimeSessionRef = { adapterId: 'synthetic', instanceId: 'demo', sessionId: 'Session 1', incarnation: 'demo-1' }
const sessionTwo: RuntimeSessionRef = { ...sessionOne, sessionId: 'Session 2', incarnation: 'demo-2' }
const ref = (session: RuntimeSessionRef, localSeq: number): EventRef => ({ session, sourceRevision: 'fixture-v1', localSeq })
const call: ToolCall = { kind: 'tool-call', ref: ref(sessionOne, 3), turnId: 'turn-1', stepId: 'step-1', toolCallId: 'call-1' }
const result: ToolResult = { ...call, kind: 'tool-result', ref: ref(sessionOne, 5), originalCall: call.ref }

const inputs: readonly ProjectionInput[] = [
  { kind: 'bind', ref: ref(sessionOne, 1), taskId: taskA.taskId },
  { kind: 'user', ref: ref(sessionOne, 2) },
  call,
  { kind: 'bind', ref: ref(sessionOne, 4), taskId: taskB.taskId },
  result,
  { kind: 'assistant', ref: ref(sessionOne, 6) },
  { ...result, ref: ref(sessionOne, 7), originalCall: null },
  { kind: 'bind', ref: ref(sessionTwo, 1), taskId: taskA.taskId },
  { kind: 'user', ref: ref(sessionTwo, 2) },
  { kind: 'assistant', ref: ref(sessionTwo, 3) },
]

const rows = project(inputs, [taskA, taskB])
const key = (event: EventRef) => `${event.session.incarnation}/${event.localSeq}`
const metadata = new Map(inputs.filter((input): input is NormalizedRuntimeEvent => input.kind !== 'bind')
  .map(input => [key(input.ref), input]))
const timeline: readonly ObserverEntry[] = rows.map(row => {
  const event = metadata.get(key(row.ref))
  if (event === undefined) throw new Error('Unexpected synthetic row')
  const cause = event.kind === 'tool-result' ? resolveToolResult(event, call) : null
  return { row, kind: event.kind, ...(cause === null ? {} : { cause }) }
})

if (process.argv[2] === '--html') {
  const authority = createScopeAuthority()
  const scope = authority.grant(workspaceId)
  process.stdout.write(await renderObserver({ authority, scope, workspaceId, readTimeline: async () => timeline }))
} else if (process.argv.length === 2) {
  process.stdout.write([
    'ACMI synthetic demo (no dsh, no credentials, no network)',
    `Task A created: ${taskA.taskId}`,
    `Task B created: ${taskB.taskId}`,
    'Session 1 contains Task A (explicit binding #1)',
    'Session 1 switches to Task B (explicit binding #4)',
    'Session 2 resumes Task A (explicit binding #1 in Session 2)',
    '',
    'Observer timeline (read-only)',
    ...timeline.map(({ row, kind, cause }) => {
      const { ref: eventRef, attribution } = row
      const task = attribution.kind === 'bound'
        ? `${attribution.binding.taskId === taskA.taskId ? 'Task A' : 'Task B'} / binding revision ${attribution.binding.revision} / ${attribution.method}`
        : `unresolved (${attribution.reason})`
      const causal = cause === undefined ? '' : ` / tool-result-of #${cause.call.localSeq}`
      return `  ${eventRef.session.sessionId} #${eventRef.localSeq} ${kind} -> ${task}${causal} [${eventRef.sourceRevision}]`
    }),
    '',
    'Cross-Session Task History: Task A',
    ...taskHistory(rows, taskA.taskId).map(row => `  ${row.ref.session.sessionId} #${row.ref.localSeq} (${row.ref.sourceRevision})`),
    '',
  ].join('\n'))
} else {
  process.stderr.write('Usage: node examples/synthetic-demo/dist/index.js [--html]\n')
  process.exitCode = 2
}
