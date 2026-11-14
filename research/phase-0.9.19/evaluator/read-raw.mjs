import { ACTIONS, ENVELOPE, UUID } from '../protocol/contracts.mjs'

function strictJson(text) {
  const value = JSON.parse(text)
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g
  const stack = []
  for (const match of text.matchAll(tokens)) {
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
    } else if (t[0] !== '"' && /^[\d-]/.test(t) && !Number.isFinite(Number(t))) throw new Error('nonfinite')
  }
  return value
}

function readInline(text) {
  const ds = [], answer = []
  let commit
  while (text.length) {
    if (commit) throw new Error('trailing frame')
    const h = /^<\|acmi:(decision|answer|commit):v1\|>/.exec(text)
    if (!h) throw new Error('frame')
    text = text.slice(h[0].length)
    const boundary = h[1] === 'answer' ? '<|acmi:text|>' : '<|acmi:end|>'
    const stop = text.indexOf(boundary)
    if (stop < 0) throw new Error('truncated frame')
    const segment = text.slice(0, stop)
    if (segment.includes('<')) throw new Error('raw marker JSON')
    const meta = strictJson(segment)
    text = text.slice(stop + boundary.length)
    if (h[1] === 'decision') ds.push(meta)
    else if (h[1] === 'commit') commit = meta
    else {
      if ('text' in meta || !meta.decision_ids?.every(x => ds.some(d => d.decision_id === x))) throw new Error('forward reference')
      let content = '', found = false
      while (text.length) {
        if (text.startsWith('<|acmi:end|>')) { text = text.slice(12); found = true; break }
        if (text.startsWith('\\\\')) { content += '\\'; text = text.slice(2) }
        else if (text.startsWith('\\<|acmi:')) { content += '<|acmi:'; text = text.slice(8) }
        else if (text[0] === '\\') throw new Error('escape')
        else { content += text[0]; text = text.slice(1) }
      }
      if (!found) throw new Error('truncated text')
      answer.push({ ...meta, text: content })
    }
  }
  if (!commit || JSON.stringify(commit.decision_ids) !== JSON.stringify(ds.map(d => d.decision_id))) throw new Error('commit')
  const { decision_ids, ...w } = commit
  return { answer, work_state: { ...w, decisions: ds } }
}

function schemaErrors(value, rule, packet, path = '$', errors = []) {
  const fail = () => errors.push(path)
  if (rule.optional) { if (value !== undefined) schemaErrors(value, rule.optional, packet, path, errors); return errors }
  if (rule.nullable) { if (value !== null) schemaErrors(value, rule.nullable, packet, path, errors); return errors }
  if (rule === 'string' || rule === 'uuid') {
    if (typeof value !== 'string' || !value.length || value.length > 32768 || (rule === 'uuid' && !UUID.test(value))) fail()
  } else if (rule.enum) { if (!rule.enum.includes(value)) fail() }
  else if (rule.action) {
    const s = ACTIONS[value?.op]
    if (!s) fail()
    else schemaErrors(value, s, packet, path, errors)
  } else if (rule.list) {
    if (!Array.isArray(value) || value.length > rule.max) fail()
    else value.forEach((v, i) => schemaErrors(v, rule.list, packet, path + '/' + i, errors))
  } else if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  else {
    for (const k of Object.keys(value)) if (!(k in rule)) errors.push(path + '/extra:' + k)
    for (const [k, s] of Object.entries(rule)) schemaErrors(value[k], s, packet, path + '/' + k, errors)
    if ('quote' in rule && 'source_id' in rule) {
      const s = packet.sourceMap[value.source_id], q = value.quote
      if (typeof s !== 'string' || typeof q !== 'string' || !q || s.split(q).length !== 2) errors.push(path + '/evidence')
    }
  }
  return errors
}

function references(v, p) {
  const w = v.work_state, errors = []
  const unique = xs => new Set(xs).size === xs.length
  const setEquals = (a, b) => a.length === b.length && unique(a) && a.every(x => b.includes(x))
  if (w.turn_id !== p.turn_id || w.base_state_id !== p.base_state_id) errors.push('request mismatch')
  if (!setEquals(w.decisions.map(d => d.unit_id), p.unit_ids)) errors.push('unit coverage')
  if (!unique(w.decisions.map(d => d.decision_id)) || !unique(v.answer.map(b => b.block_id)) || !unique(w.task_memory.map(m => m.task_id))) errors.push('duplicate identifiers')
  if (!unique(w.proposed_active_task_ids) || (w.focus_task_id !== null && !w.proposed_active_task_ids.includes(w.focus_task_id))) errors.push('active/focus')
  const births = [], ids = w.decisions.map(d => d.decision_id)
  let count = 0
  for (const d of w.decisions) {
    const targets = []
    if (!d.actions.length || !d.evidence.length) errors.push('missing action/evidence')
    for (const a of d.actions) {
      count++
      switch (a.op) {
        case 'CONTINUE': targets.push(...a.task_ids); if (!a.task_ids.length) errors.push('empty continuation'); break
        case 'SWITCH': targets.push(...a.to_task_ids); if (!a.to_task_ids.length || setEquals(a.from_task_ids, a.to_task_ids)) errors.push('switch'); break
        case 'CREATE': case 'BRANCH':
          births.push(a.task_id); targets.push(a.task_id)
          if (a.op === 'BRANCH' && a.task_id === a.parent_task_id) errors.push('branch')
          break
        case 'MERGE':
          targets.push(a.target_task_id)
          if (a.source_task_ids.length < 2 || !unique(a.source_task_ids)) errors.push('merge')
          if (p.slots.includes(a.target_task_id)) {
            births.push(a.target_task_id)
            if (!a.objective || !a.acceptance?.length) errors.push('merge birth')
          }
      }
    }
    if (!setEquals(d.task_ids, [...new Set(targets)])) errors.push('targets')
    if (targets.some(id => !w.proposed_active_task_ids.includes(id))) errors.push('target outside active')
    if ((d.unresolved !== null) !== d.actions.some(a => a.op === 'UNRESOLVED')) errors.push('unresolved')
    for (const q of [...d.resolved_scope_quotes, ...d.unresolved_scope_quotes]) if (!p.sourceMap[d.unit_id]?.includes(q)) errors.push('scope')
  }
  if (count > 16 || !unique(births) || births.some(x => !p.slots.includes(x))) errors.push('births')
  for (const b of v.answer) if (!b.decision_ids.length || b.decision_ids.some(x => !ids.includes(x))) errors.push('answer refs')
  for (const u of w.status_updates) if (w.task_memory.find(m => m.task_id === u.task_id)?.lifecycle_status !== u.to) errors.push('status snapshot')
  return errors
}

export function readRaw(rawBytes, { arm, inputPacket, answerText }) {
  let envelope = null
  try {
    if (rawBytes.length > 262144) throw new Error('byte budget')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes)
    if (arm === 'C0') return { valid: text.length > 0, answer: [{ text, task_ids: [], decision_ids: [] }], workState: null, errors: [], envelope: null }
    envelope = arm === 'B' ? readInline(text) : strictJson(text)
    if (arm === 'D') {
      if (typeof answerText !== 'string' || Object.keys(envelope).sort().join('|') !== 'answer_ranges|work_state') throw new Error('diagnostic envelope')
      let end = 0
      const answer = envelope.answer_ranges.map(r => {
        if (Object.keys(r).sort().join('|') !== 'block_id|decision_ids|end|start|task_ids|unresolved_reason') throw new Error('range fields')
        if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < end || r.start >= r.end || r.end > answerText.length) throw new Error('diagnostic range')
        end = r.end
        const { start, end: stop, ...meta } = r
        return { ...meta, text: answerText.slice(start, stop) }
      })
      envelope = { answer, work_state: envelope.work_state }
    }
    if (!['A', 'B', 'D'].includes(arm)) throw new Error('arm')
    const errors = schemaErrors(envelope, ENVELOPE, inputPacket)
    if (!errors.length) errors.push(...references(envelope, inputPacket))
    return { valid: !errors.length, answer: envelope.answer ?? [], workState: envelope.work_state ?? null, errors, envelope }
  } catch (e) {
    return { valid: false, answer: [], workState: null, envelope, errors: [e.message] }
  }
}

export function historicalEnvelope(text) {
  return text.startsWith('<|acmi:') ? readInline(text) : strictJson(text)
}
