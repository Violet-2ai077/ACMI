import type { SyntheticUserExcerpt, UnderstandingCandidate, UnderstandingIntent } from '@acmi/contracts'
import { boundedText } from './runtime-facts.ts'

const uncertain: UnderstandingIntent = { kind: 'uncertain' }

export function classifyUnderstandingIntent(user: SyntheticUserExcerpt | undefined, current: string | undefined,
  candidates: readonly UnderstandingCandidate[]): UnderstandingIntent {
  if (!user) return uncertain
  const text = user.text.trim()
  if (/^(?:thanks?(?: you)?|ok(?:ay)?|got it|hi|hello|\u8c22\u8c22|\u597d\u7684|\u6536\u5230)[.!\u3002!]*$/iu.test(text)) return { kind: 'no_task' }
  const cue = /^(?:switch to|resume|back to|correction: switch to|\u5207\u6362\u5230|\u56de\u5230)\s+([a-z0-9_.:-]{1,96})[.!]?$/iu.exec(text)
  if (cue) {
    const key = cue[1]!.toLowerCase()
    const exact = (value: string) => candidates.filter(c => c.alias.toLowerCase() === value || c.taskId === value)
    const direct = exact(key)
    const matches = direct.length || !key.endsWith('.') ? direct : exact(key.slice(0, -1))
    if (matches.length !== 1) return uncertain
    const taskId = matches[0]!.taskId
    return { kind: taskId === current ? 'continue_current' : 'switch_existing', taskId }
  }
  const newTask = /^(?:new task|separate task|new objective|\u65b0\u4efb\u52a1)\s*[:\uff1a]\s*(.+)$/iu.exec(text)?.[1]?.trim()
  if (boundedText(newTask, 512) && !/^(?:maybe|possibly|not sure)\b/iu.test(newTask)) return { kind: 'create_new', objective: newTask }
  if (/^continue:\s*(?:switch to|back to|new task|separate task|new objective)\b/iu.test(text)) return uncertain
  if (current && /^(?:continue(?: current(?: task)?)?(?:[.!]|:\s*.+)?|split into:\s*.+|parallel:\s*.+|\u7ee7\u7eed[\u3002!]?|\u62c6\u5206[\uff1a:].+)$/iu.test(text)) {
    return { kind: 'continue_current', taskId: current }
  }
  return uncertain
}

export function explicitUnderstandingOperations(user: SyntheticUserExcerpt | undefined, active: string | undefined): unknown[] {
  if (!user || !active) return []
  const text = user.text.trim()
  const split = /^(split into|parallel|\u62c6\u5206)\s*[:\uff1a]\s*(.+)$/iu.exec(text)
  if (split) return [{ kind: split[1]?.toLowerCase() === 'parallel' ? 'branch' : 'decompose',
    parent: active, titles: split[2]!.split(/[;\uff1b]/u).map(x => x.trim()) }]
  const next = /^continue:\s*next action:\s*(.+)$/iu.exec(text)
  if (next) return [{ kind: 'next-action', text: next[1] }]
  const refine = /^continue:\s*refine\s+([a-z0-9_.:-]{1,96})\s*:\s*(.+)$/iu.exec(text)
  if (refine) {
    const [description, ...criteria] = refine[2]!.split(';').map(x => x.trim())
    return [{ kind: 'refine', nodeId: refine[1], description, criteria }]
  }
  const dependency = /^continue:\s*dependency\s+([a-z0-9_.:-]{1,96})\s+->\s+([a-z0-9_.:-]{1,96})$/iu.exec(text)
  if (dependency) return [{ kind: 'dependency', from: dependency[1], to: dependency[2] }]
  const state = /^continue:\s*(block|ready|mark completed|confirm completed)\s+([a-z0-9_.:-]{1,96})$/iu.exec(text)
  if (state) {
    const command = state[1]!.toLowerCase()
    return [{ kind: 'state', nodeId: state[2], state: command === 'block' ? 'blocked' : command === 'ready' ? 'ready' : 'completed' }]
  }
  return []
}
