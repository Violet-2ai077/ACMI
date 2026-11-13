import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from 'vitest'

const entry = fileURLToPath(new URL('../run.mjs', import.meta.url))
const pair = 'continuation-pair.json'
const dead = { code: null, signal: 'SIGKILL' }
const limit = 15_000

// Child-only probes. The console has no fault-injection flags or test IPC protocol.
const preload = `
import { writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Socket, Server } from 'node:net';
import { Socket as Datagram } from 'node:dgram';
const probe = (name, value = null) => writeSync(1, 'probe ' + JSON.stringify({ name, value }) + '\\n');
const forbid = name => () => { probe('forbidden', name); throw new Error('Offline fixture: ' + name); };
Socket.prototype.connect = forbid('connect');
Server.prototype.listen = forbid('listen');
Datagram.prototype.send = forbid('datagram');
globalThis.fetch = forbid('fetch');
const load = spec => import(pathToFileURL(createRequire(process.argv[1]).resolve(spec)).href);
const { LlmRuntime } = await load('@deepseek-ai/dsh-llm');
LlmRuntime.prototype.registerAdapter = forbid('provider registration');
LlmRuntime.prototype.stream = forbid('model stream');
const fault = process.env.FIXTURE_FAULT;
if (fault === 'registration' || fault === 'receipt') {
  const { LocalGraphStore } = await load('@acmi/dsh-integration');
  if (fault === 'registration') {
    LocalGraphStore.prototype.registerContinuationSession = async function (_, ref) {
      probe('checkpoint-before-registration', ref);
      await new Promise(resolve => process.once('message', resolve));
    };
  } else {
    const original = LocalGraphStore.prototype.taskLifecycle;
    LocalGraphStore.prototype.taskLifecycle = function (...args) {
      const lifecycle = original.apply(this, args);
      return { ...lifecycle, execute(token) {
        const receipt = lifecycle.execute(token);
        probe('commit-before-display', { session: receipt.session, operationId: receipt.operationId, taskId: receipt.taskId });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      } };
    };
  }
}
if (fault === 'shutdown') {
  const { SessionStore } = await load('@deepseek-ai/dsh-session');
  const original = SessionStore.prototype.flush;
  let armed = false;
  function arm(message) { if (message === 'arm') { armed = true; probe('armed'); } }
  process.on('message', arm);
  SessionStore.prototype.flush = async function (...args) {
    if (armed) {
      armed = false;
      process.off('message', arm);
      const held = new Promise(resolve => process.once('message', resolve));
      probe('writer-held');
      await held;
    }
    return original.apply(this, args);
  };
}
`

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acmi-console-')))
  const [workspace, journal, graph, home] = ['workspace', 'journal', 'graph', 'home'].map(dir => join(base, dir))
  const preloadPath = join(base, 'probe.mjs')
  const children = new Set()
  t.onTestFinished(async () => {
    const alive = [...children]
    for (const child of alive) child.kill('SIGKILL')
    await Promise.all(alive.map(child => child.finished))
    await rm(base, { recursive: true, force: true })
  })
  await Promise.all([workspace, journal, graph, home].map(path => mkdir(path)))
  await writeFile(preloadPath, preload)
  const args = ['--workspace', workspace, '--journal', journal, '--graph', graph]
  const env = { HOME: home, USERPROFILE: home, DSH_HOME: join(home, '.dsh'), DSH_AGENTS_HOME: join(home, '.dsh-agents') }
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(systemroot|windir|comspec|path|pathext|temp|tmp|tmpdir)$/iu.test(key)) env[key] = value
  }
  function start({ init = false, fault } = {}) {
    const child = spawn(process.execPath, ['--import', pathToFileURL(preloadPath).href, entry, ...args, ...(init ? ['--init'] : [])], {
      cwd: workspace, env: { ...env, ...(fault ? { FIXTURE_FAULT: fault } : {}) },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    })
    children.add(child)
    let out = '', err = '', cursor = 0, ended = false
    const changed = new Set()
    const notify = () => { for (const listener of changed) listener() }
    child.stdout.setEncoding('utf8').on('data', data => { out += data; notify() })
    child.stderr.setEncoding('utf8').on('data', data => { err += data })
    child.stdin.on('error', () => {})
    child.finished = once(child, 'close').then(([code, signal]) => {
      ended = true
      children.delete(child)
      notify()
      return { code, signal }
    })
    function line(label, predicate = () => true) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Missing ' + label + '\n' + out.slice(-4096) + err)), limit)
        function finish(error, value) {
          clearTimeout(timer)
          changed.delete(read)
          if (error) reject(error); else resolve(value)
        }
        function read() {
          for (let eol; (eol = out.indexOf('\n', cursor)) >= 0;) {
            const row = out.slice(cursor, eol).trimEnd()
            cursor = eol + 1
            if (!row.startsWith(label + ' ')) continue
            try {
              const value = JSON.parse(row.slice(label.length + 1))
              if (predicate(value)) return finish(null, value)
            } catch (error) { return finish(error) }
          }
          if (ended) finish(new Error('Closed before ' + label + '\n' + out + err))
        }
        changed.add(read)
        read()
      })
    }
    return { child, line, send: (...lines) => child.stdin.write(lines.join('\n') + '\n'),
      eof: () => child.stdin.end(), stop: () => child.kill('SIGKILL'),
      async done() {
        const result = await child.finished
        expect(out).not.toContain('"name":"forbidden"')
        expect(await readdir(home)).toEqual([])
        return { ...result, out, err }
      } }
  }
  async function open(options) {
    const cli = start(options)
    if (options?.init) {
      await cli.line('prompt', value => value.includes('initialize'))
      cli.send('yes')
    }
    const startup = await cli.line('startup')
    expect(startup).toMatchObject({ elapsedMs: expect.any(Number), synthetic: true })
    const status = await cli.line('status')
    const index = await cli.line('receipts')
    return { cli, status, index, startup }
  }
  function rows(sql) {
    const db = new DatabaseSync(join(graph, 'graph.sqlite'), { readOnly: true, allowExtension: false })
    try { return db.prepare(sql).all() } finally { db.close() }
  }
  async function journals(root = journal) {
    const result = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name)
      if (entry.isDirectory()) result.push(...await journals(path))
      else if (entry.name.endsWith('.jsonl')) result.push(path)
    }
    return result
  }
  return { start, open, graph, journal, rows, journals }
}

async function create(cli, objective = 'Shared title', criterion = 'Verify continuity') {
  cli.send('create', objective, criterion, '')
  return cli.line('preview')
}

async function confirm(cli) {
  await cli.line('prompt', value => value.includes('confirm this preview'))
  cli.send('yes')
  return cli.line('committed')
}

async function close(cli, expected = { saved: true, pending: 0, reason: null }) {
  cli.send('exit')
  expect(await cli.line('shutdown')).toMatchObject(expected)
  expect(await cli.done()).toMatchObject({ code: expected.saved ? 0 : 1, signal: null })
}

test('initialization is explicit; cancel and EOF leave roots untouched, and init never overwrites', async t => {
  const f = await fixture(t)
  const implicit = f.start()
  expect(await implicit.done()).toMatchObject({ code: 1 })
  for (const input of ['no', undefined]) {
    const cli = f.start({ init: true })
    await cli.line('prompt', value => value.includes('initialize'))
    if (input === undefined) cli.eof(); else cli.send(input)
    expect(await cli.done()).toMatchObject({ code: 0 })
    expect(await readdir(f.journal)).toEqual([])
    expect(await readdir(f.graph)).toEqual([])
  }
  const { cli } = await f.open({ init: true })
  await close(cli)
  const paths = [join(f.graph, pair), join(f.journal, pair)]
  const before = await Promise.all(paths.map(path => readFile(path)))
  const second = f.start({ init: true })
  await second.line('prompt', value => value.includes('initialize'))
  second.send('yes')
  expect(await second.done()).toMatchObject({ code: 1 })
  expect(await Promise.all(paths.map(path => readFile(path)))).toEqual(before)
  await rm(paths[0])
  const partial = f.start()
  expect((await partial.done()).out).toContain('initialization_incomplete')
  expect(await readFile(paths[1])).toEqual(before[1])
  expect(await readdir(f.graph)).not.toContain(pair)
}, 35_000)

test('operator confirmation separates create, bind, sample and leave across fresh native Sessions', async t => {
  const f = await fixture(t)
  const { cli, status, startup } = await f.open({ init: true })
  expect(status).toMatchObject({ identity: 'identity_unbound', binding: { taskId: null, revision: 0 },
    history: 'history_ready', modelContext: 'model_context_not_enabled' })
  cli.send('create', 'Pasted preview and answer', 'criterion', '', 'yes', 'tasks')
  await cli.line('preview')
  expect(await cli.line('tasks')).toMatchObject({ items: [] })
  expect(await create(cli, 'Unconfirmed')).not.toHaveProperty('token')
  cli.send('no', 'tasks')
  expect(await cli.line('tasks')).toMatchObject({ items: [] })

  cli.send('create', 'Rejected\u001b[31m', 'criterion', '')
  expect(await cli.line('error')).toMatchObject({ code: 'invalid' })
  const objective = 'Shared title\u009b31m\u202e'
  const preview = await create(cli, objective, 'sample')
  expect(preview).toMatchObject({ command: { kind: 'create', objective, criteria: ['sample'] }, session: status.session,
    binding: status.binding, nativeNext: expect.any(Number), graphNext: expect.any(Number) })
  const created = await confirm(cli)
  expect(created).toMatchObject({ kind: 'create', ordinal: 1, after: { binding: status.binding } })
  await create(cli, objective)
  const duplicate = await confirm(cli)
  expect(duplicate.taskId).not.toBe(created.taskId)
  cli.send('continue Shared title', 'continue ' + created.taskId.slice(0, 8), 'status')
  expect(await cli.line('error')).toMatchObject({ code: 'invalid_command' })
  expect(await cli.line('error')).toMatchObject({ code: 'invalid_command' })
  expect(await cli.line('status')).toMatchObject({ binding: status.binding })

  const [nativeLog] = await f.journals()
  const beforeRead = await readFile(nativeLog)
  cli.send('history ' + created.taskId, `receipt ${status.session.sessionId} ${status.session.incarnation} ${created.ordinal}`, 'status')
  expect(await cli.line('history')).toMatchObject({ taskId: created.taskId, history: 'history_ready', events: [] })
  expect(await cli.line('receipt')).toEqual(created)
  expect(await cli.line('status')).toMatchObject({ binding: status.binding })
  expect(await readFile(nativeLog)).toEqual(beforeRead)
  cli.send('continue ' + created.taskId)
  expect(await cli.line('preview')).toMatchObject({ task: { taskId: created.taskId, objective, criteria: ['sample'] } })
  const bound = await confirm(cli)
  expect(bound.after.binding).toEqual({ taskId: created.taskId, revision: 1 })
  expect(await cli.line('history')).toMatchObject({ taskId: created.taskId, events: [] })
  cli.send('status', 'sample', 'history ' + created.taskId)
  expect(await cli.line('status')).toMatchObject({ identity: 'identity_ready' })
  expect(await cli.line('sample')).toMatchObject({ synthetic: true })
  expect(await cli.line('history')).toMatchObject({ events: expect.arrayContaining([
    expect.objectContaining({ session: status.session, localSeq: expect.any(Number), kind: 'user' }),
  ]) })
  cli.send('leave')
  expect(await cli.line('preview')).toMatchObject({ command: { kind: 'leave' }, binding: bound.after.binding })
  expect(await confirm(cli)).toMatchObject({ kind: 'unbind', after: { binding: { taskId: null, revision: 2 } } })
  cli.send('session new', 'status')
  const rotated = await cli.line('status')
  expect(rotated.session).not.toEqual(status.session)
  expect(rotated.binding).toEqual({ taskId: null, revision: 0 })
  await close(cli)
  const firstRun = await cli.done()
  expect(firstRun.out).toContain('Shared title\\u009b31m\\u202e')
  expect(firstRun.out).not.toMatch(/[\x1b\x9b\u202e]|Fixed synthetic continuation sample/u)

  const reopened = await f.open()
  expect(reopened.status.session).not.toEqual(rotated.session)
  expect(reopened.status.binding).toEqual({ taskId: null, revision: 0 })
  expect(reopened.index.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ operationId: created.operationId, ordinal: 1, kind: 'create', taskId: created.taskId, session: status.session }),
    expect.objectContaining({ operationId: bound.operationId, kind: 'bind', taskId: created.taskId, session: status.session }),
  ]))
  reopened.cli.send(`receipt ${status.session.sessionId} ${status.session.incarnation} ${bound.ordinal}`, 'continue ' + created.taskId)
  expect(await reopened.cli.line('receipt')).toEqual(bound)
  await reopened.cli.line('preview')
  const resumed = await confirm(reopened.cli)
  expect(resumed.operationId).not.toBe(bound.operationId)
  expect(resumed).toMatchObject({ taskId: created.taskId, session: reopened.status.session,
    after: { binding: { revision: 1, taskId: created.taskId } } })
  expect(await reopened.cli.line('history')).toMatchObject({ events: expect.arrayContaining([
    expect.objectContaining({ session: status.session, kind: 'user' }),
  ]) })
  await close(reopened.cli)
  expect(reopened.status).toMatchObject({ reconciledSessions: 2, recoveredEvents: 0, pending: 0 })
  console.log('CLI acceptance:', JSON.stringify({ startupMs: startup.elapsedMs, reopenMs: reopened.startup.elapsedMs,
    reconciledSessions: reopened.status.reconciledSessions, recoveredEvents: reopened.status.recoveredEvents,
    pending: reopened.status.pending }))
}, 35_000)

test('EOF at a live confirmation does not commit create or a lifecycle receipt', async t => {
  const f = await fixture(t)
  const { cli } = await f.open({ init: true })
  await create(cli)
  cli.child.stdin.end('yes')
  expect(await cli.line('shutdown')).toMatchObject({ saved: true })
  expect(await cli.done()).toMatchObject({ code: 0 })
  const reopened = await f.open()
  expect(reopened.index.items).toEqual([])
  reopened.cli.send('tasks')
  expect(await reopened.cli.line('tasks')).toMatchObject({ items: [] })
  await close(reopened.cli)
}, 35_000)

test('kill after checkpoint but before registration leaves an orphan that is never enrolled', async t => {
  const f = await fixture(t)
  const broken = f.start({ init: true, fault: 'registration' })
  await broken.line('prompt', value => value.includes('initialize'))
  broken.send('yes')
  const { value: orphan } = await broken.line('probe', value => value.name === 'checkpoint-before-registration')
  broken.stop()
  expect(await broken.done()).toMatchObject(dead)
  const paths = await f.journals()
  expect(paths).toHaveLength(1)
  const before = await readFile(paths[0])
  expect(JSON.parse(before.toString('utf8').split('\n')[0]).id).toBe(orphan.sessionId)
  expect(f.rows('SELECT session_id FROM continuation_session')).toEqual([])
  const { cli, status } = await f.open()
  expect(status).toMatchObject({ recovery: 'ready', reconciledSessions: 0 })
  expect(status.session).not.toEqual(orphan)
  cli.send(`receipt ${orphan.sessionId} ${orphan.incarnation} 1`)
  expect(await cli.line('error')).toMatchObject({ code: 'unavailable' })
  await close(cli)
  expect(f.rows('SELECT session_id FROM continuation_session')).toEqual([{ session_id: status.session.sessionId }])
  expect(await readFile(paths[0])).toEqual(before)
}, 35_000)

test('kill after commit and before display recovers exactly one old receipt without replay', async t => {
  const f = await fixture(t)
  const { cli } = await f.open({ init: true, fault: 'receipt' })
  const preview = await create(cli)
  await cli.line('prompt', value => value.includes('confirm this preview'))
  cli.send('yes')
  const { value: committed } = await cli.line('probe', value => value.name === 'commit-before-display')
  expect(committed.operationId).toBe(preview.operationId)
  cli.stop()
  const lost = await cli.done()
  expect(lost).toMatchObject(dead)
  expect(lost.out).not.toMatch(/^committed /mu)
  const reopened = await f.open()
  expect(reopened.status.binding).toEqual({ taskId: null, revision: 0 })
  expect(reopened.index.items).toEqual([{ ...committed, ordinal: 1, kind: 'create' }])
  reopened.cli.send(`receipt ${committed.session.sessionId} ${committed.session.incarnation} 1`, 'tasks')
  expect(await reopened.cli.line('receipt')).toMatchObject(committed)
  expect(await reopened.cli.line('tasks')).toMatchObject({ items: [{ taskId: committed.taskId, objective: 'Shared title', status: 'open' }] })
  await close(reopened.cli)
}, 35_000)

test('catalog and startup receipt index page without skipping rows', async t => {
  const f = await fixture(t)
  const { cli, status } = await f.open({ init: true })
  const all = []
  for (let i = 0; i < 17; i++) {
    await create(cli)
    all.push(await confirm(cli))
  }
  cli.send('tasks', 'tasks next', 'tasks next')
  const head = await cli.line('tasks')
  const tail = await cli.line('tasks')
  expect(head).toMatchObject({ items: expect.any(Array), next: true })
  expect(head.items).toHaveLength(16)
  expect(tail).toMatchObject({ items: expect.any(Array), next: false })
  expect([...head.items, ...tail.items].map(row => row.taskId)).toEqual(all.map(row => row.taskId).sort())
  expect(await cli.line('error')).toMatchObject({ code: 'no_next_page' })
  await close(cli)

  const reopened = await f.open()
  expect(reopened.index.items.map(row => row.operationId)).toEqual(all.slice(0, 16).map(row => row.operationId))
  expect(reopened.index.next).toEqual([status.session.sessionId, status.session.incarnation, 16])
  reopened.cli.send('receipts ' + reopened.index.next.join(' '))
  expect(await reopened.cli.line('receipts')).toEqual({ items: [expect.objectContaining({
    session: status.session, operationId: all[16].operationId, ordinal: 17,
  })], next: null })
  await close(reopened.cli)
}, 35_000)

test('missing registered Journal blocks mutations but keeps verified metadata and receipts readable', async t => {
  const f = await fixture(t)
  const { cli } = await f.open({ init: true })
  await create(cli)
  const created = await confirm(cli)
  await close(cli)
  const paths = await f.journals()
  expect(paths).toHaveLength(1)
  await rm(paths[0])
  const reopened = await f.open()
  expect(reopened.status).toMatchObject({ session: null, recovery: 'recovery_blocked', history: 'history_incomplete', pending: null })
  expect(reopened.index.items).toEqual([expect.objectContaining({ operationId: created.operationId })])
  reopened.cli.send('create', 'continue ' + created.taskId, 'sample', 'session new', 'history ' + created.taskId)
  for (let n = 0; n < 4; n++) expect(await reopened.cli.line('error')).toMatchObject({ code: 'recovery_blocked' })
  expect(await reopened.cli.line('history')).toMatchObject({ taskId: created.taskId, history: 'history_incomplete' })
  await close(reopened.cli, { saved: false, pending: null, reason: expect.any(String) })
  expect(await f.journals()).toEqual([])
}, 35_000)

test('bounded shutdown reports pending truthfully and retains the lease until the writer finishes', async t => {
  const f = await fixture(t)
  const { cli } = await f.open({ init: true, fault: 'shutdown' })
  cli.child.send('arm')
  await cli.line('probe', value => value.name === 'armed')
  cli.send('exit')
  await cli.line('probe', value => value.name === 'writer-held')
  expect(await cli.line('shutdown')).toEqual({ saved: false, pending: 0, reason: 'timeout' })
  const competing = f.start()
  expect(await competing.line('error')).toMatchObject({ code: 'busy' })
  expect(await competing.done()).toMatchObject({ code: 1 })
  cli.child.send('release')
  const final = await cli.done()
  expect(final).toMatchObject({ code: 1, signal: null })
  expect(final.out).not.toContain('"saved":true')
  const reopened = await f.open()
  await close(reopened.cli)
}, 35_000)
