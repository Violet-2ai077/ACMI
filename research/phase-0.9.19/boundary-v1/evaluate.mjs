export const LABELS = ['CONTINUE', 'NEW', 'UNRESOLVED'];

export function parseOutput(content) {
  if (typeof content !== 'string') return { valid: false, error: 'not_string', label: null, answer: null };
  const markers = content.match(/<\|boundary:/g) ?? [];
  const match = /<\|boundary:(CONTINUE|NEW|UNRESOLVED)\|>\s*$/.exec(content);
  if (markers.length !== 1 || !match) return { valid: false, error: 'missing_duplicate_or_malformed_marker', label: null, answer: null };
  const answer = content.slice(0, match.index).trim();
  if (!answer || /```\s*$/.test(answer)) return { valid: false, error: 'empty_answer_or_fenced_marker', label: null, answer: null };
  return { valid: true, error: null, label: match[1], answer };
}

export function score(content, oracle) {
  const parsed = parseOutput(content);
  const checks = parsed.valid ? oracle.answerChecks.map(options => ({ options, pass: options.some(p => new RegExp(p, 'iu').test(parsed.answer)) })) : null;
  let errorType = null;
  if (!parsed.valid) errorType = 'protocol_invalid';
  else if (parsed.label !== oracle.expected) {
    if (oracle.expected === 'CONTINUE' && parsed.label === 'NEW') errorType = 'false_split';
    else if (oracle.expected === 'NEW' && parsed.label === 'CONTINUE') errorType = 'false_merge';
    else if (parsed.label === 'UNRESOLVED') errorType = 'unnecessary_abstention';
    else errorType = 'missed_ambiguity';
  }
  return { protocol: parsed.valid, protocol_error: parsed.error, expected: oracle.expected, observed: parsed.label,
    scored_boundary: oracle.scored_boundary, boundary_exact: oracle.scored_boundary ? parsed.valid && parsed.label === oracle.expected : null,
    initialization_correct: oracle.scored_boundary ? null : parsed.valid && parsed.label === 'CONTINUE',
    error_type: errorType, answer_nonempty: parsed.valid ? true : null,
    answer_minimal: checks === null ? null : checks.every(c => c.pass), answer_checks: checks, answer: parsed.answer,
    error_location: errorType ? { raw_field: '/content', expected_suffix: `<|boundary:${oracle.expected}|>`, actual_label: parsed.label } : null };
}

export function summarize(rows, plan) {
  const complete = rows.filter(r => r.capture_valid);
  const boundary = complete.filter(r => r.score.scored_boundary);
  const confusion = Object.fromEntries(LABELS.map(expected => [expected, Object.fromEntries([...LABELS, 'PROTOCOL_INVALID'].map(label => [label, 0]))]));
  for (const r of boundary) confusion[r.score.expected][r.score.observed ?? 'PROTOCOL_INVALID']++;
  const by = field => [...new Set(boundary.map(r => r[field]))].map(value => {
    const rr = boundary.filter(r => r[field] === value);
    return { [field]: value, assessed: rr.length, correct: rr.filter(r => r.score.boundary_exact).length,
      false_split: rr.filter(r => r.score.error_type === 'false_split').length, false_merge: rr.filter(r => r.score.error_type === 'false_merge').length,
      unnecessary_abstention: rr.filter(r => r.score.error_type === 'unnecessary_abstention').length,
      missed_ambiguity: rr.filter(r => r.score.error_type === 'missed_ambiguity').length,
      protocol_invalid: rr.filter(r => !r.score.protocol).length };
  });
  const trajectories = [...new Set(plan.schedule.map(c => c.story))].map(story => {
    const rr = complete.filter(r => r.story === story).sort((a, b) => a.turn - b.turn);
    let actualSegment = 1, expectedSegment = 1;
    const sequence = rr.map(r => {
      if (r.turn > 1 && r.score.observed === 'NEW') actualSegment++;
      if (r.turn > 1 && r.score.expected === 'NEW') expectedSegment++;
      return { turn: r.turn, expected: r.score.expected, observed: r.score.observed,
        expected_segment: r.score.expected === 'UNRESOLVED' ? null : expectedSegment,
        observed_segment: !r.score.protocol || r.score.observed === 'UNRESOLVED' ? null : actualSegment };
    });
    return { story, complete_turns: rr.length, complete: rr.length === 8, all_boundaries_correct: rr.length === 8 && rr.every(r => r.score.protocol && (r.turn === 1 ? r.score.initialization_correct : r.score.boundary_exact)), sequence };
  });
  return { planned_calls: plan.schedule.length, actual_calls: rows.filter(r => r.invoked).length,
    completed_attempts: rows.filter(r => r.outcome === 'complete').length, failed_attempts: rows.filter(r => r.outcome !== 'complete').length,
    evidence_incomplete: rows.filter(r => !r.capture_valid).length, retry_calls: rows.filter(r => r.attempt > 1 && r.invoked).length,
    not_sent: plan.schedule.filter(c => !rows.some(r => r.index === c.index && r.invoked)),
    protocol: { correct: complete.filter(r => r.score.protocol).length, assessed: complete.length },
    boundary: { correct: boundary.filter(r => r.score.boundary_exact).length, assessed: boundary.length, planned: 28 },
    resolved: { correct: boundary.filter(r => r.score.expected !== 'UNRESOLVED' && r.score.boundary_exact).length, assessed: boundary.filter(r => r.score.expected !== 'UNRESOLVED').length },
    ambiguous: { correct: boundary.filter(r => r.score.expected === 'UNRESOLVED' && r.score.boundary_exact).length, assessed: boundary.filter(r => r.score.expected === 'UNRESOLVED').length },
    answer_minimal: { correct: complete.filter(r => r.score.answer_minimal).length, assessed: complete.filter(r => typeof r.score.answer_minimal === 'boolean').length },
    confusion, by_story: by('story'), by_category: by('category'), trajectories,
    strict_local_criterion_met: trajectories.length === 4 && trajectories.every(t => t.all_boundaries_correct) };
}
