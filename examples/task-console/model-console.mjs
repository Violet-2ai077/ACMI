import { ConsoleError, display, errorCode, runCommands } from './console.mjs'

const maxContextBytes = 16 * 1024
const commands = ['tasks [next]', 'create', 'session new', 'continue <task-uuid>', 'leave', 'status',
  'history <task-uuid>', 'ask <one-line prompt>', 'receipts [<session-uuid> <incarnation> <after>]',
  'receipt <session-uuid> <incarnation> <ordinal>', 'help', 'exit']
const recoveryHint = 'Model outcome unknown. Do not retry automatically. Inspect history and receipts, exit cleanly, reopen the same pair, then explicitly continue the Task UUID.'

export async function runModelCommands(host, ask, signal, { endpoint, model }, emit = display) {
  let usedSession, uncertain = false

  async function modelAsk(prompt) {
    if (!prompt.trim()) throw new ConsoleError('invalid_command')
    if (uncertain) {
      emit('error', { code: 'model_outcome_unknown', hint: recoveryHint })
      return
    }
    const status = await host.status()
    if (signal.aborted) return
    if (status.recovery === 'recovery_blocked') throw new ConsoleError('recovery_blocked')
    const session = JSON.stringify(status.session)
    if (usedSession === session) {
      emit('error', { code: 'fresh_session_required', hint: 'Run session new, then continue <task-uuid> and confirm before another ask.' })
      return
    }
    if (!status.session || !status.binding?.taskId) {
      emit('error', { code: 'binding_required', hint: 'Run continue <task-uuid> and confirm the preview first.' })
      return
    }
    emit('model-preview', { endpoint, model, taskId: status.binding.taskId, maxContextBytes,
      historyWindow: 'latest 64 assigned facts; overflow fails, never silently truncates', prompt })
    const answer = await ask('Type exactly yes to send this prompt and bounded Task history to the displayed local model; anything else cancels.', true)
    if (signal.aborted || answer !== 'yes') { emit('cancelled', 'ask'); return }
    // Conservatively consume the Session on invocation, including interrupted/failed turns.
    usedSession = session
    try {
      const result = await host.modelTurn(prompt, { maxContextBytes }, signal)
      const { text: _text, ...context } = result.context
      emit('model-context', context)
      emit('answer', result.answer)
      emit('model-turn', { next: result.next, hint: 'For another ask: session new, then explicitly continue <task-uuid> and confirm.' })
    } catch (error) {
      uncertain = true
      emit('error', { code: errorCode(error), outcome: 'unknown', hint: recoveryHint })
    }
  }

  // Reuse the original command implementation and its strict preview confirmation.
  // Intercept only top-level input: never turn buffered command text into a confirmation.
  await runCommands(host, async (prompt, fresh) => {
    if (prompt !== 'acmi>') return ask(prompt, fresh)
    while (!signal.aborted) {
      const line = await ask('acmi-model>')
      if (line === undefined || typeof line !== 'string') return line
      const command = line.trim()
      try {
        if (command === 'help') emit('help', commands)
        else if (command === 'ask' || /^ask[ \t]/u.test(command)) await modelAsk(command.slice(3).trimStart())
        else if (/^sample(?:[ \t]|$)/u.test(command)) throw new ConsoleError('invalid_command')
        else return line
      } catch (error) { emit('error', { code: errorCode(error) }) }
    }
    return undefined
  }, signal)
}
