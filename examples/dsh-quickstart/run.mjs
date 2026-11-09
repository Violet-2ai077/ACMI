import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Acmi from '@acmi/dsh-integration'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'

const args = new Set(process.argv.slice(2))
if ([...args].some(arg => arg !== '--serve' && arg !== '--zstd')) throw new Error('Usage: node run.mjs [--serve] [--zstd]')
const compression = args.has('--zstd') ? 'zstd' : 'none'
const root = await realpath(await mkdtemp(join(tmpdir(), 'acmi-dsh-quickstart-')))
const workspaceRoot = join(root, 'workspace')
const journalRoot = join(root, 'journals')
const ctx = new Context()
let owner
try {
  await mkdir(workspaceRoot)
  await mkdir(journalRoot)
  await Acmi.createStorageIsolationMarker(journalRoot, workspaceRoot, compression)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, 'registry') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(Jsonl, { root: journalRoot, compression })
  const harness = await mountAgentLoopTestHarness(ctx)
  owner = ctx.plugin(Acmi, { workspaceRoot, journalRoot, compression })
  await owner
  async function fresh(id) {
    const agent = await harness.create(SessionId(id), {}, { cwd: workspaceRoot })
    if (!await ctx.sessions.flush(agent.session)) throw new Error('Could not materialize the synthetic Session')
    return agent
  }
  async function call(agent, name, arguments_) {
    const result = await executeToolFixture(ctx, {
      name, arguments: arguments_, callId: ToolCallId(name), agent, signal: AbortSignal.timeout(10_000),
    })
    if (result.isError) throw new Error(`Synthetic tool failed: ${name}`)
    return result.value
  }
  const first = await fresh('quickstart-one')
  const created = await call(first, 'acmi_task_create', { title: 'Synthetic continuity task' })
  const id = created.task_id
  const beforeBind = await call(first, 'acmi_task_list', {})
  if (beforeBind.binding !== null) throw new Error('Task creation unexpectedly bound the Session')
  const request = { taskId: id, limit: 20 }
  const bind = agent => call(agent, 'acmi_task_bind', { task_id: id })
  const work = async agent => {
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({
      source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic work; not exported.' }],
    }), { surfaceOp: 'append' })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    if (!await ctx.sessions.flush(agent.session)) throw new Error('Could not commit the synthetic turn')
  }
  const firstBinding = await bind(first)
  await work(first)
  const second = await fresh('quickstart-two')
  const history = ctx.acmiHistory
  const continuity = await history.query(second.session, request)
  const secondBinding = await bind(second)
  await work(second)
  const final = await history.query(second.session, request)
  if (continuity.rows.length !== 1 || final.rows.length !== 2 || final.rows[0].ref.session.sessionId === final.rows[1].ref.session.sessionId
    || firstBinding.binding_revision !== 1 || secondBinding.binding_revision !== 1) {
    throw new Error('Unexpected cross-Session continuity')
  }
  console.log(JSON.stringify({
    runtime: Acmi.DSH_VERSION, compression, taskId: id, initialBinding: beforeBind.binding,
    sessionLocalRevisions: [firstBinding.binding_revision, secondBinding.binding_revision],
    previousSessionEvents: continuity.rows.length, totalEvents: final.rows.length,
    observer: 'read-only',
  }, null, 2))
  if (args.has('--serve')) {
    const page = await history.render(second.session, request)
    const endpoint = '/observer/' + randomBytes(24).toString('hex')
    const server = createServer((request, response) => {
      const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }
      if (request.method !== 'GET' || request.url !== endpoint) {
        response.writeHead(404, headers).end()
        return
      }
      response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' }).end(page)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    console.log(`Observer: http://127.0.0.1:${server.address().port}${endpoint} (Ctrl+C to stop)`)
    const close = () => { server.close(); server.closeAllConnections() }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    if (process.connected) process.once('disconnect', close)
    try {
      await once(server, 'close')
    } finally {
      process.off('SIGINT', close)
      process.off('SIGTERM', close)
      process.off('disconnect', close)
    }
  }
} finally {
  try {
    await owner?.dispose()
    await ctx.fiber.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
