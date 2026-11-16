import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, PROMPT } from './materials.mjs';
import { PROMPT as priorPrompt } from '../continuity-v1/materials.mjs';
import { parseOutput, score, summarize } from './evaluate.mjs';
import { parseOutput as priorParse, score as priorScore } from '../continuity-v1/evaluate.mjs';
import { audit, buildRequest, retryable } from './run.mjs';
const m = materials(), story = m.publicCorpus[0].id;
const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', thinking_format: 'deepseek', max_tokens_field: 'max_tokens',
  reasoning_effort: 'max', model_alias: 'synthetic', output_tokens_declared: 32768, assistant_reasoning_content_required: true, endpoint: 'https://synthetic.invalid/chat/completions' };
const plan = { batch_id: 'synthetic', max_output_tokens: 16384, max_input_bytes: 131072, schedule: m.schedule };
const target = turn => m.oracle.find(o => o.turn === turn);
const rows = () => m.schedule.map(c => ({ ...c, capture_valid: true, invoked: true, outcome: 'complete', attempt: 1,
  directory: `test-${c.index}`, score: score(`answer<|task:${target(c.turn).expected}|>`, target(c.turn)) }));
const set = (rr, turn, content) => { rr.find(r => r.turn === turn).score = score(content, target(turn)); };
const report = rr => summarize(rr, plan, m.oracle);
const probe = (rr, turn) => report(rr).returns.find(r => r.turn === turn);

test('frozen design has five births, nine returns and 13 switches across 14 turns', () => {
  assert.deepEqual(audit(m).counts, { birth: 5, continue: 0, return: 9 });
  assert.deepEqual(m.oracle.map(o => o.expected), ['1','2','1','3','4','2','5','1','4','3','5','2','4','1']);
  const seen = new Map(), gaps = [];
  for (const o of m.oracle) { if (seen.has(o.task_key)) gaps.push(o.turn - seen.get(o.task_key) - 1); seen.set(o.task_key, o.turn); }
  assert.equal(Math.max(...gaps), 5);
});
test('prompt and single-turn scoring semantics exactly match TC1', () => {
  assert.equal(PROMPT, priorPrompt);
  for (const content of ['answer', 'answer<|task:1|>', 'answer<|task:UNRESOLVED|>', 'answer<|task:02|>', 'answer<|task:2|>trailing']) {
    assert.deepEqual(parseOutput(content), priorParse(content));
    assert.deepEqual(score(content, target(1)), priorScore(content, target(1)));
  }
});
test('terminal marker grammar is strict and not automatically repaired', () => {
  assert.equal(parseOutput('answer<|task:12|>\n').marker, '12');
  assert.equal(parseOutput('answer<|task:UNRESOLVED|>').valid, true);
  for (const content of ['<|task:1|>', 'answer<|task:1|><|task:2|>', 'answer\n```\n<|task:1|>',
    ...['0','01','1000','NEW'].map(n => `answer<|task:${n}|>`)]) assert.equal(parseOutput(content).valid, false);
});
test('perfect trajectory meets only this local 14-turn criterion', () => {
  const r = report(rows());
  assert.equal(r.canonical.correct, 14); assert.equal(r.canonical.planned, 14);
  assert.deepEqual(r.conditional_restoration, { correct: 9, assessed: 9, unassessable: 0, planned: 9 });
  assert.equal(r.trajectories.length, 1); assert.equal(r.strict_local_criterion_met, true);
});
test('six correct turns cannot be counted as a completed longer trajectory', () => {
  const r = report(rows().slice(0, 6));
  assert.equal(r.trajectories[0].complete, false); assert.equal(r.strict_local_criterion_met, false);
  assert.equal(r.not_sent.length, 8); assert.equal(r.conditional_restoration.unassessable, 7);
});
test('birth omission and collision are unassessable anchors, never repaired', () => {
  const rr = rows(); set(rr, 1, 'answer');
  assert.equal(probe(rr, 14).reason, 'birth_missing_invalid_or_unresolved');
  assert.equal(probe(rr, 14).canonical_exact, true);
  set(rr, 1, 'answer<|task:2|>');
  assert.equal(probe(rr, 14).reason, 'birth_marker_collision');
});
test('self-consistent wrong birth preserves conditional but not canonical distinction', () => {
  const rr = rows(); for (const t of [1,3,8,14]) set(rr, t, 'answer<|task:7|>');
  assert.equal(probe(rr, 14).restored, true); assert.equal(probe(rr, 14).canonical_exact, false);
  assert.equal(report(rr).canonical.correct, 10); assert.equal(report(rr).strict_local_criterion_met, false);
});
test('return errors separate fresh, previous-task and other established markers', () => {
  const rr = rows();
  for (const [marker, reason] of [['6','fresh_marker_on_return'], ['4','previous_task_marker_reused'], ['2','other_established_task_marker']]) {
    set(rr, 14, `answer<|task:${marker}|>`); assert.equal(probe(rr, 14).restored, false); assert.equal(probe(rr, 14).reason, reason);
  }
});
test('missing return marker is protocol failure, UNRESOLVED is separate abstention', () => {
  const rr = rows(); set(rr, 14, 'answer'); assert.equal(probe(rr, 14).reason, 'return_protocol_invalid');
  assert.equal(probe(rr, 14).assessable, true);
  set(rr, 14, 'answer<|task:UNRESOLVED|>'); assert.equal(probe(rr, 14).reason, 'unnecessary_abstention');
});
test('failed acquisition stays unobserved and retained in failed denominator', () => {
  const rr = rows(); Object.assign(rr[13], { outcome: 'failed', capture_valid: false, score: null });
  const r = report(rr); assert.equal(r.failed_attempts, 1); assert.equal(r.canonical.assessed, 13);
  assert.equal(probe(rr, 14).reason, 'return_not_acquired'); assert.equal(r.strict_local_criterion_met, false);
});
test('actual wrong marker and original reasoning are forwarded; oracle is absent', () => {
  const series = m.publicCorpus[0], c = m.schedule[1];
  const prior = [{ source_id: 'u1', role: 'user', content: series.turns[0].text },
    { source_id: 'a1', role: 'assistant', content: 'WRONG<|task:9|>', reasoning_content: 'original reasoning' }];
  const { request } = buildRequest(c, series, prior, route, plan, PROMPT, 'a'.repeat(64));
  const body = JSON.parse(request.bytes), metadata = JSON.parse(body.messages[1].content);
  assert.deepEqual(Object.keys(metadata.acmi_request).sort(), ['current_source_id','protocol']);
  assert.equal(body.messages[3].content, prior[1].content); assert.equal(body.messages[3].reasoning_content, prior[1].reasoning_content);
  for (const hidden of ['task_key','birth_turn','expected','rationale','available_uuid_slots',story]) assert.ok(!request.bytes.includes(Buffer.from(hidden)));
});
test('eligible environment errors only; protocol and byte-limit failures cannot retry', () => {
  const r = { outcome: 'failed', error_code: 'timeout', termination: { prefix_integrity: true, local_pipeline_closed: true } };
  assert.equal(retryable(r), true);
  for (const error_code of ['response_byte_limit','protocol_invalid','evidence_write_failed']) assert.equal(retryable({ ...r, error_code }), false);
  assert.equal(retryable({ ...r, termination: { prefix_integrity: false, local_pipeline_closed: true } }), false);
});
