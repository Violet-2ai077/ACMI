// Observational only. Overflow or unclassifiable input marks unknown bytes;
// it never grants parser validity, changes the deadline, or discards evidence.
function payloadSpans(text) {
  JSON.parse(text)
  const tokens = [...text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)]
  let at = 0, literal = 0, content = 0, reasoning = 0, strings = 0
  function value(path, depth = 0) {
    if (depth > 48) throw Error('observation depth')
    const token = tokens[at++]?.[0]
    if (token === '{') {
      while (tokens[at]?.[0] !== '}') {
        const key = JSON.parse(tokens[at++][0]); at++
        value([...path, key], depth + 1)
        if (tokens[at]?.[0] !== ',') break
        at++
      }
      at++
    } else if (token === '[') {
      let index = 0
      while (tokens[at]?.[0] !== ']') {
        value([...path, index++], depth + 1)
        if (tokens[at]?.[0] !== ',') break
        at++
      }
      at++
    } else if (token?.startsWith('"') && path.length === 4 && path[0] === 'choices' && path[1] === 0 && path[2] === 'delta') {
      const n = Buffer.byteLength(JSON.parse(token))
      if (path[3] === 'content' || path[3] === 'reasoning_content') {
        literal += Buffer.byteLength(token)
        strings++
        if (path[3] === 'content') content += n
        else reasoning += n
      }
    }
  }
  value([])
  return { literal, content, reasoning, strings }
}

export function createWireAccounting({ maxFrameBytes = 4_194_304 } = {}) {
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1 || maxFrameBytes > 4_194_304) throw Error('observation buffer bound')
  const buffer = Buffer.allocUnsafe(maxFrameBytes)
  let used = 0, lineBytes = 0, cr = false, disabled = false
  const s = { version: 'wire-accounting-v1', submitted_bytes: 0, complete_sse_frames: 0,
    data_events: 0, comment_lines: 0, control_lines: 0, usage_events: 0, done_events: 0,
    empty_delta_events: 0, classified_frame_bytes: 0, payload_json_literal_bytes: 0,
    payload_string_tokens: 0, payload_escape_extra_bytes: 0,
    envelope_bytes: 0, content_utf8_bytes: 0, reasoning_utf8_bytes: 0,
    unclassified_bytes: 0, observation_complete: true }
  function frame() {
    s.complete_sse_frames++
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))
      const data = []
      for (const line of text.split(/\r\n|\r|\n/)) {
        if (line.startsWith(':')) s.comment_lines++
        else if (line) {
          const colon = line.indexOf(':'), field = colon < 0 ? line : line.slice(0, colon)
          let v = colon < 0 ? '' : line.slice(colon + 1)
          if (v.startsWith(' ')) v = v.slice(1)
          if (field === 'data') data.push(v)
          else s.control_lines++
        }
      }
      let literal = 0
      if (data.length) {
        s.data_events++
        const body = data.join('\n')
        if (body === '[DONE]') s.done_events++
        else {
          const parsed = JSON.parse(body), p = payloadSpans(body)
          if (parsed.usage != null) s.usage_events++
          if (parsed.choices?.some(c => c.delta && !c.delta.content && !c.delta.reasoning_content)) s.empty_delta_events++
          literal = p.literal
          s.content_utf8_bytes += p.content; s.reasoning_utf8_bytes += p.reasoning
          s.payload_string_tokens += p.strings
          s.payload_escape_extra_bytes += p.literal - 2 * p.strings - p.content - p.reasoning
        }
      }
      s.payload_json_literal_bytes += literal
      s.classified_frame_bytes += used; s.envelope_bytes += used - literal
    } catch { s.unclassified_bytes += used; s.observation_complete = false }
    used = 0
  }
  function newline() {
    if (!lineBytes) frame()
    lineBytes = 0
  }
  return {
    submit(bytes) {
      s.submitted_bytes += bytes.length
      for (let i = 0; i < bytes.length; i++) {
        if (disabled) { s.unclassified_bytes += bytes.length - i; break }
        const b = bytes[i]
        if (cr && b !== 10) { newline(); cr = false }
        if (used === maxFrameBytes) {
          s.unclassified_bytes += used + bytes.length - i; used = 0
          s.observation_complete = false; disabled = true; break
        }
        buffer[used++] = b
        if (cr && b === 10) { newline(); cr = false }
        else if (b === 13) cr = true
        else if (b === 10) newline()
        else lineBytes++
      }
    },
    finish() { if (cr && !disabled) { newline(); cr = false } },
    snapshot: () => ({ ...s, partial_tail_bytes: used, buffered_bytes: used,
      payload_literal_definition: 'Original JSON string token bytes including quotes, not reserialized JSON; excludes SSE data prefixes.' })
  }
}

export function createDurationHistogram() {
  const buckets = new Array(64).fill(0)
  let count = 0, sum = 0, max = 0
  return {
    add(ms) { count++; sum += ms; max = Math.max(max, ms); buckets[Math.min(63, Math.max(0, Math.ceil(Math.log2(Math.max(1, ms * 1000)))))]++ },
    snapshot: () => ({ count, sum_ms: sum, max_ms: max, upper_bound_us_pow2_buckets: [...buckets] })
  }
}
