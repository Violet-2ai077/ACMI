import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = 'retrospective_analysis_only';
const labelProvenance = 'ai_provisional_not_human_reviewed';
const expectedInputs = {
  'scenarios.json': '41a8b54f18f6b8b9be463128a4a403949a2ecf41eb111a3dc40da32613e6d091',
  'results.json': 'c0fb13297a9d168cf79e17d1d12b9598b9b5b088b706c725351705587e381968',
  'confusion-matrices.json': '14e3202c6dada09cf50998f616b131ce2b5e3916227821616a4a84826779dca2',
  'split-manifest.json': 'fae4a2cb8ff063b9ff30f96e1e24c20cd2fab86719c75b2cac37df0e7f942c96',
  'holdout-freeze.json': '9b2291e1499d3df8cc82b4e68c9b3bb3cbb7e35f0fece2deb509314cd8a79ea4',
  'holdout-consumed.json': '7534aa55ee7f1aa5fb8cdd1e9a2fd5454a5965c71afd487b4d5475dd16c86f6c',
};

const layers = {
  A: { name: 'Input / Context Construction', opportunities: [
    'missing current request context', 'missing decisions or candidate summaries',
    'incomplete Session / Task timeline or Runtime Facts', 'missing cross-Session references',
    'history budget / packet construction failure',
  ], intervention: 'Use bounded typed context and explicit missing/omitted indicators; preserve current user input.' },
  B: { name: 'Candidate Retrieval', opportunities: [
    'provisional reference outside Top-k or ranked below peers', 'similar objective/title or same topic',
    'misleading current binding or recency', 'closed history omitted from actionable candidates',
    'target absent from fixture',
  ], intervention: 'Separate a read-only historical reference from actionable candidates; audit rank and policy eligibility independently.' },
  C: { name: 'Intent Reasoning', opportunities: [
    'continue vs switch vs create', 'no task vs unresolved work', 'implicit continuity or return',
    'same project distinct objective', 'correction vs new task', 'discussion vs execution',
    'interruption vs completion',
  ], intervention: 'Classify the user act and goal first; resolve identity separately from topic and binding.' },
  D: { name: 'Temporal / State Reasoning', opportunities: [
    'active vs waiting vs paused vs closed', 'Task vs WorkNode', 'wait vs mainline advance',
    'reopen or supersession', 'execution completion vs consumption vs acceptance', 'Join vs mainline advance',
  ], intervention: 'Track lifecycle, work node, result, join and mainline as distinct typed state; require explicit host transitions.' },
  E: { name: 'Evidence / Pragmatics', opportunities: [
    'assistant suggestion vs user decision', 'question or condition vs approval', 'negation/correction',
    'tool metadata vs content', 'unsupported result summary', 'source does not entail claim', 'ignored counterevidence',
  ], intervention: 'Preserve speaker, provenance, polarity, conditions and content spans; verify each proposal claim separately.' },
  F: { name: 'Output / Policy', opportunities: [
    'invalid schema / missing fields', 'ID outside candidate scope', 'abstention or forced commitment',
    'proposal missing or inconsistent with intent', 'unsupported proposal', 'guard withholding distinct from understanding',
  ], intervention: 'Keep original outputs and guard dispositions separate; emit typed unresolved reasons and a separate review-only claim head.' },
};

const stateFamilies = new Set([
  'a_b_a_interleaving', 'cross_session_reference', 'join_not_satisfied', 'result_consumed_not_accepted',
  'stale_task_candidate', 'subagent_completed_not_accepted', 'task_reopen', 'task_supersession',
  'temporary_interruption', 'tool_result_not_task_completion',
]);
const pragmaticFamilies = new Set([
  'assistant_suggestion_not_user_decision', 'conflicting_decisions', 'prompt_injection_in_tool_output', 'user_correction',
]);
const missingReference = new Set(['missing-referent', 'missing_reference', 'missing_candidate']);
const ambiguousReference = new Set([
  'ambiguous-referent', 'ambiguous_reference', 'ambiguous-reopen-target', 'conflicting-approvals',
  'conflicting-references', 'replacement-target-unclear',
]);
const disputes = {
  'q91-00b07578c26e840f': 'A discrete note for an interrupted workflow could be an ephemeral action, not a new persistent Task; the five-way label conflates those decisions.',
  'q91-187f781292574ed7': 'A request to list a patrol route separately can mean a revision within the handoff task or a distinct deliverable; rejecting PIN publication is not ambiguous.',
  'q91-5b7133b8bef7c35f': 'Checking weekend backlog can be a conditional continuation of routing-policy review or a separate analysis deliverable. It is not result acceptance.',
};
const readableExamples = {
  'q91-00a1afe6206fadf2': 'The shared project name does not make cup handoff logistics the same objective as clock synchronization.',
  'q91-05477d9278d340eb': 'The user explicitly distinguishes the camp generator from the station system and requests a different deliverable.',
  'q91-28d392ce36d2c793': 'Lost-ticket replacement and route trial pacing have different deliverables despite a shared route.',
  'q91-4a777fc426202273': 'A private incident register is separate from a public-map legend; the user also states a negative scope constraint.',
  'q91-a7d4853a86ec533e': 'The user asks for a separate vendor no-show procedure, not a stage-checklist revision.',
  'q91-adfcde60e0348e51': 'The current request explicitly defers the map, resumes a prior hall test, and refers to the final-row measurement.',
  'q91-9472249fd6018a2e': 'The user explicitly denies a device change or revision request; the gloss is informational.',
};

function indexUnique(rows, key, description) {
  const out = new Map();
  for (const row of rows) {
    const id = row[key];
    assert.equal(typeof id, 'string', `Invalid ${description} ID`);
    assert(!out.has(id), `Duplicate ${description}: ${id}`);
    out.set(id, row);
  }
  return out;
}

function retrievalStatus(scenario, retrieval) {
  const target = retrieval.target;
  const rank = target === null ? null : retrieval.candidates.indexOf(target) + 1;
  assert.equal(retrieval.pos, rank, `Candidate rank mismatch: ${scenario.id}`);
  const fixture = scenario.tasks.find(task => task.taskId === target);
  const fixtureStatus = target === null ? 'not_applicable' : !fixture ? 'absent' : fixture.foreign ? 'foreign' : fixture.status;
  let status = 'not_applicable';
  if (target !== null) {
    if (rank > 0 && rank <= 8) status = 'top_8_present';
    else if (fixtureStatus === 'closed') status = 'closed_reference_not_retrieved';
    else if (fixtureStatus === 'foreign') status = 'foreign_reference_not_retrieved';
    else if (fixtureStatus === 'absent') status = 'reference_absent_from_fixture';
    else status = 'eligible_reference_not_retrieved';
  }
  return { status, provisional_reference: target, fixture_status: fixtureStatus, rank: rank || null,
    archived_position: retrieval.pos, candidate_ids: retrieval.candidates,
    unauthorized_count: retrieval.unauthorized, was_current_binding: target !== null && target === scenario.binding };
}

function inferability(scenario, row, candidate) {
  const { expected, id, turns } = scenario;
  const turnById = new Map(turns.map(turn => [turn.id, turn]));
  const citations = expected.evidence.map(evidenceId => ({
    turn_id: evidenceId, actor: turnById.get(evidenceId)?.actor ?? null,
  }));
  const blocked = row.error === 'input-budget';
  let context = blocked ? 'packet_construction_blocked' : 'no_construction_gap_logged_not_proof_of_sufficiency';
  let evidence = citations.every(citation => citation.actor !== null) && citations.length
    ? 'provisional_citations_present_entailment_unverified' : 'no_complete_provisional_citation_set';
  let inference = 'not_assessed_from_archived_trace';
  if (blocked) {
    evidence = 'not_delivered_due_to_packet_budget';
    inference = 'not_from_unbuilt_packet';
  } else if (expected.unresolved.some(reason => missingReference.has(reason))) {
    context = 'missing_referent_indicated_by_provisional_label';
    evidence = 'insufficient_for_reference_resolution_per_provisional_label';
    inference = 'cannot_resolve_reference_as_annotated';
  } else if (expected.unresolved.includes('closed-target-needs-review')) {
    context = candidate.fixture_status === 'closed' ? 'closed_reference_visible_in_fixture' : 'closed_reference_per_provisional_label';
    evidence = 'not_authority_for_reopen_or_new_task';
    inference = 'can_identify_lifecycle_question_not_authorize_route';
  } else if (expected.unresolved.includes('workspace-boundary')) {
    context = 'workspace_scope_boundary_indicated_by_provisional_label';
    evidence = 'not_authority_for_out_of_scope_action';
    inference = 'do_not_resolve_out_of_scope_reference';
  } else if (expected.unresolved.some(reason => ambiguousReference.has(reason))) {
    context = 'ambiguity_indicated_by_provisional_label';
    evidence = 'insufficient_for_unique_reading_per_provisional_label';
    inference = 'clarification_reasonable_as_annotated';
  } else if (disputes[id]) {
    context = 'task_boundary_ambiguous_on_retrospective_review';
    evidence = 'multiple_plausible_task_boundary_readings';
    inference = 'act_may_be_clear_but_task_boundary_is_disputed';
  } else if (readableExamples[id]) {
    inference = 'provisional_intent_reasonably_inferable_from_fixture_on_retrospective_review';
  } else if (row.omittedTurns > 0) {
    context = 'omitted_turns_logged_effect_unknown';
  }
  return { context, evidence, inference, citations };
}

function abstentionAssessment(scenario, diagnostics, abstained) {
  if (!abstained) return 'not_an_abstention';
  if (scenario.expected.intent !== 'uncertain') {
    if (disputes[scenario.id]) return 'plausible_caution_label_disputed';
    return 'mismatch_with_provisional_intent';
  }
  if (diagnostics.inference === 'can_identify_lifecycle_question_not_authorize_route') return 'lifecycle_review_required';
  if (diagnostics.inference === 'do_not_resolve_out_of_scope_reference') return 'scope_restraint_supported';
  if (diagnostics.inference === 'cannot_resolve_reference_as_annotated') return 'missing_referent_supports_abstention_as_annotated';
  if (diagnostics.inference === 'clarification_reasonable_as_annotated') return 'ambiguity_supports_abstention_as_annotated';
  return 'matches_provisional_uncertain_no_independent_adjudication';
}

function diagnoseCase(s, row, candidate) {
  const rawIntent = row.prediction?.intent ?? 'invalid';
  const intentMatch = rawIntent === s.expected.intent;
  const abstained = rawIntent === 'uncertain';
  const rawExisting = rawIntent === 'continue_current' || rawIntent === 'switch_existing';
  const expectedExisting = s.expected.intent === 'continue_current' || s.expected.intent === 'switch_existing';
  const falseMerge = rawExisting && s.expected.intent === 'create_new';
  const falseSplit = expectedExisting && rawIntent === 'create_new';
  const wrongTask = rawExisting && expectedExisting && row.prediction.taskId !== s.expected.taskId;
  const diagnostics = inferability(s, row, candidate);
  const thematicLens = stateFamilies.has(s.family) ? 'D' : pragmaticFamilies.has(s.family) ? 'E' : 'C';
  const missedClaims = s.expected.changes;
  // The archived structured mode emitted no claims; do not introduce a replacement claim scorer.
  assert.equal(row.prediction?.claims.length ?? 0, 0, `Unexpected archived structured claims: ${s.id}`);
  const graphPath = !missedClaims.length ? null : rawIntent === 'invalid' ? 'no_prediction' : abstained
    ? 'empty_output_coincident_with_abstention' : intentMatch
      ? 'empty_output_despite_matching_raw_intent' : 'empty_output_with_raw_intent_mismatch';
  const withheld = row.guard.status === 'withheld';
  const errorClasses = [
    [!intentMatch, 'raw_intent_mismatch'], [wrongTask, 'wrong_task_id'],
    [rawIntent === 'invalid', 'missing_or_invalid_raw_output'], [falseMerge, 'false_merge'], [falseSplit, 'false_split'],
    [s.expected.intent === 'uncertain' && (rawExisting || rawIntent === 'create_new'), 'forced_task_on_provisional_uncertainty'],
    [abstained, 'raw_abstention'], [missedClaims.length, 'expected_graph_claim_not_emitted'],
    [candidate.provisional_reference !== null && candidate.status !== 'top_8_present', 'provisional_reference_not_in_top_8'],
    [withheld, 'host_guard_withheld'],
  ].filter(([applies]) => applies).map(([, code]) => code);
  let primary = null;
  let root = { status: 'no_attributed_failure', code: null };
  if (row.error === 'input-budget') {
    primary = 'A';
    root = { status: 'observed_blocking_condition', code: 'input_budget_prevented_prediction' };
  } else if (!intentMatch && candidate.status === 'eligible_reference_not_retrieved' && expectedExisting) {
    primary = 'B';
    root = { status: 'observed_limitation_causation_not_established', code: 'eligible_reference_not_retrieved' };
  } else if (rawIntent === 'invalid') {
    primary = 'F';
    root = { status: 'observed_symptom_mechanism_unresolved', code: 'invalid_raw_output' };
  } else if (abstained && !intentMatch) {
    primary = 'F';
    root = { status: 'observed_symptom_mechanism_unresolved', code: 'abstention_on_provisionally_resolved_intent' };
  } else if (!intentMatch || wrongTask) {
    primary = thematicLens;
    root = { status: 'retrospective_hypothesis_not_mechanism', code: falseMerge ? 'shared_topic_vs_distinct_objective'
      : falseSplit ? 'existing_work_or_work_node_vs_new_task' : 'raw_intent_or_identity_mismatch' };
  } else if (missedClaims.length) {
    primary = 'F';
    root = { status: 'observed_symptom_mechanism_unresolved', code: 'expected_graph_claim_not_emitted' };
  }

  return {
    scenario_id: s.id, original_split: s.split, family: s.family, language: s.language, risk: s.risk,
    turn_count: s.turns.length, label_provenance: s.labelProvenance, human_review_status: s.humanReviewStatus,
    original_prediction: row.prediction, expected_provisional_label: s.expected,
    error_classes: errorClasses, primary_failure_class: primary, primary_root_cause: root,
    contributing_factors: {
      scenario_thematic_lens: thematicLens, basis: 'family describes a diagnostic opportunity, not proven internal causation',
      witness_note: readableExamples[s.id] ?? disputes[s.id] ?? null,
    },
    candidate_retrieval_status: candidate, context_sufficiency: diagnostics.context,
    evidence_sufficiency: diagnostics.evidence, model_could_reasonably_infer_answer: diagnostics.inference,
    abstention_appropriateness: abstentionAssessment(s, diagnostics, abstained),
    false_merge_risk: falseMerge ? 'observed_against_provisional_label' : 'not_observed',
    false_split_risk: falseSplit ? 'observed_against_provisional_label' : 'not_observed',
    recommended_architecture_intervention: primary ? layers[primary].intervention
      : candidate.status === 'closed_reference_not_retrieved' ? layers.B.intervention : null,
    thematic_architecture_intervention: !intentMatch || missedClaims.length ? layers[thematicLens].intervention : null,
    label_disputed: Object.hasOwn(disputes, s.id), label_dispute_note: disputes[s.id] ?? null,
    observed: {
      raw_intent: rawIntent, raw_intent_match: intentMatch, raw_abstention: abstained,
      guard: row.guard, error: row.error, response_hash: row.responseHash ?? null,
      prediction_provenance: row.provenance ?? null,
      packet_units: row.packetUnits, omitted_turns: row.omittedTurns, cited_turns: diagnostics.citations,
      fixture_current_binding: s.binding ?? null, fixture_task_count: s.tasks.length,
      fixture_runtime_fact_count: s.runtimeFacts?.length ?? 0,
      fixture_session_count: new Set(s.turns.map(turn => turn.session)).size,
      missed_graph_claims: missedClaims, graph_claim_output_path: graphPath,
    },
    usage, retrospective_only: true,
  };
}

function counts(items) {
  const sorted = [...items].sort();
  const tally = new Map();
  for (const item of sorted) tally.set(item, (tally.get(item) ?? 0) + 1);
  return Object.fromEntries(tally);
}

function primaryCounts(records) {
  const zeros = Object.fromEntries(Object.keys(layers).map(key => [key, 0]));
  return { ...zeros, none: 0, ...counts(records.map(r => r.primary_failure_class ?? 'none')) };
}

const has = (record, code) => record.error_classes.includes(code);

function cohort(records) {
  const count = predicate => records.filter(predicate).length;
  const top = k => count(r => r.candidate_retrieval_status.rank !== null && r.candidate_retrieval_status.rank <= k);
  return {
    scenarios: records.length,
    raw_intent_matches: count(r => r.observed.raw_intent_match),
    raw_intent_mismatches: count(r => !r.observed.raw_intent_match),
    abstentions: count(r => r.observed.raw_abstention),
    abstentions_on_provisionally_resolved_intent: count(r => r.observed.raw_abstention && !r.observed.raw_intent_match),
    invalid_outputs: count(r => r.observed.raw_intent === 'invalid'),
    false_merges: count(r => has(r, 'false_merge')), false_splits: count(r => has(r, 'false_split')),
    forced_tasks_on_provisional_uncertainty: count(r => has(r, 'forced_task_on_provisional_uncertainty')),
    wrong_task_ids: count(r => has(r, 'wrong_task_id')),
    guard_withheld: count(r => has(r, 'host_guard_withheld')),
    guard_withheld_raw_intent_matches: count(r => has(r, 'host_guard_withheld') && r.observed.raw_intent_match),
    provisional_targeted_references: count(r => r.candidate_retrieval_status.provisional_reference !== null),
    candidate_top_1: top(1), candidate_top_3: top(3), candidate_top_8: top(8),
    candidate_misses: count(r => has(r, 'provisional_reference_not_in_top_8')),
    graph_claim_miss_cases: count(r => r.observed.missed_graph_claims.length > 0),
    expected_graph_claims: records.reduce((n, r) => n + r.expected_provisional_label.changes.length, 0),
    missed_graph_claims: records.reduce((n, r) => n + r.observed.missed_graph_claims.length, 0),
    primary_failure_classes: primaryCounts(records),
    error_classes_nonexclusive: counts(records.flatMap(r => r.error_classes)),
    abstention_appropriateness: counts(records.filter(r => r.observed.raw_abstention).map(r => r.abstention_appropriateness)),
    disputed_labels: count(r => r.label_disputed),
  };
}

function group(records, key, summarize = cohort) {
  const groups = new Map();
  for (const record of records) {
    const value = String(key(record));
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record);
  }
  return Object.fromEntries([...groups.keys()].sort().map(key => [key, summarize(groups.get(key))]));
}

function aggregateCatalog(catalog) {
  const abstentions = catalog.filter(r => r.observed.raw_abstention);
  const misses = catalog.filter(r => has(r, 'provisional_reference_not_in_top_8'));
  const errors = catalog.filter(r => !r.observed.raw_intent_match);
  const claimMisses = catalog.filter(r => r.observed.missed_graph_claims.length);
  const existingMistakes = catalog.filter(r => has(r, 'false_merge') || has(r, 'false_split'));
  const claimTotals = (records, getKey) => counts(records.flatMap(r => r.observed.missed_graph_claims.map(c => getKey(r, c))));
  return {
    usage, retrospective_only: true, label_provenance: labelProvenance, human_review_status: 'pending',
    denominators: {
      intent_and_abstention: 'scenarios in the named cohort',
      retrieval: 'non-null provisional_targeted_references in the named cohort, including closed fixture references',
      graph_claim_misses: 'expected_graph_claims in the named cohort; claim occurrences, not scenarios',
      primary_failure_classes: 'scenarios in cohort; none is not a guard or deployment verdict',
    },
    overall: cohort(catalog),
    by_language: group(catalog, r => r.language), by_split: group(catalog, r => r.original_split),
    by_split_and_language: group(catalog, r => r.original_split, rs => group(rs, r => r.language)),
    by_turn_count: group(catalog, r => r.turn_count),
    by_turn_bucket: group(catalog, r => r.turn_count === 1 ? 'single_turn' : 'multi_turn'),
    by_family: group(catalog, r => r.family), by_risk: group(catalog, r => r.risk),
    by_intent: group(catalog, r => r.expected_provisional_label.intent,
      rs => ({ ...cohort(rs), archived_prediction_distribution: counts(rs.map(r => r.observed.raw_intent)) })),
    high_risk_by_family: group(catalog.filter(r => r.risk === 'high'), r => r.family),
    abstentions: {
      n: abstentions.length, by_expected_intent: counts(abstentions.map(r => r.expected_provisional_label.intent)),
      by_assessment: counts(abstentions.map(r => r.abstention_appropriateness)),
      note: 'Assessment is provisional. A cautious response is not equivalent to a correct intent or to authority to apply.',
    },
    retrieval_misses: {
      n: misses.length, by_fixture_status: counts(misses.map(r => r.candidate_retrieval_status.fixture_status)),
      by_expected_intent: counts(misses.map(r => r.expected_provisional_label.intent)),
      scenario_ids: misses.map(r => r.scenario_id),
    },
    raw_intent_error_attribution: {
      denominator: errors.length,
      by_retrieval_status: counts(errors.map(r => r.candidate_retrieval_status.status)),
      by_context_assessment: counts(errors.map(r => r.context_sufficiency)),
      by_primary_class: primaryCounts(errors),
      by_thematic_lens: counts(errors.map(r => r.contributing_factors.scenario_thematic_lens)),
      input_budget_blocked: errors.filter(r => r.observed.error === 'input-budget').length,
      eligible_reference_not_retrieved: errors.filter(r => r.candidate_retrieval_status.status === 'eligible_reference_not_retrieved').length,
      note: 'Overlap is descriptive. Candidate presence does not establish sufficient input; absent reasoning traces preclude a causal input/retrieval/reasoning split.',
    },
    graph_claim_misses: {
      n: claimMisses.reduce((n, r) => n + r.observed.missed_graph_claims.length, 0), scenarios: claimMisses.length,
      by_claim_kind: claimTotals(claimMisses, (_, claim) => claim),
      by_output_path: claimTotals(claimMisses, r => r.observed.graph_claim_output_path),
      by_claim_kind_and_output_path: group(claimMisses.flatMap(record => record.observed.missed_graph_claims.map(
        kind => ({ kind, path: record.observed.graph_claim_output_path }))), c => c.kind, claims => counts(claims.map(c => c.path))),
      by_split: claimTotals(claimMisses, r => r.original_split),
      by_family: claimTotals(claimMisses, r => r.family),
      by_risk: claimTotals(claimMisses, r => r.risk),
      note: 'No archived raw structured claim was emitted; these are omissions, not evidence that the guard rejected 77 proposed claims.',
    },
    false_merge_and_split_cases: existingMistakes.map(r => ({
      scenario_id: r.scenario_id, split: r.original_split, family: r.family, risk: r.risk,
      expected: r.expected_provisional_label.intent, predicted: r.observed.raw_intent,
      retrieval: r.candidate_retrieval_status.status, guard: r.observed.guard,
      thematic_lens: r.contributing_factors.scenario_thematic_lens,
      witness_note: r.contributing_factors.witness_note, label_disputed: r.label_disputed,
    })),
  };
}

export function analyzeArchive(scenarios, results) {
  const scenarioById = indexUnique(scenarios, 'id', 'scenario');
  const predictions = indexUnique(results.rows.filter(row => row.mode === 'structured'), 'caseId', 'structured prediction');
  const candidates = indexUnique(results.candidateRuns, 'caseId', 'candidate run');
  assert.equal(predictions.size, scenarioById.size, 'Structured prediction coverage mismatch');
  assert.equal(candidates.size, scenarioById.size, 'Candidate run coverage mismatch');
  const catalog = [...scenarioById.keys()].sort().map(id => {
    const s = scenarioById.get(id);
    const row = predictions.get(id);
    const retrieval = candidates.get(id);
    assert(row && retrieval, `Missing archive rows: ${id}`);
    for (const key of ['split', 'family', 'language', 'risk']) assert.equal(row[key], s[key], `Prediction ${key} mismatch: ${id}`);
    for (const key of ['split', 'family']) assert.equal(retrieval[key], s[key], `Retrieval ${key} mismatch: ${id}`);
    assert.equal(s.labelProvenance, labelProvenance);
    assert.equal(s.humanReviewStatus, 'pending');
    assert.equal(row.expected, s.expected.intent, `Intent label mismatch: ${id}`);
    assert.equal(row.expectedTaskId, s.expected.taskId, `Task label mismatch: ${id}`);
    assert.equal(retrieval.target, s.expected.retrievalTarget, `Reference label mismatch: ${id}`);
    assert.deepEqual(row.expectedClaims, s.expected.changes, `Claim labels mismatch: ${id}`);
    assert.deepEqual(row.expectedUnresolved, s.expected.unresolved, `Unresolved labels mismatch: ${id}`);
    return diagnoseCase(s, row, retrievalStatus(s, retrieval));
  });
  return { catalog, aggregate: aggregateCatalog(catalog) };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(expectedInputs).map(([name, digest]) => {
    const data = readFileSync(join(root, 'benchmark', name));
    assert.equal(createHash('sha256').update(data).digest('hex'), digest, `Historical file SHA-256 mismatch: ${name}`);
    return [name, JSON.parse(data.toString('utf8'))];
  }));
}

function checkHistoricalTotals(inputs, catalog, aggregate) {
  const results = inputs['results.json'];
  const manifest = inputs['split-manifest.json'];
  const freeze = inputs['holdout-freeze.json'];
  const consumed = inputs['holdout-consumed.json'];
  assert.equal(results.providerRequests, 0);
  assert.equal(results.holdoutRuns, 1);
  assert.equal(manifest.size, catalog.length);
  assert.equal(freeze.holdoutHash, manifest.partitions.holdout.hash);
  assert.equal(freeze.holdoutCases, aggregate.by_split.holdout.scenarios);
  for (const key of ['corpusHash', 'evaluatorHash', 'holdoutHash', 'protocol']) assert.equal(consumed[key], freeze[key]);
  assert.equal(results.corpusHash, freeze.corpusHash);
  assert.equal(results.evaluatorHash, freeze.evaluatorHash);

  for (const [split, cohort] of Object.entries({ all: aggregate.overall, ...aggregate.by_split })) {
    const rows = split === 'all' ? catalog : catalog.filter(r => r.original_split === split);
    const archived = results.summary.intent.structured[split];
    const matrix = inputs['confusion-matrices.json'].structured[split];
    const tally = group(rows, r => r.expected_provisional_label.intent, rs => counts(rs.map(r => r.observed.raw_intent)));
    for (const [intent, expected] of Object.entries(matrix)) {
      for (const [prediction, n] of Object.entries(expected)) assert.equal(tally[intent]?.[prediction] ?? 0, n);
    }
    assert.equal(cohort.scenarios, archived.n);
    assert.equal(cohort.abstentions, archived.abstention);
    assert.equal(cohort.invalid_outputs, archived.invalid);
    assert.equal(cohort.false_merges, archived.falseMerge);
    assert.equal(cohort.false_splits, archived.falseSplit);
    assert.equal(cohort.wrong_task_ids, archived.wrongTaskUuid);
    assert.equal(cohort.forced_tasks_on_provisional_uncertainty, archived.uncertainForcedIntoTask);
    assert.equal(cohort.missed_graph_claims, archived.rawClaims.fn);
    assert.equal(cohort.guard_withheld, archived.guard.withheld);
    const retrieval = results.summary.retrieval[split];
    assert.equal(cohort.provisional_targeted_references, retrieval.targeted);
    assert.equal(cohort.candidate_top_1, retrieval.top1);
    assert.equal(cohort.candidate_top_3, retrieval.top3);
    assert.equal(cohort.candidate_top_8, retrieval.top8);
    assert.equal(cohort.candidate_misses, retrieval.missing);
  }
  return { historical_holdout: consumed, historical_safety: results.safety, historical_stable_result_hash: results.stableResultHash,
    source_file_sha256: expectedInputs, predictor_invocations: 0, provider_requests: 0, human_submissions: 0, human_adjudications: 0 };
}

function prospectiveRealPath(path) {
  const parent = dirname(path);
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT' || parent === path) throw error;
    if (lstatSync(path, { throwIfNoEntry: false })) throw error;
    return join(prospectiveRealPath(parent), relative(parent, path));
  }
}

const notice = `# Retrospective use only

Usage: \`${usage}\`; every catalog record has \`retrospective_only: true\`.

The Phase 0.9.1 Holdout was consumed once on 2026-11-10 under
\`final-holdout-single-consumption-v1\`. This analysis joins and summarizes the
archived structured mock outputs, guard outcomes, candidate lists and provisional
labels. No predictor, model, rule, mock or evaluation harness ran on these cases.
Original freeze/consumed receipts are read-only. No new score, ranking, threshold,
prompt, rule tuning, model selection or independent generalization claim is allowed
on this Holdout. Any future qualification needs a new independently constructed Holdout.

Labels are \`${labelProvenance}\`, human review is pending, and
historical and current Provider requests are zero. A guard decision or absence of a
dangerous output is not evidence of correct understanding. Named label disputes
are retrospective review notes only; the archived labels have not changed.
`;

function main(args) {
  assert.equal(args.length, 2, 'Usage: node scripts/phase-0.9.2/forensics.mjs <extracted-0.9.1-root> <output-directory>');
  const root = realpathSync(args[0]);
  const out = prospectiveRealPath(resolve(args[1]));
  const pathFromRoot = relative(root, out);
  assert(pathFromRoot && (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)),
    'Output directory must be outside the historical archive');
  const inputs = loadInputs(root);
  const { catalog, aggregate } = analyzeArchive(inputs['scenarios.json'], inputs['results.json']);
  aggregate.archive = checkHistoricalTotals(inputs, catalog, aggregate);
  const taxonomy = {
    usage, retrospective_only: true, label_provenance: labelProvenance, layers,
    primary_precedence: 'Known construction block; eligible retrieval gap; invalid output; provisional abstention mismatch; thematic lens for committed mismatch; graph omission; otherwise none.',
    interpretation: 'A/B are observable constraints when supported by the archive. C/D/E are diagnostic opportunities, not proven mechanisms. F records output symptoms or policy events; guard withholding alone is not assigned as an understanding failure.',
    primary_counts_including_none: aggregate.overall.primary_failure_classes,
    observed_nonexclusive_counts: aggregate.overall.error_classes_nonexclusive,
  };
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  const outputs = {
    'failure-catalog.json': json(catalog), 'failure-taxonomy.json': json(taxonomy),
    'aggregate-analysis.json': json(aggregate), 'retrospective-use-notice.md': notice,
  };
  mkdirSync(out, { recursive: true });
  for (const name of Object.keys(outputs)) assert(!lstatSync(join(out, name), { throwIfNoEntry: false }), `Output exists: ${name}`);
  for (const [name, data] of Object.entries(outputs)) writeFileSync(join(out, name), data, { flag: 'wx' });
  console.log(`Wrote ${catalog.length} retrospective records to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
