import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeArchive } from './forensics.mjs';

function fixture(id, { intent = 'continue_current', predicted = 'uncertain',
  targetState = 'open', candidates = ['t'], changes = [], omitted = 0,
  unresolved = [], family = 'explicit_continue' } = {}) {
  const expected = { intent, taskId: intent === 'uncertain' ? null : 't',
    retrievalTarget: 't', changes, evidence: ['turn-0'], unresolved };
  const scenario = { id, family, split: 'holdout', language: 'mixed', risk: 'high',
    labelProvenance: 'ai_provisional_not_human_reviewed', humanReviewStatus: 'pending',
    turns: [{ id: 'turn-0', actor: 'user' }], expected,
    tasks: [{ taskId: 't', status: targetState, foreign: false }] };
  const common = { caseId: id, family, split: scenario.split };
  const row = { ...common, language: scenario.language, risk: scenario.risk,
    mode: 'structured', expected: intent, expectedTaskId: expected.taskId,
    expectedClaims: changes, expectedUnresolved: unresolved,
    prediction: predicted && { intent: predicted, claims: [], taskId: predicted === intent ? expected.taskId : null },
    guard: { status: predicted === 'uncertain' ? 'qualified' : 'withheld', changes: [], reasons: [] },
    error: predicted ? null : 'input-budget', omittedTurns: omitted, packetUnits: 7 };
  const retrieval = { ...common, target: 't', candidates, pos: candidates.indexOf('t') + 1, unauthorized: 0 };
  return { scenario, row, retrieval };
}

function analyze(...fixtures) {
  return analyzeArchive(fixtures.map(f => f.scenario), {
    rows: fixtures.map(f => f.row), candidateRuns: fixtures.map(f => f.retrieval),
  });
}

test('separates closed references, construction failures, abstentions and graph claims', () => {
  const closed = fixture('closed', { intent: 'uncertain', targetState: 'closed',
    candidates: [], unresolved: ['closed-target-needs-review'] });
  const budget = fixture('budget', { predicted: null, omitted: 1 });
  const abstained = fixture('abstained', { changes: ['decision-proposed', 'next-action'] });
  const matched = fixture('matched', { predicted: 'continue_current', changes: ['objective'] });
  const { catalog, aggregate } = analyze(closed, budget, abstained, matched);
  const byId = Object.fromEntries(catalog.map(c => [c.scenario_id, c]));

  assert.equal(byId.closed.candidate_retrieval_status.status, 'closed_reference_not_retrieved');
  assert.equal(byId.closed.abstention_appropriateness, 'lifecycle_review_required');
  assert.equal(byId.closed.observed.raw_intent_match, true);
  assert.equal(byId.budget.primary_failure_class, 'A');
  assert.equal(byId.budget.observed.raw_intent_match, false);
  assert.equal(byId.budget.abstention_appropriateness, 'not_an_abstention');
  assert.equal(byId.abstained.abstention_appropriateness, 'mismatch_with_provisional_intent');
  assert.equal(byId.matched.observed.raw_intent_match, true);
  assert.equal(byId.matched.observed.guard.status, 'withheld');
  assert.ok(catalog.every(c => c.retrospective_only));
  assert.equal(aggregate.overall.scenarios, 4);
  assert.equal(aggregate.overall.abstentions, 2);
  assert.equal(aggregate.overall.missed_graph_claims, 3);
  assert.equal(aggregate.overall.candidate_misses, 1);
  assert.deepEqual(aggregate.graph_claim_misses.by_output_path, {
    empty_output_coincident_with_abstention: 2,
    empty_output_despite_matching_raw_intent: 1,
  });
});

test('records original false-split versus a disputed provisional reading without changing the label', () => {
  const { catalog, aggregate } = analyze(fixture('q91-5b7133b8bef7c35f', {
    predicted: 'create_new', family: 'subagent_completed_not_accepted',
  }));
  assert.equal(catalog[0].expected_provisional_label.intent, 'continue_current');
  assert.equal(catalog[0].original_prediction.intent, 'create_new');
  assert.equal(catalog[0].false_split_risk, 'observed_against_provisional_label');
  assert.equal(catalog[0].label_disputed, true);
  assert.equal(aggregate.overall.false_splits, 1);
});

test('rejects a duplicate prediction or an inconsistent archived candidate rank', () => {
  const f = fixture('duplicate');
  assert.throws(() => analyzeArchive([f.scenario], {
    rows: [f.row, f.row], candidateRuns: [f.retrieval],
  }), /Duplicate structured prediction/);
  f.retrieval.pos = 2;
  assert.throws(() => analyze(f), /Candidate rank mismatch/);
});
