const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const keys = (value, ...allowed) => object(value) && Object.keys(value).length === allowed.length
  && allowed.every(k => Object.hasOwn(value, k))
const find = (cut, ref) => typeof ref === 'string' && Object.hasOwn(cut.links, ref) ? cut.links[ref] : undefined
const privateWire = /"(?:tag|primary|related|operations|intent|kind|goal|ref|work_anchor)"\s*:|\b(?:continue_anchor|refer_existing|propose_new)\b/iu
const intents = new Set(['describe_only', 'execute', 'clarify', 'acknowledge', 'propose'])

function readChoice(value, arm, cut, safeText) {
  const kind = value?.kind
  if (keys(value, 'kind')) {
    if (kind === 'unresolved' || kind === 'no_task') return { kind }
    if (arm === 'B' && kind === 'continue_anchor') {
      const assignment = find(cut, cut.anchorRef)
      if (assignment) return { kind, assignment }
    }
  } else if (kind === (arm === 'A' ? 'existing' : 'refer_existing') && keys(value, 'kind', 'ref')) {
    const assignment = find(cut, value.ref)
    if (assignment) return { kind, assignment }
  } else if (kind === (arm === 'A' ? 'new_task_proposal' : 'propose_new') && keys(value, 'kind', 'goal')) {
    const goal = typeof value.goal === 'string' ? value.goal.trim() : ''
    if (goal.length && goal.length <= 160 && safeText(goal, cut) && !privateWire.test(goal.normalize('NFKC'))) return { kind, goal }
  }
  return null
}

export function readProposals(raw, stop, arm, cut, readFrame, safeText) {
  let frame
  try { frame = readFrame(raw, stop) } catch { return { frame: false, user: null, assistant: null, intent: null } }
  const tag = frame.tag
  if (!keys(tag, 'user_turn', 'assistant', 'intent')) return { frame: true, user: null, assistant: null, intent: null }
  return { frame: true,
    user: readChoice(tag.user_turn, arm, cut, safeText),
    assistant: keys(tag.assistant, 'primary', 'related') ? readChoice(tag.assistant.primary, arm, cut, safeText) : null,
    intent: intents.has(tag.intent) ? tag.intent : null }
}

export function projectRelative(raw, stop, cut, { readAssignmentFrame, safeAssignmentText, splitRoles }) {
  if (cut.toolAvailable) throw new Error('TEXT_ONLY_PROPOSAL_CONTRACT')
  const frame = readAssignmentFrame(raw, stop)
  if (privateWire.test(frame.answer.normalize('NFKC'))) throw new Error('UNSAFE_ANSWER')
  const tag = frame.tag, validTag = keys(tag, 'user_turn', 'assistant', 'intent')
  const convert = value => {
    const proposal = readChoice(value, 'B', cut, safeAssignmentText)
    if (!proposal) return undefined
    if (proposal.kind === 'continue_anchor') return { kind: 'existing', ref: cut.anchorRef }
    if (proposal.kind === 'refer_existing') return { kind: 'existing', ref: value.ref }
    if (proposal.kind === 'propose_new') return { kind: 'new_task_proposal', goal: proposal.goal }
    return { kind: proposal.kind }
  }
  const a = validTag && keys(tag.assistant, 'primary', 'related') ? tag.assistant : null
  const projected = splitRoles(JSON.stringify({ answer: frame.answer, tag: validTag ? {
    user_turn: convert(tag.user_turn), assistant: a ? { primary: convert(a.primary), related: a.related } : undefined,
    intent: tag.intent,
  } : null }), stop, cut)
  return projected
}
