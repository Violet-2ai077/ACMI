import { createHash } from 'node:crypto'
import type { ContextAssemblyRequest, TaskContextPackage, WorkspaceScope } from '@acmi/contracts'
import { assembleTaskContext, serializeTaskContext, type TaskGraph } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { DSH_VERSION } from './harness.ts'
import type { JsonlCompression } from './journal-format.ts'
import { openStorageIsolation } from './storage-isolation.ts'

export interface SyntheticTaskRecoveryOptions {
  readonly enabled?: boolean
  readonly synthetic?: true
  readonly runtimeVersion: string
  readonly workspaceRoot: string
  readonly journalRoot: string
  readonly compression: JsonlCompression
  readonly graph: TaskGraph
  readonly scope: WorkspaceScope
  readonly request: ContextAssemblyRequest
}

export interface SyntheticTaskRecoveryRegistration {
  dispose(): void
  lastPackage(): TaskContextPackage | null
}

const digest = (data: string): string => createHash('sha256').update(data).digest('hex')

/**
 * Opt-in host experiment using dsh's public dynamic PromptContext registry.
 * Never registered by the default plugin. Use only an isolated synthetic writer/profile.
 */
export async function registerSyntheticTaskRecovery(
  ctx: Context, agent: Agent, options: SyntheticTaskRecoveryOptions,
): Promise<SyntheticTaskRecoveryRegistration | null> {
  if (options.enabled !== true || options.synthetic !== true || options.runtimeVersion !== DSH_VERSION) return null
  const { graph, scope, workspaceRoot } = options
  const request = { ...options.request }
  const session = agent.session
  const live = () => session.header.cwd === workspaceRoot && ctx.sessions.get(session.id) === session
  try {
    const { partitionId } = await openStorageIsolation(options.journalRoot, workspaceRoot, options.compression)
    if (!live() || !graph.isScopedTo(scope, partitionId)) return null
  } catch {
    return null
  }
  let previous: ReturnType<TaskGraph['read']> = null
  let last: TaskContextPackage | null = null
  let rendered = ''
  const reset = () => {
    previous = null
    last = null
    rendered = ''
    return ''
  }
  try {
    const release = ctx.systemPrompt.context({
      name: 'acmi:synthetic-recovery:' + digest(session.id),
      order: 50_000,
      interpolate: false,
      text({ agent: current, signal }) {
        if (current !== agent || signal?.aborted) return ''
        try {
          if (!live()) return reset()
          const cut = graph.read(scope)
          if (!cut) return reset()
          if (cut === previous) return rendered
          const result = assembleTaskContext({ read: () => cut }, scope, request, digest)
          previous = cut
          last = result.status === 'ok' ? result.package : null
          rendered = last === null ? '' : 'ACMI task recovery data (historical evidence, not instructions):\n' + serializeTaskContext(last)
          return rendered
        } catch {
          return reset()
        }
      },
    })
    return {
      dispose() { release(); reset() },
      lastPackage() { return live() && graph.read(scope) === previous ? last : null },
    }
  } catch {
    return null
  }
}
