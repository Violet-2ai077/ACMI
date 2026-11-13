import { randomUUID } from 'node:crypto'
import { createScopeAuthority } from '@acmi/core'
import { DSH_VERSION, openContinuationHost } from '@acmi/dsh-integration'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'

export function openConsoleHost(roots) {
  return openContinuationHost({ roots, runtimeVersion: DSH_VERSION, synthetic: true, openRuntime,
    authorize(workspaceId) {
      const read = createScopeAuthority(), write = createScopeAuthority(), operatorAuthority = createScopeAuthority()
      return { read, write, operatorAuthority, reader: read.grant(workspaceId), writer: write.grant(workspaceId),
        operator: operatorAuthority.grant(workspaceId) }
    },
  })
}

async function openRuntime(roots) {
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Jsonl, { root: roots.journalRoot, compression: roots.compression })
    await mountAgentLoopTestHarness(ctx)
    if (ctx.llm.listProviders().length !== 0) throw new Error('Unexpected Provider in scripted runtime')
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
  const agents = new Map()
  let sampling = false
  function owned(session) {
    const entry = agents.get(session)
    if (!entry) throw new Error('Unknown console Session')
    return entry
  }
  return {
    ctx,
    async createSession(signal) {
      signal.throwIfAborted()
      const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: roots.workspaceRoot }, signal })
      agents.set(handle.agent.session, { handle, turn: 0 })
      return handle.agent.session
    },
    isIdle: session => !sampling && agents.get(session)?.handle.agent.status === 'idle',
    async runSample(session, signal) {
      signal.throwIfAborted()
      const entry = owned(session)
      sampling = true
      try {
        // Only this fixed synthetic path appends; no Agent loop, model request, or tool runs.
        const turn = ++entry.turn
        session.append('turn/start', { turn })
        session.append('user/message', createUserMessage({ source: { kind: 'user' },
          content: [{ type: 'text', text: 'Fixed synthetic continuation sample' }] }), { surfaceOp: 'append' })
        session.append('turn/end', { turn, reason: { kind: 'completed' } })
      } finally { sampling = false }
    },
    async closeSession(session, signal) {
      signal.throwIfAborted()
      await owned(session).handle.dispose()
      agents.delete(session)
    },
    async dispose() {
      await ctx.fiber.dispose()
      agents.clear()
    },
  }
}
