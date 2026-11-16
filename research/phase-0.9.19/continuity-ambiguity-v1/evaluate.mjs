import { score as priorScore, summarize as priorSummarize } from '../continuity-long-v1/evaluate.mjs';
export { parseOutput } from '../continuity-long-v1/evaluate.mjs';
export const score = priorScore;
export function summarize(rows, plan, oracle) {
  const result = priorSummarize(rows, plan, oracle);
  const valid = rows.filter(r => r.capture_valid);
  const group = category => {
    const oo = oracle.filter(o => o.category === category);
    const rr = valid.filter(r => oo.some(o => o.story === r.story && o.turn === r.turn));
    return { planned: oo.length, assessed: rr.length, correct: rr.filter(r => r.score.canonical_exact).length,
      protocol_invalid: rr.filter(r => !r.score.protocol).length,
      unresolved: rr.filter(r => r.score.observed === 'UNRESOLVED').length,
      answer_checks_pass: rr.filter(r => r.score.answer_minimal).length };
  };
  const ambiguities = oracle.filter(o => o.kind === 'ambiguous').map(o => {
    const row = valid.find(r => r.story === o.story && r.turn === o.turn);
    const observed = row?.score.observed ?? null;
    return { story: o.story, turn: o.turn, directory: row?.directory ?? null,
      outcome: !row ? 'not_acquired' : !row.score.protocol ? 'protocol_invalid' : observed === 'UNRESOLVED' ? 'abstained' : 'unsupported_numeric_assignment',
      observed, clarification_lexical: row?.score.answer_minimal ?? null };
  });
  const confusion = oracle.filter(o => o.kind === 'return').map(o => {
    const row = valid.find(r => r.story === o.story && r.turn === o.turn);
    const others = oracle.filter(b => b.story === o.story && b.kind === 'birth' && b.turn < o.turn && b.task_key !== o.task_key);
    return { story: o.story, turn: o.turn, directory: row?.directory ?? null,
      observed: row?.score.observed ?? null, canonical_expected: o.expected,
      other_task_canonical_number: Boolean(row?.score.protocol && others.some(b => b.expected === row.score.observed)) };
  });
  return { ...result, groups: Object.fromEntries(['birth', 'clear-return', 'ambiguous', 'clarified-return'].map(c => [c, group(c)])),
    ambiguities, confusion, other_task_assignments: confusion.filter(x => x.other_task_canonical_number).length,
    unnecessary_abstentions: valid.filter(r => r.score.kind !== 'ambiguous' && r.score.observed === 'UNRESOLVED').length,
    strict_local_criterion_met: result.trajectories.length === 2 && result.trajectories.every(t => t.all_markers_correct)
      && ambiguities.every(a => a.outcome === 'abstained' && a.clarification_lexical === true) };
}
