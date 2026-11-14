import { readRaw } from '../evaluator/read-raw.mjs'
import { createWireParser } from '../protocol/wire.mjs'

export const INLINE_PROFILE = 'B-inline-v1-ws1'
const OPEN = '<|acmi:', END = '<|acmi:end|>', TEXT = '<|acmi:text|>'
const headers = ['decision', 'answer', 'commit'].map(k => OPEN + k + ':v1|>')
class Incomplete extends Error {}

function json(text) {
  const value = JSON.parse(text), stack = []
  for (const match of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const t = match[0], top = stack.at(-1)
    if (t === '{' || t === '[') {
      stack.push({ object: t === '{', key: t === '{', keys: new Set() })
      if (stack.length > 48) throw new Error('depth')
    } else if (t === '}' || t === ']') stack.pop()
    else if (t === ',') { if (top?.object) top.key = true }
    else if (t[0] === '"' && top?.object && top.key) {
      const k = JSON.parse(t)
      if (top.keys.has(k)) throw new Error('duplicate key')
      top.keys.add(k); top.key = false
    } else if (/^[\d-]/.test(t) && !Number.isFinite(Number(t))) throw new Error('nonfinite')
  }
  return value
}

function scan(text, visible) {
  let at = 0, commit = null
  const decisions = [], answer = []
  while (at < text.length) {
    const start = at
    while (at < text.length && ' \t\r\n'.includes(text[at])) {
      if (++at - start > 1024) throw new Error('layout byte limit')
    }
    if (at === text.length) break
    if (commit) throw new Error('after commit')
    const end = text.indexOf('|>', at)
    if (end < 0) {
      if (!headers.some(h => h.startsWith(text.slice(at)))) throw new Error('frame prefix')
      throw new Incomplete('frame header')
    }
    const header = text.slice(at, end + 2), index = headers.indexOf(header)
    if (index < 0) throw new Error('frame')
    at = end + 2
    const delimiter = index === 1 ? TEXT : END, stop = text.indexOf(delimiter, at)
    if (stop < 0) throw new Incomplete('frame JSON')
    const segment = text.slice(at, stop)
    if (segment.includes('<')) throw new Error('raw marker JSON')
    const meta = json(segment)
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('frame object')
    at = stop + delimiter.length
    if (index === 0) decisions.push(meta)
    else if (index === 2) commit = meta
    else {
      if (Object.hasOwn(meta, 'text') || !Array.isArray(meta.decision_ids) || !meta.decision_ids.every(id => decisions.some(d => d.decision_id === id))) throw new Error('forward reference')
      let body = ''
      while (true) {
        visible(answer.length, body)
        if (at >= text.length) throw new Incomplete('answer text')
        if (text.startsWith(END, at)) { at += END.length; break }
        if (END.startsWith(text.slice(at))) throw new Incomplete('end marker')
        if (text[at] === '\\') {
          if (at + 1 === text.length) throw new Incomplete('escape')
          if (text[at + 1] === '\\') { body += '\\'; at += 2 }
          else if (text.startsWith('\\' + OPEN, at)) { body += OPEN; at += OPEN.length + 1 }
          else if (('\\' + OPEN).startsWith(text.slice(at))) throw new Incomplete('marker escape')
          else throw new Error('escape')
        } else body += text[at++]
      }
      visible(answer.length, body)
      answer.push({ ...meta, text: body })
    }
  }
  if (!commit) throw new Incomplete('commit absent')
  const { decision_ids, ...rest } = commit
  if (JSON.stringify(decision_ids) !== JSON.stringify(decisions.map(d => d.decision_id))) throw new Error('commit')
  return { answer, work_state: { ...rest, decisions } }
}

export function createInlineProfileParser({ inputPacket, inlineProfile }) {
  if (inlineProfile !== INLINE_PROFILE) throw new Error('unknown inline profile')
  const chunks = [], decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), emitted = new Map()
  let text = '', size = 0, error = null, closed = false, envelope = null
  function update() {
    const events = [], seen = new Map()
    if (error) return events
    try {
      envelope = scan(text, (block, s) => seen.set(block, s.replace(/[\uD800-\uDBFF]$/, '')))
    } catch (e) { envelope = null; if (!(e instanceof Incomplete)) error = e.message }
    for (const [block, s] of seen) {
      const previous = emitted.get(block) ?? ''
      if (!s.startsWith(previous)) { error = 'nonmonotone text'; continue }
      if (s.length > previous.length) events.push({ kind: 'text', block, text: s.slice(previous.length) })
      emitted.set(block, s)
    }
    return events
  }
  return {
    push(bytes) {
      if (closed) throw new Error('parser closed')
      const b = Buffer.from(bytes); chunks.push(b); size += b.length
      if (size > 262144) error = 'byte budget'
      if (error) return []
      try { text += decoder.decode(b, { stream: true }) } catch { error = 'invalid UTF-8' }
      return update()
    },
    finish() {
      if (closed) throw new Error('parser closed')
      closed = true
      try { text += decoder.decode() } catch { error = 'invalid UTF-8' }
      update()
      if (!error && !envelope) error = 'incomplete output'
      let checked = { valid: false, answer: [], workState: null, errors: error ? [error] : [], envelope }
      if (!error) {
        // This is an AST validation bridge, not replacement model output. The
        // B raw bytes/provenance remain authoritative and are returned unchanged.
        const ast = Buffer.from(JSON.stringify(envelope))
        const validator = createWireParser({ arm: 'A', inputPacket, limits: { maxBytes: ast.length } })
        validator.push(ast); checked = { ...validator.finish(), envelope }
        if (checked.valid && ast.length <= 262144) checked = readRaw(ast, { arm: 'A', inputPacket })
      }
      return { ...checked, arm: 'B', inline_profile: inlineProfile, raw: Buffer.concat(chunks), visibleText: [...emitted.values()].join('') }
    }
  }
}

export function readGate2Raw(bytes, options) {
  if (options.inlineProfile !== undefined && options.inlineProfile !== INLINE_PROFILE) throw new Error('unknown inline profile')
  if (options.arm !== 'B' || options.inlineProfile === undefined) return readRaw(bytes, options)
  const parser = createInlineProfileParser(options)
  parser.push(bytes)
  return parser.finish()
}
