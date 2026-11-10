import type { LayeredUnderstandingCandidate, UnderstandingAct, UnderstandingActSpan, UnderstandingContextPackage,
  UnderstandingIdentity, UnderstandingIntentSpan, UnderstandingSpan } from '@acmi/contracts'
import { freeze } from './canonical.ts'
import { literalMention, normalizedMention } from './layered-candidates.ts'
import { readUnderstandingSpan } from './layered-context.ts'

const limit = 8
const quoted = /"[^"]*(?:"|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}\p{N}]))*(?:'(?![\p{L}\p{N}])|$)|「[^」]*(?:」|$)|『[^』]*(?:』|$)|`[^`]*(?:`|$)/gu
const negative = /\b(?:don't|do not|never|not yet|not approve|not accept|no longer|won't|not switching)\b|不要|别切|别用|不接受|不采用|不同意|先别|不能|尚未|不切/u
const conditional = /\b(?:if|unless|only after|provided that|as long as|except|pending|subject to|until)\b|\bbut\b[^.!?]{0,160}\bfirst\b|如果|若是|要是|除非|通过后|之后再|才采用|才考虑|仅当|(?:但|不过)[^。！？]{0,80}先/u
const hypothetical = /\b(?:suppose|hypothetically|what if|imagine)\b|假设|假如|设想/u
const directRequest = /^(?:(?:could|can|would|will) you (?:please )?|please )(?:switch|go back|return|resume|reopen|continue|pause|close|start|open|revise)\b|^(?:请你?|麻烦你)(?:切换|切到|恢复|重开|回到|继续|暂停|关闭|新建)/u
const reported = /^(?:the (?:note|record|report|message|document) says|(?:he|she|they|the assistant) said)\b|^(?:备注|记录|助手)(?:说|写道|提到)/u
const questions = /[?？]|\b(?:what|how|why|status of|how about)\b|怎么样|如何|什么情况|吗[。！]?$/u
const social = /^(?:(?:thanks(?: a lot)?|thank you|hello|good morning|good evening|hi|bye|nice|收到|好的|谢谢|辛苦了|你好|早上好|晚安|再见)[!.。！\s]*)+$/u
const newWork = /\b(?:new task|separate task|new workstream|separate project|start a new|a different deliverable)\b|新任务|另开|单独建|开一个新|新项目/u
const returned = /\b(?:go back to|head back to|return to|back to|revisit|pick up where we left off)\b|回到|返回|回去继续|接回/u
const switched = /\b(?:switch(?: over)? to|move on to|turn to|focus on|move (?:over )?to|pivot to)\b|切到|切换到|换到|转去|改做/u
const resumed = /\b(?:resume|reopen|pick back up|pick up|take up again)\b|恢复|重开|重新打开|接着做/u
const continued = /\b(?:continue|keep working|keep going|carry on|proceed|take another pass)\b|继续|接着|沿用|按原计划/u
const paused = /\b(?:pause|put .* on hold|set aside)\b|暂停|先搁置|暂缓/u
const waited = /\b(?:wait|hold until)\b|等待|等一下|等到|先等/u
const closed = /\b(?:close the task|close out|mark .* complete)\b|关闭任务|关掉任务|标为完成/u
const objective = /\b(?:change|revise|replace|update|amend) (?:the |our |current )?(?:objective|goal)\b|更改目标|改变目标|目标改为|重定目标|修订目标/u
const scope = /\b(?:scope|narrow .* to|expand .* to)\b|范围|限定为/u
const refine = /\b(?:refine|add .* criteria|tighten)\b|细化|补充条件/u
const accept = /\b(?:i accept|i approve|approve|accepted|adopt|go with)\b|我同意|我接受|同意采用|批准|采用方案/u
const reject = /\b(?:reject|i disagree|decline)\b|拒绝|反对|不同意|否决/u
const correction = /\b(?:i meant|correction|actually meant)\b|我指的是|纠正|我的意思是|说的是/u
const suggestion = /\b(?:suggest|recommend|could try|proposal)\b|建议|不妨|提议/u
const report = /\b(?:reports?|status update|completed|produced)\b|报告|已生成|已经完成/u
const previous = /\b(?:previous task|earlier task|last task|previous one|earlier one|where we left off)\b|前一个任务|刚才那个|上一个任务/u
const unclear = /\b(?:that one|that task|the other one|it|same as before)\b|那个|之前那个|另一个/u
const meta = /\b(?:discuss|compare|explore|talk about|consider|look at)\b|讨论|比较|看看|聊聊|了解/u

function ranges(text: string): UnderstandingSpan[] {
  const protectedQuotes = [...text.matchAll(quoted)].map(match => [match.index!, match.index! + match[0].length])
  const result: UnderstandingSpan[] = []
  let start = 0
  const add = (end: number) => {
    const raw = text.slice(start, end)
    const stripped = raw.trim()
    if (!stripped) return
    result.push({ start: start + (raw.length - raw.trimStart().length), end: end - (raw.length - raw.trimEnd().length) })
  }
  for (let i = 0; i < text.length && result.length < limit - 1; i++) {
    const char = text[i]!
    if (!';；。！？!?\n'.includes(char) && !(char === '.' && /\s/u.test(text[i + 1] ?? ''))) continue
    if (protectedQuotes.some(([a, b]) => i >= a! && i < b!)) continue
    add(i + 1)
    start = i + 1
  }
  add(text.length)
  return result
}

function inspect(text: string, span: UnderstandingSpan, actor: UnderstandingActSpan['actor'], tail: string): UnderstandingActSpan {
  const raw = normalizedMention(text)
  const visible = raw.replace(quoted, ' ').trim()
  const acts = new Set<UnderstandingAct>()
  const negated = negative.test(visible)
  const condition = conditional.test(visible)
    || /^(?:but\b|however\b|但|不过)/u.test(normalizedMention(tail)) && conditional.test(normalizedMention(tail))
  const hypothesis = hypothetical.test(visible)
  const indirect = reported.test(visible)
  if (questions.test(visible)) acts.add('question')
  if (report.test(visible) || indirect || actor === 'tool' || actor === 'subagent') acts.add('report')
  if (suggestion.test(visible)) acts.add('suggestion')
  if (reject.test(visible) || negated) acts.add('rejection')
  if (accept.test(visible) && !indirect && !negated && !condition && !hypothesis && !acts.has('question') && actor === 'user') acts.add('acceptance')
  if (correction.test(visible)) acts.add('correction')
  if ((switched.test(visible) || returned.test(visible) || resumed.test(visible)) && !indirect && !negated && !condition && !hypothesis
    && (!acts.has('question') || directRequest.test(visible))) acts.add('selection')
  if ((newWork.test(visible) || continued.test(visible) || paused.test(visible) || closed.test(visible) || objective.test(visible))
    && !indirect && !negated && !condition && !hypothesis && (!acts.has('question') || directRequest.test(visible))) acts.add('authorization_request')
  if (social.test(visible)) acts.add(/收到|好的|thanks|thank you/u.test(visible) ? 'acknowledgement' : 'social')
  if (!acts.size) acts.add('unknown')
  return { span, acts: [...acts], actor, quoted: raw !== raw.replace(quoted, ' '), negated, conditional: condition, hypothetical: hypothesis,
    temporal: /\b(?:last week|yesterday|previous)\b|上周|昨天|之前/u.test(visible) ? 'prior'
      : /\b(?:tomorrow|later|next week)\b|明天|稍后|下周/u.test(visible) ? 'future' : 'current' }
}

function intent(text: string, act: UnderstandingActSpan): UnderstandingIntentSpan {
  const visible = normalizedMention(text).replace(quoted, ' ').trim()
  const result = (relation: UnderstandingIntentSpan['relation'], posture: UnderstandingIntentSpan['posture'],
    change: UnderstandingIntentSpan['change'] = 'preserve') => ({ span: act.span, relation, posture, change })
  if (act.actor !== 'user') return result('none', 'unknown')
  if (social.test(visible)) return result('none', 'unknown')
  if (!visible.replace(/[\s.!?。！？;；]/gu, '')) return result(act.quoted ? 'discussion' : 'unknown', act.quoted ? 'discuss' : 'unknown')
  if (reported.test(visible) || act.negated || act.conditional || act.hypothetical || act.acts.includes('question') && !directRequest.test(visible)) {
    return result('discussion', 'discuss')
  }
  if (newWork.test(visible)) return result('new', 'continue', 'objective')
  if (switched.test(visible)) return result('existing', 'switch')
  if (returned.test(visible)) return result('existing', 'return')
  if (resumed.test(visible)) return result('existing', 'resume')
  if (paused.test(visible)) return result('existing', 'pause', 'state')
  if (waited.test(visible)) return result('existing', 'wait', 'state')
  if (closed.test(visible)) return result('existing', 'close', 'state')
  if (objective.test(visible)) return result('existing', 'continue', 'objective')
  if (refine.test(visible)) return result('existing', 'continue', 'refine')
  if (scope.test(visible) && !meta.test(visible)) return result('existing', 'continue', 'scope')
  if (continued.test(visible)) return result('existing', 'continue')
  if (meta.test(visible) || act.acts.some(a => ['suggestion', 'acceptance', 'rejection'].includes(a))) return result('discussion', 'discuss')
  return result('unknown', 'unknown', 'unknown')
}

function matchedCandidates(packet: UnderstandingContextPackage, text: string): readonly LayeredUnderstandingCandidate[] {
  const all = [...packet.active, ...packet.historical]
  const matches = (row: LayeredUnderstandingCandidate) => [row.objective, ...(row.aliases ?? [])].some(alias => literalMention(text, alias))
  const explicit = all.filter(row => literalMention(text, 'task:' + row.taskId)
    || row.taskId.length === 36 && literalMention(text, row.taskId))
  return explicit.length ? explicit : all.filter(matches)
}

export function resolveLayeredIdentity(packet: UnderstandingContextPackage, source: string,
  value: UnderstandingIntentSpan): UnderstandingIdentity {
  const unresolved = (status: 'ambiguous' | 'missing' | 'unavailable' | 'stale' | 'unknown' | 'unassigned', reason: string): UnderstandingIdentity =>
    ({ status, reason })
  const resolved = (row: LayeredUnderstandingCandidate, reason: 'explicit' | 'binding' | 'recent'): UnderstandingIdentity =>
    ({ status: row.bindable ? 'active' : 'historical', handle: row.handle, reason })
  if (value.relation === 'new') return unresolved('unassigned', 'new_work_has_no_id')
  if (value.relation === 'none') return unresolved('unknown', 'no_identity_required')
  const text = normalizedMention(source)
  const targets = matchedCandidates(packet, text)
  if (targets.length > 1) return unresolved('ambiguous', 'multiple_issued_referents')
  if (targets[0]) return resolved(targets[0], 'explicit')
  if (value.relation === 'discussion' || value.relation === 'unknown') return unresolved('unknown', 'non_actionable_or_uncertain')
  if (previous.test(text)) {
    const prior = packet.retained.find(r => r.kind === 'identity' && r.taskId !== packet.binding.taskId)
    const found = packet.active.find(row => row.taskId === prior?.taskId && row.revision === prior?.revision)
    if (found) return resolved(found, 'recent')
    return unresolved('missing', 'previous_referent_missing')
  }
  if (unclear.test(text)) return unresolved('missing', 'referent_required')
  if (value.posture === 'switch' || value.posture === 'return' || value.posture === 'resume') {
    return unresolved('unavailable', 'no_matching_issued_candidate')
  }
  const bound = packet.active.find(row => row.taskId === packet.binding.taskId)
  if (bound) return resolved(bound, 'binding')
  return packet.binding.taskId && packet.omissions.some(x => x.section === 'active' && x.reason === 'stale_revision')
    ? unresolved('stale', 'binding_not_in_current_candidate_view') : unresolved('missing', 'current_binding_unavailable')
}

export interface LayeredInterpretation {
  readonly packetDigest: string
  readonly utterance: readonly UnderstandingActSpan[]
  readonly intents: readonly UnderstandingIntentSpan[]
  readonly identities: readonly UnderstandingIdentity[]
  readonly lifecycle: readonly { readonly span: UnderstandingSpan; readonly kind: 'new' | 'switch' | 'return' | 'pause' | 'resume' | 'close';
    readonly target: UnderstandingIdentity; readonly disposition: 'draft' | 'clarify' }[]
  readonly authorization: 'no_operation'
}
export function understandLayered(packet: UnderstandingContextPackage, options: { readonly singlePass?: boolean } = {}): LayeredInterpretation {
  const spans = ranges(packet.current.text)
  const selected = options.singlePass && spans.length ? [{ start: spans[0]!.start, end: spans.at(-1)!.end }] : spans
  const evidence = selected.map(span => readUnderstandingSpan(packet.current, span)!)
  const utterance = selected.map((span, i) => inspect(evidence[i]!, span, packet.current.actor, packet.current.text.slice(span.end)))
  const intents = utterance.map((act, i) => intent(evidence[i]!, act))
  const identities = intents.map((value, i) => resolveLayeredIdentity(packet, evidence[i]!, value))
  const lifecycle = intents.flatMap((value, i) => {
    if (value.relation === 'new' || value.posture === 'switch' || value.posture === 'return'
      || value.posture === 'pause' || value.posture === 'resume' || value.posture === 'close') {
      const kind = value.relation === 'new' ? 'new' : value.posture as LayeredInterpretation['lifecycle'][number]['kind']
      const target = identities[i]!
      return [{ span: value.span, kind, target,
        disposition: target.status === 'active' || target.status === 'unassigned' ? 'draft' as const : 'clarify' as const }]
    }
    return []
  })
  return freeze({ packetDigest: packet.digest, utterance, intents, identities, lifecycle, authorization: 'no_operation' })
}
