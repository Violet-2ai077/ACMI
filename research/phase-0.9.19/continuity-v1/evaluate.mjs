export function parseOutput(content) {
  if (typeof content !== 'string') return { valid: false, error: 'not_string', marker: null, answer: null };
  const markers = content.match(/<\|task:/g) ?? [], match = /<\|task:([1-9][0-9]{0,2}|UNRESOLVED)\|>\s*$/.exec(content);
  if (markers.length !== 1 || !match) return { valid: false, error: 'missing_duplicate_or_malformed_marker', marker: null, answer: null };
  const answer = content.slice(0, match.index).trim();
  if (!answer || /```\s*$/.test(answer)) return { valid: false, error: 'empty_answer_or_fenced_marker', marker: null, answer: null };
  return { valid: true, error: null, marker: match[1], answer };
}
export function score(content, oracle) {
  const parsed = parseOutput(content);
  const checks = parsed.valid ? oracle.answerChecks.map(options => ({ options, pass: options.some(p => new RegExp(p, 'iu').test(parsed.answer)) })) : null;
  const exact = parsed.valid && parsed.marker === oracle.expected;
  return { protocol: parsed.valid, protocol_error: parsed.error, expected: oracle.expected, observed: parsed.marker,
    kind: oracle.kind, canonical_exact: exact, answer_minimal: checks === null ? null : checks.every(c => c.pass), answer_checks: checks, answer: parsed.answer,
    error_location: exact ? null : { raw_field: '/content', expected_suffix: `<|task:${oracle.expected}|>`, observed_marker: parsed.marker } };
}
const numeric = row => row?.capture_valid && row.score?.protocol && /^[1-9][0-9]{0,2}$/.test(row.score.observed);

export function summarize(rows, plan, oracle) {
  if (!oracle) throw new Error('oracle_required_for_birth_anchors');
  const valid = rows.filter(r => r.capture_valid);
  const find = (story, turn) => valid.find(r => r.story === story && r.turn === turn);
  const returns = oracle.filter(o => o.kind === 'return').map(o => {
    const row = find(o.story, o.turn), birthOracle = oracle.filter(b => b.story === o.story && b.kind === 'birth' && b.turn <= o.turn);
    const births = birthOracle.map(b => ({ oracle: b, row: find(b.story, b.turn) }));
    const target = births.find(b => b.oracle.turn === o.birth_turn)?.row;
    const base = { story: o.story, turn: o.turn, birth_turn: o.birth_turn, canonical_expected: o.expected,
      actual_birth_marker: target?.score?.observed ?? null, observed: row?.score?.observed ?? null,
      birth_directory: target?.directory ?? null, return_directory: row?.directory ?? null,
      canonical_exact: row?.score?.canonical_exact ?? null };
    if (!row) return { ...base, assessable: false, restored: null, reason: 'return_not_acquired' };
    if (births.some(b => !numeric(b.row))) return { ...base, assessable: false, restored: null, reason: 'birth_missing_invalid_or_unresolved',
      invalid_birth_turns: births.filter(b => !numeric(b.row)).map(b => b.oracle.turn) };
    const ids = births.map(b => b.row.score.observed);
    if (new Set(ids).size !== ids.length) return { ...base, assessable: false, restored: null, reason: 'birth_marker_collision' };
    const restored = row.score.protocol && row.score.observed === target.score.observed;
    let reason = null;
    if (!restored) {
      if (!row.score.protocol) reason = 'return_protocol_invalid';
      else if (row.score.observed === 'UNRESOLVED') reason = 'unnecessary_abstention';
      else if (row.score.observed === find(o.story, o.turn - 1)?.score?.observed) reason = 'previous_task_marker_reused';
      else if (ids.includes(row.score.observed)) reason = 'other_established_task_marker';
      else reason = 'fresh_marker_on_return';
    }
    return { ...base, assessable: true, restored, reason };
  });
  const byKind = ['birth', 'continue', 'return'].map(kind => {
    const rr = valid.filter(r => r.score.kind === kind);
    return { kind, planned: oracle.filter(o => o.kind === kind).length, assessed: rr.length,
      correct: rr.filter(r => r.score.canonical_exact).length, protocol_invalid: rr.filter(r => !r.score.protocol).length,
      unresolved: rr.filter(r => r.score.observed === 'UNRESOLVED').length };
  });
  const trajectories = [...new Set(plan.schedule.map(c => c.story))].map(story => {
    const rr = valid.filter(r => r.story === story).sort((a, b) => a.turn - b.turn);
    return { story, complete_turns: rr.length, complete: rr.length === 6, all_markers_correct: rr.length === 6 && rr.every(r => r.score.canonical_exact),
      sequence: rr.map(r => ({ turn: r.turn, kind: r.score.kind, expected: r.score.expected, observed: r.score.observed, correct: r.score.canonical_exact })) };
  });
  return { planned_calls: plan.schedule.length, actual_calls: rows.filter(r => r.invoked).length,
    completed_attempts: rows.filter(r => r.outcome === 'complete').length, failed_attempts: rows.filter(r => r.outcome !== 'complete').length,
    evidence_incomplete: rows.filter(r => !r.capture_valid).length, retry_calls: rows.filter(r => r.attempt > 1 && r.invoked).length,
    not_sent: plan.schedule.filter(c => !rows.some(r => r.index === c.index && r.invoked)),
    protocol: { correct: valid.filter(r => r.score.protocol).length, assessed: valid.length },
    canonical: { correct: valid.filter(r => r.score.canonical_exact).length, assessed: valid.length, planned: 24 },
    by_kind: byKind,
    conditional_restoration: { correct: returns.filter(r => r.restored === true).length, assessed: returns.filter(r => r.assessable).length,
      unassessable: returns.filter(r => !r.assessable).length, planned: returns.length }, returns,
    answer_minimal: { correct: valid.filter(r => r.score.answer_minimal).length, assessed: valid.filter(r => typeof r.score.answer_minimal === 'boolean').length },
    trajectories, strict_local_criterion_met: trajectories.length === 4 && trajectories.every(t => t.all_markers_correct) };
}
