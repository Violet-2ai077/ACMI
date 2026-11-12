import { projectRelative, readProposals } from '../phase-0.9.15/proposal.mjs'

export const linkKind = 'same_unresolved_as_user'
const privateLink = /\bsame_unresolved_as_user\b/iu

function classifyLink(frame, proposals, arm) {
  const { assistant } = frame.tag ?? {}
  if (assistant?.primary?.kind !== linkKind) return 'absent'
  const clean = Object.keys(assistant.primary).length === 1 && Object.keys(assistant).length === 2
    && Object.hasOwn(assistant, 'related')
  return arm === 'B' && clean && proposals.user?.kind === 'unresolved' && proposals.intent === 'clarify'
    ? 'resolved' : 'rejected'
}

export function readLinkProposals(raw, stop, arm, cut, readFrame, safeText) {
  const protectedText = (text, scope) => !privateLink.test(text.normalize('NFKC')) && safeText(text, scope)
  const proposals = readProposals(raw, stop, 'B', cut, readFrame, protectedText)
  if (!proposals.frame) return { ...proposals, link: 'absent' }
  const link = classifyLink(readFrame(raw, stop), proposals, arm)
  return { ...proposals, link,
    assistant: link === 'resolved' ? { kind: 'unresolved', relation: linkKind } : proposals.assistant }
}

export function projectLink(raw, stop, cut, options) {
  if (cut.toolAvailable) throw new Error('TEXT_ONLY_UNRESOLVED_LINK')
  const frame = options.readAssignmentFrame(raw, stop)
  if (privateLink.test(frame.answer.normalize('NFKC'))) throw new Error('UNSAFE_ANSWER')
  const safe = (text, scope) => !privateLink.test(text.normalize('NFKC')) && options.safeAssignmentText(text, scope)
  const result = readLinkProposals(raw, stop, cut.arm, cut, options.readAssignmentFrame, safe)
  // Only the actual, validated relation can become the unresolved sentinel.
  if (result.link === 'resolved') frame.tag.assistant.primary = { kind: 'unresolved' }
  return projectRelative(result.link === 'resolved' ? JSON.stringify(frame) : raw, stop, cut,
    { ...options, safeAssignmentText: safe })
}
