import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, PROMPT } from './materials.mjs';
import { parseOutput, score, summarize } from './evaluate.mjs';
import { audit, buildRequest, retryable } from './run.mjs';
const m = materials();
const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', thinking_format: 'deepseek', max_tokens_field: 'max_tokens',
  reasoning_effort: 'max', model_alias: 'synthetic', output_tokens_declared: 32768, assistant_reasoning_content_required: true, endpoint: 'https://synthetic.invalid/chat/completions' };
const plan = { batch_id: 'synthetic', max_output_tokens: 16384, max_input_bytes: 131072, schedule: m.schedule };
const target = (story, turn) => m.oracle.find(o => o.story === story && o.turn === turn);
const rows = () => m.schedule.map(c => ({ ...c, category: target(c.story, c.turn).category, capture_valid: true, invoked: true,
  outcome: 'complete', attempt: 1, directory: `test-${c.index}`, score: score(`answer<|task:${target(c.story, c.turn).expected}|>`, target(c.story, c.turn)) }));
const set = (rr, story, turn, text) => { rr.find(r => r.story === story && r.turn === turn).score = score(text, target(story, turn)); };
const report = rr => summarize(rr, plan, m.oracle);

test('pre-exposure identities and birth/return anchors audited', () => assert.deepEqual(audit(m).counts, { birth: 10, continue: 3, return: 11 }));
test('one numeric or unresolved terminal marker, no grammar repair', () => {
  assert.deepEqual(parseOutput('answer<|task:12|>\n'), { valid: true, error: null, marker: '12', answer: 'answer' });
  assert.equal(parseOutput('answer<|task:UNRESOLVED|>').valid, true);
  for (const text of ['answer', '<|task:1|>', 'answer<|task:1|>extra', 'answer<|task:1|><|task:2|>', 'answer\n```\n<|task:1|>',
    ...['0', '01', '1000', 'NEW', 'CONTINUE'].map(n => `answer<|task:${n}|>`)]) assert.equal(parseOutput(text).valid, false);
});
test('perfect canonical markers restore 11 returns across four six-turn trajectories', () => {
  const r = report(rows()); assert.equal(r.canonical.correct, 24); assert.equal(r.conditional_restoration.correct, 11);
  assert.equal(r.conditional_restoration.assessed, 11); assert.equal(r.strict_local_criterion_met, true);
  assert.deepEqual(r.trajectories[0].sequence.map(x => x.observed), ['1', '1', '2', '2', '1', '2']);
});
test('birth marker omission is distinct from return failure', () => {
  const rr = rows(); set(rr, 'album-sign', 1, 'answer');
  const r = report(rr), probe = r.returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(r.canonical.correct, 23); assert.equal(probe.canonical_exact, true);
  assert.equal(probe.assessable, false); assert.equal(probe.reason, 'birth_missing_invalid_or_unresolved');
  assert.equal(r.strict_local_criterion_met, false);
});
test('wrong canonical birth can be self-consistent, never rescored as canonical success', () => {
  const rr = rows(); for (const t of [1, 2, 5]) set(rr, 'album-sign', t, 'answer<|task:7|>');
  const r = report(rr), probe = r.returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(probe.actual_birth_marker, '7'); assert.equal(probe.canonical_exact, false);
  assert.equal(probe.restored, true); assert.equal(r.canonical.correct, 21);
});
test('birth collision makes restoration unassessable rather than successful', () => {
  const rr = rows(); set(rr, 'similar-clients', 2, 'answer<|task:1|>');
  const probe = report(rr).returns.find(r => r.story === 'similar-clients' && r.turn === 4);
  assert.equal(probe.assessable, false); assert.equal(probe.reason, 'birth_marker_collision');
});
test('new number on return is a restoration failure', () => {
  const rr = rows(); set(rr, 'album-sign', 5, 'answer<|task:3|>');
  const probe = report(rr).returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(probe.assessable, true); assert.equal(probe.restored, false); assert.equal(probe.reason, 'fresh_marker_on_return');
});
test('carrying previous task marker differs from choosing another established one', () => {
  const rr = rows(); set(rr, 'similar-clients', 6, 'answer<|task:3|>');
  assert.equal(report(rr).returns.find(r => r.story === 'similar-clients' && r.turn === 6).reason, 'previous_task_marker_reused');
  set(rr, 'similar-clients', 6, 'answer<|task:1|>');
  assert.equal(report(rr).returns.find(r => r.story === 'similar-clients' && r.turn === 6).reason, 'other_established_task_marker');
});
test('return omission and unnecessary abstention remain assessed failures with valid births', () => {
  const rr = rows(); set(rr, 'album-sign', 5, 'answer');
  let probe = report(rr).returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(probe.assessable, true); assert.equal(probe.restored, false); assert.equal(probe.reason, 'return_protocol_invalid');
  set(rr, 'album-sign', 5, 'answer<|task:UNRESOLVED|>');
  probe = report(rr).returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(probe.reason, 'unnecessary_abstention');
});
test('missing return acquisition is unobserved, not a semantic failure', () => {
  const rr = rows(), row = rr.find(r => r.story === 'album-sign' && r.turn === 5);
  row.outcome = 'failed'; row.capture_valid = false; row.score = null;
  const r = report(rr), probe = r.returns.find(r => r.story === 'album-sign' && r.turn === 5);
  assert.equal(r.failed_attempts, 1); assert.equal(r.canonical.assessed, 23); assert.equal(probe.reason, 'return_not_acquired');
});
test('actual erroneous assistant mark and reasoning are forwarded without a hidden mapping', () => {
  const series = m.publicCorpus[0], c = { index: 5, story: series.id, turn: 2 };
  const prior = [{ source_id: 'u1', role: 'user', content: series.turns[0].text }, { source_id: 'a1', role: 'assistant', content: 'WRONG<|task:9|>', reasoning_content: 'original reasoning' }];
  const { request } = buildRequest(c, series, prior, route, plan, PROMPT, 'a'.repeat(64));
  const body = JSON.parse(request.bytes), metadata = JSON.parse(body.messages[1].content);
  assert.deepEqual(Object.keys(metadata.acmi_request).sort(), ['current_source_id', 'protocol']);
  assert.equal(body.messages[3].content, prior[1].content); assert.equal(body.messages[3].reasoning_content, prior[1].reasoning_content);
  for (const hidden of ['task_key', 'birth_turn', 'expected', 'rationale', 'available_uuid_slots', 'initial_catalog_at_h0', series.id]) assert.ok(!request.bytes.includes(Buffer.from(hidden)));
  const changed = structuredClone(prior); changed[1].content = 'repaired<|task:1|>';
  assert.notEqual(buildRequest(c, series, changed, route, plan, PROMPT, 'a'.repeat(64)).request.sha256, request.sha256);
});
test('retry only for eligible environment failure with intact local prefix', () => {
  const r = { outcome: 'failed', error_code: 'timeout', termination: { prefix_integrity: true, local_pipeline_closed: true } };
  assert.equal(retryable(r), true);
  for (const error_code of ['response_byte_limit', 'protocol_invalid', 'evidence_write_failed']) assert.equal(retryable({ ...r, error_code }), false);
  assert.equal(retryable({ ...r, termination: { prefix_integrity: false, local_pipeline_closed: true } }), false);
});
