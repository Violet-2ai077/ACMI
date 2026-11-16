import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, PROMPT } from './materials.mjs';
import { parseOutput, score, summarize } from './evaluate.mjs';
import { audit, buildRequest, retryable } from './run.mjs';
const m = materials();
const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', thinking_format: 'deepseek', max_tokens_field: 'max_tokens',
  reasoning_effort: 'max', model_alias: 'synthetic', output_tokens_declared: 32768, assistant_reasoning_content_required: true, endpoint: 'https://synthetic.invalid/chat/completions' };
const plan = { batch_id: 'synthetic', max_output_tokens: 16384, max_input_bytes: 131072, schedule: m.schedule };
const target = expected => ({ expected, scored_boundary: true, answerChecks: [['answer']] });

test('new private oracle has 28 boundaries across 4 eight-turn stories', () => {
  const r = audit(m); assert.equal(r.returns, 6); assert.deepEqual(r.counts, { CONTINUE: 15, NEW: 11, UNRESOLVED: 2 });
});
test('valid marker is a single terminal suffix, not repaired JSON or a second answer', () => {
  assert.deepEqual(parseOutput('answer\n<|boundary:NEW|> \n'), { valid: true, error: null, label: 'NEW', answer: 'answer' });
  for (const text of ['answer', '<|boundary:NEW|>', 'answer <|boundary:NEW|> extra', 'answer <|boundary:NEW|><|boundary:CONTINUE|>', 'answer <|boundary:OTHER|>', 'answer\n```\n<|boundary:NEW|>']) assert.equal(parseOutput(text).valid, false);
});
test('false split and false merge are separate', () => {
  assert.equal(score('answer<|boundary:NEW|>', target('CONTINUE')).error_type, 'false_split');
  assert.equal(score('answer<|boundary:CONTINUE|>', target('NEW')).error_type, 'false_merge');
});
test('abstention is neither a protocol failure nor a successful split', () => {
  assert.equal(score('answer<|boundary:UNRESOLVED|>', target('NEW')).error_type, 'unnecessary_abstention');
  assert.equal(score('answer<|boundary:CONTINUE|>', target('UNRESOLVED')).error_type, 'missed_ambiguity');
  assert.equal(score('answer<|boundary:UNRESOLVED|>', target('UNRESOLVED')).boundary_exact, true);
  const missing = score('answer', target('UNRESOLVED')); assert.equal(missing.observed, null); assert.equal(missing.boundary_exact, false);
});
test('first turn is initialization, not an extra boundary success', () => {
  const r = score('answer<|boundary:CONTINUE|>', { ...target('CONTINUE'), scored_boundary: false });
  assert.equal(r.boundary_exact, null); assert.equal(r.initialization_correct, true);
});
test('returning to an earlier goal allocates a new segment in the display', () => {
  const rows = m.oracle.map((o, i) => ({ story: o.story, turn: o.turn, index: i + 1, category: o.category, capture_valid: true, invoked: true, outcome: 'complete', attempt: 1,
    score: score(`answer<|boundary:${o.expected}|>`, o) }));
  const result = summarize(rows, plan);
  assert.equal(result.boundary.correct, 28); assert.equal(result.strict_local_criterion_met, true);
  const t = result.trajectories.find(t => t.story === 'login-notice');
  assert.deepEqual(t.sequence.map(x => x.observed_segment), [1, 1, 1, 2, 2, 3, 3, null]);
});
test('protocol failure remains in captured transition denominator', () => {
  const result = summarize([{ story: 's', turn: 2, index: 1, category: 'switch', capture_valid: true, invoked: true, outcome: 'complete', attempt: 1, score: score('answer', target('NEW')) }], { schedule: [{ story: 's', index: 1 }] });
  assert.equal(result.boundary.assessed, 1); assert.equal(result.boundary.correct, 0); assert.equal(result.confusion.NEW.PROTOCOL_INVALID, 1);
});
test('acquisition failure remains visible, without a fake boundary score', () => {
  const result = summarize([{ story: 's', index: 1, invoked: true, outcome: 'failed', capture_valid: false, attempt: 1, score: null }], { schedule: [{ story: 's', index: 1 }, { story: 's', index: 2 }] });
  assert.equal(result.failed_attempts, 1); assert.equal(result.boundary.assessed, 0); assert.equal(result.not_sent.length, 1);
});
test('request excludes oracle, UUID, segment counter and story labels, preserving actual history', () => {
  const series = m.publicCorpus[0], c = { index: 5, story: series.id, turn: 2 };
  const prior = [{ source_id: 'u1', role: 'user', content: series.turns[0].text }, { source_id: 'a1', role: 'assistant', content: 'WRONG<|boundary:NEW|>', reasoning_content: 'original reasoning' }];
  const { request } = buildRequest(c, series, prior, route, plan, PROMPT, 'a'.repeat(64));
  const body = JSON.parse(request.bytes), metadata = JSON.parse(body.messages[1].content);
  assert.deepEqual(Object.keys(metadata.acmi_request).sort(), ['current_source_id', 'protocol']);
  assert.equal(body.messages[3].content, prior[1].content); assert.equal(body.messages[3].reasoning_content, prior[1].reasoning_content);
  for (const hidden of ['expected', 'rationale', 'available_uuid_slots', 'initial_catalog_at_h0', 'observed_segment', series.id]) assert.ok(!request.bytes.includes(Buffer.from(hidden)));
  const changed = structuredClone(prior); changed[1].content = 'repaired';
  assert.notEqual(buildRequest(c, series, changed, route, plan, PROMPT, 'a'.repeat(64)).request.sha256, request.sha256);
});
test('environment retry does not accept model mistakes or incomplete local capture', () => {
  const r = { outcome: 'failed', error_code: 'timeout', termination: { prefix_integrity: true, local_pipeline_closed: true } };
  assert.equal(retryable(r), true);
  for (const error_code of ['response_byte_limit', 'protocol_invalid', 'evidence_write_failed']) assert.equal(retryable({ ...r, error_code }), false);
  assert.equal(retryable({ ...r, termination: { prefix_integrity: false, local_pipeline_closed: true } }), false);
});
