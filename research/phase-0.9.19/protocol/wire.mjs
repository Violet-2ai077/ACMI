import { ACTIONS, ENVELOPE, UUID } from './contracts.mjs'

class Incomplete extends Error {}
function jsonPrefix(text, onString = () => {}) {
  let i = 0
  const ws = () => { while (/[ \t\r\n]/.test(text[i] ?? '') && i < text.length) i++ }
  const need = () => { if (i >= text.length) throw new Incomplete('incomplete JSON') }
  function string(path) {
    i++
    let value = ''
    const notify = () => onString(path, value.replace(/[\uD800-\uDBFF]$/, ''))
    while (true) {
      need()
      let ch = text[i++]
      if (ch === '"') { onString(path, value); return value }
      if (ch.charCodeAt(0) < 32) throw new Error('JSON control character')
      if (ch === '\\') {
        need()
        ch = text[i++]
        if (ch === 'u') {
          if (i + 4 > text.length) throw new Incomplete('unicode escape')
          const h = text.slice(i, i + 4)
          if (!/^[0-9a-f]{4}$/i.test(h)) throw new Error('unicode escape')
          value += String.fromCharCode(parseInt(h, 16))
          i += 4
        } else {
          const e = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
          if (!Object.hasOwn(e, ch)) throw new Error('JSON escape')
          value += e[ch]
        }
      } else value += ch
      notify()
    }
  }
  function value(path = [], depth = 0) {
    if (depth > 48) throw new Error('JSON depth')
    ws(); need()
    if (text[i] === '"') return string(path)
    if (text[i] === '{') {
      i++; ws(); need()
      const result = Object.create(null)
      if (text[i] === '}') { i++; return result }
      while (true) {
        ws(); need()
        if (text[i] !== '"') throw new Error('JSON object key')
        const k = string([])
        if (Object.hasOwn(result, k)) throw new Error('duplicate JSON key')
        ws(); need()
        if (text[i++] !== ':') throw new Error('JSON colon')
        result[k] = value([...path, k], depth + 1)
        ws(); need()
        const sep = text[i++]
        if (sep === '}') return result
        if (sep !== ',') throw new Error('JSON comma')
      }
    }
    if (text[i] === '[') {
      i++; ws(); need()
      const result = []
      if (text[i] === ']') { i++; return result }
      while (true) {
        if (result.length >= 256) throw new Error('JSON array limit')
        result.push(value([...path, result.length], depth + 1))
        ws(); need()
        const sep = text[i++]
        if (sep === ']') return result
        if (sep !== ',') throw new Error('JSON array comma')
      }
    }
    for (const [literal, v] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, i)) { i += literal.length; return v }
      if (literal.startsWith(text.slice(i))) throw new Incomplete('literal')
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))
    if (!match) throw new Error('JSON value')
    i += match[0].length
    const n = Number(match[0])
    if (!Number.isFinite(n)) throw new Error('nonfinite JSON number')
    return n
  }
  const result = value()
  ws()
  if (i !== text.length) throw new Error('trailing JSON')
  return result
}

function check(v, schema, p, path = '') {
  if (schema.optional) return v === undefined || check(v, schema.optional, p, path)
  if (schema.nullable) return v === null || check(v, schema.nullable, p, path)
  if (schema.enum) return schema.enum.includes(v)
  if (schema.action) return !!ACTIONS[v?.op] && check(v, ACTIONS[v.op], p, path)
  if (schema === 'string') return typeof v === 'string' && v.length > 0 && v.length <= 32768
  if (schema === 'uuid') return typeof v === 'string' && UUID.test(v)
  if (schema.list) return Array.isArray(v) && v.length <= schema.max && v.every((x, i) => check(x, schema.list, p, path + '/' + i))
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  if (Object.keys(v).some(k => !Object.hasOwn(schema, k))) return false
  if (!Object.entries(schema).every(([k, s]) => check(v[k], s, p, path + '/' + k))) return false
  if (Object.hasOwn(schema, 'source_id') && Object.hasOwn(schema, 'quote')) {
    const source = p.sourceMap[v.source_id]
    return typeof source === 'string' && source.indexOf(v.quote) >= 0 && source.indexOf(v.quote) === source.lastIndexOf(v.quote)
  }
  return true
}

function validate(v, p) {
  if (!check(v, ENVELOPE, p)) throw new Error('schema/reference invalid')
  const w = v.work_state
  if (w.turn_id !== p.turn_id || w.base_state_id !== p.base_state_id) throw new Error('request identity')
  const unique = a => new Set(a).size === a.length
  const same = (a, b) => unique(a) && unique(b) && [...a].sort().join('|') === [...b].sort().join('|')
  if (!same(w.decisions.map(d => d.unit_id), p.unit_ids)) throw new Error('unit coverage')
  if (!unique(w.decisions.map(d => d.decision_id)) || !unique(v.answer.map(b => b.block_id)) || !unique(w.task_memory.map(m => m.task_id))) throw new Error('duplicate id')
  if (w.focus_task_id !== null && !w.proposed_active_task_ids.includes(w.focus_task_id)) throw new Error('focus outside active')
  if (!unique(w.proposed_active_task_ids)) throw new Error('duplicate active')
  const births = []
  let actionCount = 0
  for (const d of w.decisions) {
    const targets = []
    if (!d.actions.length || !d.evidence.length) throw new Error('empty actions/evidence')
    for (const a of d.actions) {
      actionCount++
      if (a.op === 'CONTINUE') { if (!a.task_ids.length) throw new Error('empty continue'); targets.push(...a.task_ids) }
      if (a.op === 'SWITCH') {
        if (!a.to_task_ids.length || same(a.from_task_ids, a.to_task_ids)) throw new Error('empty switch')
        targets.push(...a.to_task_ids)
      }
      if (['CREATE', 'BRANCH'].includes(a.op)) { births.push(a.task_id); targets.push(a.task_id) }
      if (a.op === 'BRANCH' && a.parent_task_id === a.task_id) throw new Error('self branch')
      if (a.op === 'MERGE') {
        if (a.source_task_ids.length < 2 || !unique(a.source_task_ids)) throw new Error('merge sources')
        targets.push(a.target_task_id)
        if (p.slots.includes(a.target_task_id)) {
          births.push(a.target_task_id)
          if (!a.objective || !a.acceptance?.length) throw new Error('new merge objective')
        }
      }
    }
    if (!same([...new Set(targets)], d.task_ids)) throw new Error('action targets')
    if (targets.some(id => !w.proposed_active_task_ids.includes(id))) throw new Error('target outside active')
    if (d.actions.some(a => a.op === 'UNRESOLVED') !== (d.unresolved !== null)) throw new Error('unresolved mismatch')
    for (const q of [...d.resolved_scope_quotes, ...d.unresolved_scope_quotes]) if (!p.sourceMap[d.unit_id]?.includes(q)) throw new Error('scope quote')
  }
  if (actionCount > 16 || !unique(births) || births.some(id => !p.slots.includes(id))) throw new Error('birth/operation bounds')
  for (const b of v.answer) if (!b.decision_ids.length || b.decision_ids.some(id => !w.decisions.some(d => d.decision_id === id))) throw new Error('answer reference')
  for (const u of w.status_updates) if (w.task_memory.find(m => m.task_id === u.task_id)?.lifecycle_status !== u.to) throw new Error('status snapshot mismatch')
}

const OPEN = '<|acmi:'
const END = '<|acmi:end|>'
const TEXT = '<|acmi:text|>'
export function encodeInline(v) {
  const json = x => JSON.stringify(x).replaceAll('<', '\\u003c')
  const escaped = s => s.replaceAll('\\', '\\\\').replaceAll(OPEN, '\\' + OPEN)
  const { decisions, ...commit } = v.work_state
  return decisions.map(d => OPEN + 'decision:v1|>' + json(d) + END).join('') +
    v.answer.map(({ text, ...meta }) => OPEN + 'answer:v1|>' + json(meta) + TEXT + escaped(text) + END).join('') +
    OPEN + 'commit:v1|>' + json({ ...commit, decision_ids: decisions.map(d => d.decision_id) }) + END
}

function inlinePrefix(text, visible) {
  let at = 0
  const decisions = [], answer = []
  let commit = null
  while (at < text.length) {
    if (commit) throw new Error('after commit')
    const headerEnd = text.indexOf('|>', at)
    if (headerEnd < 0) {
      if (![OPEN + 'decision:v1|>', OPEN + 'answer:v1|>', OPEN + 'commit:v1|>'].some(h => h.startsWith(text.slice(at)))) throw new Error('frame prefix')
      throw new Incomplete('frame header')
    }
    const header = text.slice(at, headerEnd + 2)
    const kind = ['decision', 'answer', 'commit'].find(k => header === OPEN + k + ':v1|>')
    if (!kind) throw new Error('frame type')
    at = headerEnd + 2
    const delim = kind === 'answer' ? TEXT : END
    const stop = text.indexOf(delim, at)
    if (stop < 0) throw new Incomplete('frame JSON')
    const part = text.slice(at, stop)
    if (part.includes('<')) throw new Error('unescaped marker JSON')
    const data = jsonPrefix(part)
    at = stop + delim.length
    if (kind === 'decision') decisions.push(data)
    else if (kind === 'commit') { commit = data }
    else {
      if (Object.hasOwn(data, 'text') || !data.decision_ids?.every(id => decisions.some(d => d.decision_id === id))) throw new Error('answer before decision')
      let body = ''
      while (true) {
        visible(answer.length, body)
        if (at >= text.length) throw new Incomplete('text frame')
        if (text.startsWith(END, at)) { at += END.length; break }
        if (END.startsWith(text.slice(at))) throw new Incomplete('end marker')
        if (text[at] === '\\') {
          if (at + 1 === text.length) throw new Incomplete('text escape')
          if (text[at + 1] === '\\') { body += '\\'; at += 2 }
          else if (text.startsWith('\\' + OPEN, at)) { body += OPEN; at += OPEN.length + 1 }
          else if (('\\' + OPEN).startsWith(text.slice(at))) throw new Incomplete('marker escape')
          else throw new Error('invalid text escape')
        } else body += text[at++]
      }
      visible(answer.length, body)
      answer.push({ ...data, text: body })
    }
  }
  if (!commit) throw new Incomplete('commit absent')
  const { decision_ids, ...rest } = commit
  if (JSON.stringify(decision_ids) !== JSON.stringify(decisions.map(d => d.decision_id))) throw new Error('commit decision ids')
  return { answer, work_state: { ...rest, decisions } }
}

export function createWireParser({ arm, inputPacket, limits = {} }) {
  if (!['A', 'B'].includes(arm)) throw new Error('wire arm')
  const chunks = []
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = '', bytes = 0, error = null, closed = false, finalValue = null
  const emitted = new Map()
  function scan() {
    const events = []
    const seen = new Map()
    const visible = (i, s) => seen.set(i, s.replace(/[\uD800-\uDBFF]$/, ''))
    try {
      finalValue = arm === 'A' ? jsonPrefix(text, (path, s) => {
        if (path.length === 3 && path[0] === 'answer' && Number.isInteger(path[1]) && path[2] === 'text') visible(path[1], s)
      }) : inlinePrefix(text, visible)
    } catch (e) {
      finalValue = null
      if (!(e instanceof Incomplete)) error = e.message
    }
    for (const [i, s] of seen) {
      const prev = emitted.get(i) ?? ''
      if (!s.startsWith(prev)) { error = 'nonmonotone text'; continue }
      if (s.length > prev.length) events.push({ kind: 'text', block: i, text: s.slice(prev.length) })
      emitted.set(i, s)
    }
    return events
  }
  return {
    push(chunk) {
      if (closed) throw new Error('parser closed')
      const b = Buffer.from(chunk); chunks.push(b); bytes += b.length
      if (bytes > (limits.maxBytes ?? 262144)) { error = 'byte limit'; return [] }
      if (error) return []
      try { text += decoder.decode(b, { stream: true }) } catch { error = 'invalid UTF-8'; return [] }
      return scan()
    },
    finish() {
      if (closed) throw new Error('parser closed')
      closed = true
      try { text += decoder.decode() } catch { error = 'invalid UTF-8' }
      scan()
      if (!error && !finalValue) error = 'incomplete output'
      if (!error) try { validate(finalValue, inputPacket) } catch (e) { error = e.message }
      if (finalValue) finalValue = JSON.parse(JSON.stringify(finalValue))
      return { valid: !error, answer: finalValue?.answer ?? [], workState: finalValue?.work_state ?? null,
        errors: error ? [error] : [], raw: Buffer.concat(chunks), visibleText: [...emitted.values()].join('') }
    }
  }
}
