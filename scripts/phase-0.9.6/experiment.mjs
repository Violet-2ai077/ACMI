import { adviseTaskReference, buildLayeredContext, layeredContextLimits, measureUnderstandingText,
  validUnderstandingCut } from '../../packages/core/dist/index.js'

export const sourceLimits = Object.freeze({ bytes: 256, estimatedTokens: 96 })
export const cells = Object.freeze(['literal_off', 'literal_on', 'contrast_off', 'contrast_on'])
const cutKeys = ['workspaceId', 'sessionId', 'incarnation', 'cursor', 'authorizationEpoch', 'bindingRevision',
  'graphRevision', 'sourceRevision', 'candidateRevision', 'policyVersion']
const current = (a, b) => validUnderstandingCut(a) && validUnderstandingCut(b) && cutKeys.every(k => a[k] === b[k])
const key = s => typeof s === 'string' && /^[\p{L}\p{N}_.:@-]{1,128}$/u.test(s)
const receipt = (status, taskId = null) => ({ status, taskId })
const withheld = () => ({ status: 'withheld' })
const permitsWorkspace = (packet, a) => current(a.readCurrentCut(), packet.cut) && a.authority.permits(a.scope, packet.cut.workspaceId)
const permitsSource = (packet, id, a) => permitsWorkspace(packet, a) && a.permitsSource(a.scope, packet.cut, id) === true

/** The packet and readSource callback are from a trusted fixture Host, never a model or UI payload. */
export function projectAntecedent(packet, sourceId, access) {
  try {
    if (!packet || packet.current.actor !== 'user' || packet.current.kind !== 'message' || !key(sourceId)
      || packet.current.id === sourceId || !permitsSource(packet, sourceId, access)) return withheld()
    const prior = access.readSource(packet.cut, sourceId)
    if (!prior || prior.id !== sourceId || prior.complete !== true || prior.kind !== 'message' || prior.actor !== 'user'
      || !current(prior.cut, { ...packet.cut, cursor: packet.cut.cursor - 1 }) || typeof prior.text !== 'string'
      || !/^[a-f0-9]{64}$/u.test(prior.digest ?? '')) return withheld()
    if (prior.text.length > sourceLimits.bytes) return { status: 'budget' }
    const size = measureUnderstandingText(prior.text)
    if (size.bytes > sourceLimits.bytes || size.estimatedTokens > sourceLimits.estimatedTokens) return { status: 'budget' }
    const verified = buildLayeredContext({ cut: prior.cut, binding: { taskId: null },
      current: { id: prior.id, actor: prior.actor, kind: prior.kind, text: prior.text } }, access)
    if (verified.status !== 'ready' || verified.packet.current.digest !== prior.digest) return withheld()
    const view = Object.freeze({ turnId: prior.id, sourceRevision: prior.cut.sourceRevision, cursor: prior.cut.cursor,
      text: prior.text, digest: prior.digest, span: Object.freeze({ start: 0, end: prior.text.length }) })
    const envelope = JSON.stringify({ packet, antecedent: view })
    const full = measureUnderstandingText(envelope)
    if (full.bytes > layeredContextLimits.bytes || full.estimatedTokens > layeredContextLimits.tokens) return { status: 'budget' }
    if (!permitsSource(packet, sourceId, access)) return withheld()
    return Object.freeze({ status: 'admitted', view, evidenceBytes: size.bytes,
      addedBytes: full.bytes - packet.budget.bytes, addedEstimatedTokens: full.estimatedTokens - packet.budget.estimatedTokens,
      envelopeDigest: access.sha256(envelope) })
  } catch { return withheld() }
}

const englishLink = String.raw`(?:the (?:task|item) (?:from|in) my (?:last|previous) (?:note|message)|what i just (?:mentioned|described)|the one i just (?:mentioned|named)|that item from my last note)`
const chineseLink = '(?:我刚才说的那件事|我上一条提到的任务|我刚说的那个|刚才我提的那个|我刚才说的任务)'
const pointer = `(?:${englishLink}|${chineseLink})`
const action = new RegExp(`^(?:(?:(?:let['’]s|please)\\s+)?(?:return to|go back to|pick up|continue|switch back to)\\s+|(?:接着做|回到|继续|切回)\\s*)${pointer}$`, 'iu')
const lookup = new RegExp(`^(?:look up\\s+|(?:查看|查阅|查一下)\\s*)${pointer}$`, 'iu')
const strip = text => text.trim().replace(/[.。]$/u, '').trimEnd()
const sourcePrefix = /^(?:(?:i (?:meant|was talking about|am referring to)|the (?:task|item) i (?:meant|named) was|my (?:last )?note was about)\s+|(?:我说的是|我指的是|刚才我提的是|前一条说的是)\s*)(.+)$/iu
const fence = /[\r\n"'“”‘’「」『』`；;？！!?]/u
const unsafeAnchor = /[,，]|^(?:not\b|if\b|unless\b|instead\b|task:|不是|不要|如果|假如)/iu
const contrasts = [
  { pattern: /^(.+?),\s*not\s+(.+)$/iu, positive: 1 },
  { pattern: /^not\s+(.+?),?\s+but\s+(.+)$/iu, positive: 2 },
  { pattern: /^(.+?)，\s*不是\s*(.+)$/u, positive: 1 },
  { pattern: /^不是\s*(.+?)，\s*而是\s*(.+)$/u, positive: 2 },
]

function terms(text, contrast) {
  const body = strip(text)
  const phrase = !fence.test(body) && sourcePrefix.exec(body)?.[1]
  if (!phrase) return []
  if (contrast) for (const { pattern, positive } of contrasts) {
    const m = pattern.exec(phrase)
    if (m) {
      const selected = [m[positive].trim(), m[3 - positive].trim()]
      return selected.every(x => x && !unsafeAnchor.test(x)) ? selected : []
    }
  }
  return unsafeAnchor.test(phrase) ? [] : [phrase]
}

function resolve(packet, direct, projection, resolver, complete) {
  if (direct.taskId) return receipt(direct.status, direct.taskId)
  if (direct.status === 'unavailable') return receipt('unavailable')
  const text = strip(packet.current.text)
  const mode = action.test(text) ? 'action' : lookup.test(text) ? 'history' : null
  if (!mode) return receipt(direct.status)
  if (!projection?.view || !complete) return receipt('clarify')
  const tokens = terms(projection.view.text, resolver === 'contrast')
  if (!tokens.length) return receipt('clarify')
  const fold = s => s.normalize('NFC').toLowerCase()
  const candidates = [...packet.active, ...packet.historical]
  const matches = tokens.map(token => candidates.filter(row =>
    [row.objective, ...(row.aliases ?? [])].some(name => fold(name) === fold(token))))
  if (matches.some(rows => rows.length !== 1)) return receipt('clarify')
  const [[target], [rejected] = []] = matches
  if (target.taskId === rejected?.taskId) return receipt('clarify')
  if (target.bindable !== (mode === 'action')) return receipt('clarify')
  return receipt(target.bindable ? 'suggest_active' : 'reference_history', target.taskId)
}

function stillAllowed(packet, result, projection, access) {
  try {
    return permitsWorkspace(packet, access)
      && (!projection?.view || permitsSource(packet, projection.view.turnId, access))
      && (result.taskId === null || access.permitsTask(access.scope, result.taskId) === true)
  } catch { return false }
}

export function runPair({ context, catalogComplete, sourceId, access }) {
  const built = buildLayeredContext(context, access)
  let sourceReads = 0
  const output = {}
  const packet = built.packet
  const direct = packet ? adviseTaskReference({ enabled: true, context, catalogComplete }, access) : receipt('unavailable')
  const complete = catalogComplete === true && (context.candidates?.length ?? 0) <= 512
    && !packet?.omissions.some(o => ['active', 'historical'].includes(o.section))
  const side = (mode, projection) => {
    for (const resolver of ['literal', 'contrast']) {
      const candidate = packet ? resolve(packet, direct, projection, resolver, complete) : receipt('unavailable')
      const result = packet && stillAllowed(packet, candidate, projection, access) ? candidate : receipt('unavailable')
      output[resolver + '_' + mode] = { ...result, packetDigest: packet?.digest ?? null,
        envelopeDigest: projection?.envelopeDigest ?? packet?.digest ?? null }
    }
  }
  side('off')
  const offSourceReads = sourceReads
  const projection = projectAntecedent(packet, sourceId, { ...access,
    readSource: (...args) => { sourceReads++; return access.readSource(...args) } })
  side('on', projection)
  const { view, ...evidence } = projection
  return { cells: output, offSourceReads, sourceReads, evidence,
    authorizedActive: packet?.active.map(c => c.taskId) ?? [], authorizedHistorical: packet?.historical.map(c => c.taskId) ?? [] }
}
