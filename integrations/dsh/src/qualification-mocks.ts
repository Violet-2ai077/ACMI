import { candidateLexemes, classifyUnderstandingIntent, explicitDecisionBasis } from '@acmi/core'
import type { QualificationAdapter, QualificationMode, QualificationPacket } from './qualification-evaluation.ts'

const candidateNorm = (s: string) => s.normalize('NFKC').toLowerCase().trim()
const ask = /\b(?:maybe|might|which|not sure|should we|can we discuss|or should)\b|\u4e0d\u786e\u5b9a|\u8fd8\u662f|\u5148\u804a|\u53ef\u80fd/iu
const returnCue = /\b(?:switch|back to|return to|resume|pick up|carry on with|reopen)\b|\u56de\u5230|\u5207\u6362|\u6362\u56de|\u63a5\u7740|\u7ee7\u7eed|\u6062\u590d|\u91cd\u5f00/iu
const newCue = /\b(?:new|separate|unrelated|different)\s+(?:task|ticket|issue|workstream|request|goal)\b|\u5355\u72ec|\u53e6\u4e00\u4ef6|\u53e6\u5f00|\u4e0d\u662f\u540c\u4e00\u4ef6|\u65b0\u4efb\u52a1/iu
const ack = /^(?:thank(?:s| you)(?: for (?:looking|checking|the update|your help))?|got it|okay|ok|makes sense|understood|cool|hello|hi|good morning|good night|\u8c22\u8c22|\u6536\u5230|\u597d\u7684|\u8f9b\u82e6\u4e86|\u660e\u767d\u4e86|\u65e9\u4e0a\u597d)[.!\u3002\uff01]*$/iu

function getNamed(packet: QualificationPacket, text: string) {
  const norm = candidateNorm(text)
  return packet.candidates.filter(c => norm.includes(c.taskId)
    || (c.title.length > 2 && norm.includes(candidateNorm(c.title))))
}
function modelResponse(packet: QualificationPacket, mode: QualificationMode) {
  const user = [...packet.dialogue].reverse().find(t => t.actor === 'user' && t.text)
  const text = user?.text?.trim() ?? ''
  const named = getNamed(packet, text)
  const candidates = packet.candidates.map(c => ({ ...c, alias: c.title, workspaceId: 'offline',
    revision: packet.candidateRevision }))
  const old = classifyUnderstandingIntent(user && text ? { text, evidenceId: user.id, provenance: 'synthetic_host_excerpt' } : undefined,
    packet.currentTaskId ?? undefined, candidates)
  let intent = old.kind
  let taskId: string | null = 'taskId' in old ? old.taskId : null
  if (mode === 'abstention-first') {
    if (ack.test(text)) { intent = 'no_task'; taskId = null }
    else if (ask.test(text) || intent === 'create_new') { intent = 'uncertain'; taskId = null }
  } else if (mode === 'scripted' || mode === 'structured') {
    if (ack.test(text)) { intent = 'no_task'; taskId = null }
    else if (ask.test(text)) { intent = 'uncertain'; taskId = null }
    else if (newCue.test(text) && !returnCue.test(text)) { intent = 'create_new'; taskId = null }
    else if (returnCue.test(text) && named.length === 1) {
      taskId = named[0]!.taskId
      intent = taskId === packet.currentTaskId ? 'continue_current' : 'switch_existing'
    } else if (mode === 'structured' && intent === 'uncertain' && packet.currentTaskId && !returnCue.test(text)) {
      const query = candidateLexemes(text)
      const current = packet.candidates.find(c => c.taskId === packet.currentTaskId)
      const tokens = new Set(candidateLexemes((current?.title ?? '') + ' ' + (current?.objective ?? ''), 24))
      const hits = query.filter(token => tokens.has(token)).length
      if (hits >= 2 && /\b(?:fix|add|check|finish|test|keep)\b|\u4fee|\u8865|\u770b|\u6d4b|\u6539/iu.test(text)
        && named.every(c => c.taskId === packet.currentTaskId)) { intent = 'continue_current'; taskId = packet.currentTaskId }
    }
  }
  const operations: { operation: object; evidence: QualificationPacket['evidence'][number]['link'] }[] = []
  if (mode === 'scripted' || mode === 'structured') {
    const source = [...packet.evidence].reverse().find(e => e.actor === 'user')
    if (source && (intent === 'continue_current' || intent === 'uncertain')) {
      const accepted = /^(?:approve|confirm)\s+([a-z0-9_.-]+)\s*:\s*([^.!?]+)[.!]?$/iu.exec(text)
      if (accepted) operations.push({ operation: { kind: 'decision', topic: accepted[1]!, text: accepted[2]!.trim(), state: 'accepted',
        rationale: explicitDecisionBasis, alternatives: [], replaces: [] }, evidence: source.link })
      const dependency = /^([a-z0-9_.-]+) (?:depends on|waits for) ([a-z0-9_.-]+)[.!]?$/iu.exec(text)
      if (mode === 'structured' && dependency) operations.push({ operation: { kind: 'dependency', from: dependency[1]!, to: dependency[2]! },
        evidence: source.link })
      const stage = packet.nodes.find(n => n.id === 'root')
      const decompose = /^(?:split into|parallel):\s*(.+)$/iu.exec(text)
      if (mode === 'structured' && stage && decompose) operations.push({ operation: { kind: 'decompose', parent: stage.id,
        titles: decompose[1]!.split(';').map(x => x.trim()).filter(Boolean).slice(0, 6) }, evidence: source.link })
    }
  }
  return { version: 'qualification-output-v1', graphRevision: packet.graphRevision, sourceRevision: packet.sourceRevision,
    candidateRevision: packet.candidateRevision, userEvidence: user?.id ?? null, intent, taskId, operations }
}

export function offlineQualificationAdapter(mode: QualificationMode): QualificationAdapter {
  return Object.freeze({
    metadata: Object.freeze({ provider: 'offline', mode, name: 'offline-' + mode }),
    respond({ packet }: Parameters<QualificationAdapter['respond']>[0]) {
      const response = modelResponse(packet, mode)
      if (mode !== 'adversarial') return JSON.stringify(response)
      switch (parseInt(packet.sourceRevision.slice(0, 2), 16) % 10) {
        case 0: return '{"intent":'
        case 1: return JSON.stringify({ ...response, reviewerId: 'untrusted-model' })
        case 2: return JSON.stringify({ ...response, intent: 'switch_existing', taskId: '09100000-0000-4000-8000-ffffffffffff' })
        case 3: return JSON.stringify({ ...response, graphRevision: '0'.repeat(64) })
        case 4: return JSON.stringify({ ...response, operations: [{ operation: { kind: 'task-closed' },
          evidence: { factId: '0'.repeat(64), sourceRevision: 'forged', evidenceRevision: '0'.repeat(64), excerptHash: null } }] })
        case 5: return JSON.stringify({ ...response, storagePath: 'outside-synthetic-root' })
        case 6: return JSON.stringify({ ...response, operations: [{ operation: { kind: 'dependency', from: 'root', to: 'fake' },
          evidence: { factId: '0'.repeat(64), sourceRevision: 'forged', evidenceRevision: '0'.repeat(64), excerptHash: null } }] })
        case 7: return JSON.stringify({ ...response, intent: '\ud800' })
        case 8: return 'x'.repeat(9000)
        default: return JSON.stringify({ ...response, operations: [{ operation: { kind: 'join-satisfied', nodeId: 'root' } }] })
      }
    },
  } satisfies QualificationAdapter)
}
