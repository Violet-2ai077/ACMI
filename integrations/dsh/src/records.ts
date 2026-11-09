/** Experimental Session records and the host-only binding projection. */

import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { pluginRecordOf, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

/** Stable registry identity, independent of Session and title. */
export type TaskId = Branded<'AcmiTaskId'>

/** Validate a task UUID at a durable or tool boundary. */
export const taskIdSchema = z.uuidv4().transform(value => brandString<TaskId>(value.toLowerCase()))

const creationRecord = z.strictObject({ sessionId: z.string().min(1), taskId: taskIdSchema })
const bindingRecord = creationRecord.extend({ revision: z.number().int().positive() })

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** A registry task acquired a creation record in its originating Session. */
    'plugin:acmi-probe/task-created': z.infer<typeof creationRecord>
    /** An explicit binding applies after this record, never to earlier events. */
    'plugin:acmi-probe/task-binding': z.infer<typeof bindingRecord>
  }
}

/** Shared shape for the current binding and historical range starts. */
export const bindingState = z.strictObject({
  taskId: taskIdSchema,
  revision: z.number().int().positive(),
  effectiveFromSeq: z.number().int().nonnegative().transform(value => SessionSeq(value)),
})

/**
 * Interpret a binding record owned by this Session, rejecting a broken revision chain.
 * @param event - next committed log event.
 * @param sessionId - Session whose own bindings are accepted.
 * @param previousRevision - revision before the event, or zero before the first binding.
 * @returns the next forward binding, or undefined for an unrelated event.
 */
export function nextBinding(event: SessionEvent, sessionId: string, previousRevision: number): z.infer<typeof bindingState> | undefined {
  const record = pluginRecordOf(event)
  if (record?.type !== 'plugin:acmi-probe/task-binding') return undefined
  const data = bindingRecord.parse(record.data)
  if (data.sessionId !== sessionId) return undefined
  if (data.revision !== previousRevision + 1) throw new Error('Invalid ACMI binding revision')
  return { taskId: data.taskId, revision: data.revision, effectiveFromSeq: SessionSeq(event.seq + 1) }
}

const stateSchema = z.strictObject({
  sessionId: z.string().min(1),
  created: z.array(taskIdSchema),
  binding: bindingState.nullable(),
})

/** Current binding and one receipt per task created in this Session. */
export type AcmiSessionState = z.infer<typeof stateSchema>

/** Rebuild explicit binding and creation receipts without replaying any writes. */
export const acmiProjection = {
  key: 'acmiTaskBinding',
  stateVersion: 1,
  stateSchema,
  init: header => ({ sessionId: header.id, created: [], binding: null }),
  apply(state, event) {
    const record = pluginRecordOf(event)
    if (record?.type === 'plugin:acmi-probe/task-created') {
      const data = creationRecord.parse(record.data)
      if (data.sessionId !== state.sessionId || state.created.includes(data.taskId)) return state
      return { ...state, created: [...state.created, data.taskId] }
    }
    if (record?.type !== 'plugin:acmi-probe/task-binding') return state
    const binding = nextBinding(event, state.sessionId, state.binding?.revision ?? 0)
    return binding === undefined ? state : { ...state, binding }
  },
} satisfies ProjectionDefinition<'acmiTaskBinding', AcmiSessionState>
