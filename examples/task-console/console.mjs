import { isTaskId } from '@acmi/core'
import { GraphStoreError, ScopedJournalError } from '@acmi/dsh-integration'

const pageSize = 16
const historyLimit = 64
const maxLine = 4096
const maxQueued = 128
const overlong = Symbol('overlong line')
const commands = ['tasks [next]', 'create', 'session new', 'continue <task-uuid>', 'leave', 'status',
  'history <task-uuid>', 'sample', 'receipts [<session-uuid> <incarnation> <after>]',
  'receipt <session-uuid> <incarnation> <ordinal>', 'help', 'exit']

export class ConsoleError extends Error {
  constructor(code) { super(code); this.code = code }
}

export function errorCode(error) {
  return error instanceof ConsoleError || error instanceof GraphStoreError || error instanceof ScopedJournalError ? error.code : 'io'
}

export function display(label, value) {
  const safe = JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, char =>
    char.split('').map(unit => '\\u' + unit.charCodeAt(0).toString(16).padStart(4, '0')).join(''))
  process.stdout.write(label + ' ' + safe + '\n')
}

export function readInput(input, signal) {
  const queued = []
  let partial = '', tooLong = false, sequence = 0, started = 0, ended = false, wake, failure
  const finish = () => { ended = true; wake?.() }
  input.once('end', finish)
  input.once('close', finish)
  input.once('error', error => { failure = error; finish() })
  input.setEncoding('utf8')
  input.on('data', chunk => {
    if (ended) return
    sequence++
    const lines = chunk.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (partial.length === 0 && !tooLong) started = sequence
      if (!tooLong && partial.length + lines[i].length <= maxLine + 1) partial += lines[i]
      else { partial = ''; tooLong = true }
      if (i === lines.length - 1) break
      if (queued.length === maxQueued) {
        failure = new ConsoleError('limit')
        queued.length = 0
        finish()
        return
      }
      const line = partial.endsWith('\r') ? partial.slice(0, -1) : partial
      queued.push({ value: tooLong || line.length > maxLine ? overlong : line, started })
      partial = ''
      tooLong = false
    }
    wake?.()
  })
  return async (prompt, fresh = false) => {
    if (signal.aborted) return undefined
    const cutoff = sequence
    display('prompt', prompt)
    if (!queued.length && !ended) await new Promise(resolve => { wake = resolve })
    wake = undefined
    if (signal.aborted) return undefined
    if (failure) throw failure
    // Ignore partial EOF lines and never approve using input buffered before the prompt.
    const line = queued.shift()
    return line && fresh && line.started <= cutoff ? '' : line?.value
  }
}

function exactSession(registrations, sessionId, incarnation) {
  const entry = registrations.find(({ session }) => session.sessionId === sessionId && session.incarnation === incarnation)
  if (!entry) throw new ConsoleError('unavailable')
  return entry.session
}

function receiptArgs(args) {
  const [sessionId, incarnation, position] = args
  if (args.length !== 3 || !isTaskId(sessionId) || !/^(?:0|[1-9][0-9]*)$/u.test(incarnation)
    || !/^(?:0|[1-9][0-9]*)$/u.test(position) || !Number.isSafeInteger(Number(position))) throw new ConsoleError('invalid_command')
  return [sessionId, incarnation, Number(position)]
}

export async function showReceipts(host, args = []) {
  const sessions = await host.sessions()
  let offset = 0, after = 0
  if (args.length) {
    const [sessionId, incarnation, position] = receiptArgs(args)
    const cursor = exactSession(sessions, sessionId, incarnation)
    offset = sessions.findIndex(entry => entry.session === cursor)
    after = position
  }
  const items = []
  for (let i = offset; i < sessions.length && items.length <= pageSize; i++) {
    const { session } = sessions[i]
    const page = await host.receipts(session, i === offset ? after : 0, pageSize + 1 - items.length)
    for (const { ordinal, operationId, kind, taskId } of page) items.push({ session, ordinal, operationId, kind, taskId })
  }
  const more = items.length > pageSize
  if (more) items.pop()
  const last = items.at(-1)
  display('receipts', { items, next: more ? [last.session.sessionId, last.session.incarnation, last.ordinal] : null })
}

async function showReceipt(host, args) {
  const [sessionId, incarnation, ordinal] = receiptArgs(args)
  if (ordinal === 0) throw new ConsoleError('invalid_command')
  const session = exactSession(await host.sessions(), sessionId, incarnation)
  const [receipt] = await host.receipts(session, ordinal - 1, 1)
  if (receipt?.ordinal !== ordinal) throw new ConsoleError('unavailable')
  display('receipt', receipt)
}

async function showHistory(host, taskId) {
  try {
    const history = await host.history(taskId, historyLimit)
    display('history', { ...history, limit: historyLimit,
      note: history.events.length === 0 ? 'No visible history events.' : null })
  } catch (error) {
    display('history', { taskId, history: 'history_incomplete', reason: errorCode(error) })
    throw error
  }
}

async function confirm(host, command, ask, signal) {
  const { token, ...view } = await host.preview(command)
  display('preview', view)
  const answer = await ask('Type exactly yes to confirm this preview; anything else cancels.', true)
  const receipt = await host.confirm(token, !signal.aborted && answer === 'yes')
  if (!receipt) { display('cancelled', command.kind); return }
  display('committed', receipt)
  if (command.kind === 'continue') await showHistory(host, command.taskId)
}

async function create(host, ask, signal) {
  const objective = await ask('Objective (one line, blank cancels):')
  if (objective === overlong) throw new ConsoleError('limit')
  if (!objective?.trim()) { display('cancelled', 'create'); return }
  const criteria = []
  for (;;) {
    const line = await ask('Acceptance criterion (one per line; blank ends):')
    if (line === undefined) { display('cancelled', 'create'); return }
    if (line === overlong || line.length > 1024) throw new ConsoleError('limit')
    if (!line.trim()) break
    if (criteria.length === 16) throw new ConsoleError('limit')
    criteria.push(line)
  }
  if (criteria.length === 0) throw new ConsoleError('criterion_required')
  await confirm(host, { kind: 'create', objective, criteria }, ask, signal)
}

export async function runCommands(host, ask, signal) {
  let taskCursor = null
  while (!signal.aborted) {
    const line = await ask('acmi>')
    if (line === undefined) return
    try {
      if (line === overlong) throw new ConsoleError('limit')
      if (!line.trim()) continue
      const [name, ...args] = line.trim().split(/[ \t]+/u)
      if (name === 'exit' && !args.length) return
      if (name === 'help' && !args.length) display('help', commands)
      else if (name === 'status' && !args.length) display('status', await host.status())
      else if (name === 'tasks' && (!args.length || args.length === 1 && args[0] === 'next')) {
        const cursor = taskCursor
        taskCursor = null
        if (args.length && !cursor) throw new ConsoleError('no_next_page')
        const page = await host.tasks(pageSize, args.length ? cursor : undefined)
        taskCursor = page.next
        display('tasks', { items: page.items, next: taskCursor !== null })
      } else if (name === 'receipts') await showReceipts(host, args)
      else if (name === 'receipt') await showReceipt(host, args)
      else if (name === 'history' && args.length === 1 && isTaskId(args[0])) await showHistory(host, args[0])
      else {
        const mutate = name === 'create' || name === 'leave' || name === 'sample' ? args.length === 0
          : name === 'continue' ? args.length === 1 && isTaskId(args[0])
            : name === 'session' && args.length === 1 && args[0] === 'new'
        if (!mutate) throw new ConsoleError('invalid_command')
        const status = await host.status()
        if (status.recovery === 'recovery_blocked') {
          display('error', { code: 'recovery_blocked', reason: status.reason })
          continue
        }
        if (signal.aborted) return
        if (name === 'create') await create(host, ask, signal)
        else if (name === 'sample') display('sample', await host.sample(signal))
        else if (name === 'session') display('session', await host.newSession(signal))
        else await confirm(host, name === 'continue' ? { kind: name, taskId: args[0] } : { kind: name }, ask, signal)
      }
    } catch (error) { display('error', { code: errorCode(error) }) }
  }
}
