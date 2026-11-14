import { scoreAttempt, scoreSets } from '../evaluator/score.mjs'

// Frozen finite lexical assertions are diagnostics, not an LLM-quality judge.
export function checkDevelopmentAnswers(gold, raw, arm) {
  return gold.answer.map(a => {
    const text = arm === 'C0' ? raw.answer.map(b => b.text).join('\n') : raw.answer.filter(b => b.decision_ids.some(id => raw.workState?.decisions.find(d => d.decision_id === id)?.unit_id === a.unit_id)).map(b => b.text).join('\n')
    if (!a.assertion || !Array.isArray(a.assertion.all) || !a.assertion.all.length) throw new Error('missing frozen answer predicate')
    return { unit_id: a.unit_id, passed: raw.valid && a.assertion.all.every(pattern => new RegExp(pattern, 'iu').test(text)) }
  })
}

export function scoreDevelopmentAttempt(args) {
  const arm = args.attempt.arm ?? args.inputPacket.arm, checks = checkDevelopmentAnswers(args.oracle, args.rawPrediction, arm)
  if (arm === 'C0') return { arm, answer_checks: checks, answer_passed: checks.every(c => c.passed), attribution_applicable: false }
  const result = scoreAttempt(args)
  result.legacy_literal_answer_passed = result.answer_passed
  result.answer_passed = checks.every(c => c.passed)
  result.answer_checks = checks
  result.failure_codes = result.failure_codes.filter(code => code !== 'A-ASSERTION')
  if (!result.answer_passed) result.failure_codes.push('A-ASSERTION')
  const predicted = args.rawPrediction.valid ? args.rawPrediction.workState.decisions : []
  const scopes = ds => ds.flatMap(d => [
    ...d.resolved_scope_quotes.map(q => [d.unit_id, 'resolved', q]),
    ...d.unresolved_scope_quotes.map(q => [d.unit_id, 'unresolved', q])
  ])
  result.literal_scope_match = scoreSets(scopes(predicted), scopes(args.oracle.decisions))
  result.forbidden_operation_count = predicted.reduce((n,d) => n + d.actions.filter(a => args.oracle.negative_cases.find(c => c.unit_id === d.unit_id)?.forbidden_operations.includes(a.op)).length, 0)
  result.answer_metric_kind = 'frozen-finite-lexical-diagnostic'
  result.state_metric_kind = 'exact-structured-atoms-with-literal-evidence-references'
  return result
}
