import { summarize as previous } from '../continuity-ambiguity-v1/evaluate.mjs';
export { parseOutput, score } from '../continuity-ambiguity-v1/evaluate.mjs';
export function summarize(rows, plan, oracle) {
  const r = previous(rows, plan, oracle), rr = rows.filter(x => x.capture_valid && x.score.kind === 'continue');
  return { ...r, groups: { ...r.groups, continue: { planned: oracle.filter(o => o.kind === 'continue').length, assessed: rr.length,
    correct: rr.filter(x => x.score.canonical_exact).length, protocol_invalid: rr.filter(x => !x.score.protocol).length,
    unresolved: rr.filter(x => x.score.observed === 'UNRESOLVED').length, answer_checks_pass: rr.filter(x => x.score.answer_minimal).length } },
    ambiguity_strategy: r.ambiguities.map(a => {
      const o = oracle.find(o => o.story === a.story && o.turn === a.turn);
      return { ...a, candidate_markers: o.candidate_markers, most_recent_candidate: o.most_recent_candidate,
        numeric_candidate: o.candidate_markers.includes(a.observed), chose_recent_candidate: a.observed === o.most_recent_candidate,
        interpretation: 'descriptive strategy only; no alternative PASS and no inference of intent or internal algorithm' };
    }) };
}
