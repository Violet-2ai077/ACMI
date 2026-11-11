const escape = s => s.replace(/[.*+?^{}()|[\]\\$]/gu, '\\$&')

export function literalMentions(text, catalog) {
  if (typeof text !== 'string' || text.length > 4096 || catalog.length > 8) throw new Error('MENTION_INPUT_LIMIT')
  const observations = []
  const refs = new Set()
  for (const { ref, task } of catalog) {
    if (typeof ref !== 'string' || !/^q-[a-f0-9]{5}$/u.test(ref) || refs.has(ref)
      || typeof task !== 'string' || !task.trim() || task.length > 120) throw new Error('MENTION_CATALOG_INVALID')
    refs.add(ref)
    const pattern = new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])' + escape(task)
      + '(?![\\p{L}\\p{M}\\p{N}_])', 'giu')
    for (const match of text.matchAll(pattern)) {
      const start_utf16 = match.index, quote = match[0]
      observations.push({ ref, start_utf16, end_utf16: start_utf16 + quote.length, quote })
      if (observations.length > 24) throw new Error('MENTION_OUTPUT_LIMIT')
    }
  }
  return observations.sort((a, b) => a.start_utf16 - b.start_utf16 || a.end_utf16 - b.end_utf16 || a.ref.localeCompare(b.ref))
}
