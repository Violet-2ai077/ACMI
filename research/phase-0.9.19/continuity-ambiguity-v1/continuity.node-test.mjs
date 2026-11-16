import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, PROMPT } from './materials.mjs';
import { PROMPT as oldPrompt } from '../continuity-v1/materials.mjs';
import { score as oldScore } from '../continuity-long-v1/evaluate.mjs';
import { score, parseOutput, summarize } from './evaluate.mjs';
import { audit, buildRequest, retryable } from './run.mjs';
const m = materials(), plan = { batch_id: 'test', schedule: m.schedule, max_output_tokens: 16384, max_input_bytes: 131072 };
const target = c => m.oracle.find(o => o.story === c.story && o.turn === c.turn);
const rows = () => m.schedule.map(c => ({ ...c, attempt: 1, directory: `test-${c.index}`, invoked: true, outcome: 'complete', capture_valid: true,
  score: score(`${target(c).kind === 'ambiguous' ? '请确认哪场亲子成人网页手机' : 'answer'}<|task:${target(c).expected}|>`, target(c)) }));
const report = rr => summarize(rr, plan, m.oracle);
const change = (rr, turn, text) => { const r = rr.find(x => x.story === 'shared-reading' && x.turn === turn); r.score = score(text, target(r)); };

test('freeze audit: six births, fourteen returns, four ambiguities; no ambiguity birth', () => {
  assert.deepEqual(audit(m).counts, { birth: 6, return: 14, ambiguous: 4 });
  assert.deepEqual(audit(m).groups, { birth: 6, 'clear-return': 10, ambiguous: 4, 'clarified-return': 4 });
  for (const s of m.publicCorpus) assert.deepEqual(m.oracle.filter(o => o.story === s.id).map(o => o.expected), ['1','2','1','3','2','UNRESOLVED','1','2','3','UNRESOLVED','2','1']);
});
test('prompt and single-turn scoring are unchanged references', () => { assert.equal(PROMPT, oldPrompt); assert.equal(score, oldScore); });
test('perfect fixture meets ambiguity and both-trajectory criterion', () => {
  const r = report(rows()); assert.equal(r.strict_local_criterion_met, true); assert.equal(r.canonical.correct, 24);
  assert.equal(r.groups.ambiguous.correct, 4); assert.equal(r.groups['clarified-return'].correct, 4);
  assert.deepEqual(r.conditional_restoration, { correct: 14, assessed: 14, unassessable: 0, planned: 14 });
});
test('guessing an old number on ambiguous input is not correct restoration', () => {
  const rr = rows(); change(rr, 6, 'answer<|task:2|>'); const r = report(rr);
  assert.equal(r.ambiguities[0].outcome, 'unsupported_numeric_assignment'); assert.equal(r.groups.ambiguous.correct, 3);
  assert.equal(r.conditional_restoration.planned, 14); assert.equal(r.strict_local_criterion_met, false);
});
test('UNRESOLVED without lexical clarification does not pass strict criterion', () => {
  const rr = rows(); change(rr, 6, '不知道<|task:UNRESOLVED|>'); const r = report(rr);
  assert.equal(r.groups.ambiguous.correct, 4); assert.equal(r.groups.ambiguous.answer_checks_pass, 3); assert.equal(r.strict_local_criterion_met, false);
});
test('missing marker is protocol failure, never an unresolved answer', () => {
  const rr = rows(); change(rr, 6, '请确认亲子或成人哪一场'); const r = report(rr);
  assert.equal(r.ambiguities[0].outcome, 'protocol_invalid'); assert.equal(r.groups.ambiguous.unresolved, 3);
  for (const content of ['answer<|task:01|>', 'answer<|task:1|><|task:2|>', 'answer<|task:1|>extra']) assert.equal(parseOutput(content).valid, false);
});
test('clarification must restore old marker, not mint a new one', () => {
  const rr = rows(); change(rr, 7, 'answer<|task:4|>'); const r = report(rr);
  assert.equal(r.groups['clarified-return'].correct, 3); assert.equal(r.returns.find(x => x.story === 'shared-reading' && x.turn === 7).reason, 'fresh_marker_on_return');
});
test('unnecessary abstention and other-task assignment are separate', () => {
  const rr = rows(); change(rr, 3, 'answer<|task:UNRESOLVED|>'); change(rr, 12, 'answer<|task:2|>'); const r = report(rr);
  assert.equal(r.unnecessary_abstentions, 1); assert.equal(r.other_task_assignments, 1);
});
test('invalid birth prevents conditional restoration, not canonical scoring', () => {
  const rr = rows(); change(rr, 1, 'answer'); const r = report(rr);
  assert.equal(r.returns.find(x => x.story === 'shared-reading' && x.turn === 7).assessable, false); assert.equal(r.canonical.correct, 23);
});
test('acquisition failure is not a semantic guess and is retained', () => {
  const rr = rows(), r = rr.find(x => x.story === 'shared-reading' && x.turn === 6);
  Object.assign(r, { outcome: 'failed', capture_valid: false, score: null }); const s = report(rr);
  assert.equal(s.failed_attempts, 1); assert.equal(s.ambiguities[0].outcome, 'not_acquired'); assert.equal(s.groups.ambiguous.assessed, 3);
});
test('wrong actual output and reasoning forwarded without hidden oracle', () => {
  const series = m.publicCorpus[0], c = m.schedule.find(x => x.story === series.id && x.turn === 2);
  const prior = [{ source_id: 'u1', role: 'user', content: series.turns[0].text }, { source_id: 'a1', role: 'assistant', content: 'wrong<|task:9|>', reasoning_content: 'actual reasoning' }];
  const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', thinking_format: 'deepseek', max_tokens_field: 'max_tokens', reasoning_effort: 'max', model_alias: 'synthetic', output_tokens_declared: 32768, assistant_reasoning_content_required: true, endpoint: 'https://synthetic.invalid/chat/completions' };
  const { request } = buildRequest(c, series, prior, route, plan, PROMPT, 'a'.repeat(64)); const body = JSON.parse(request.bytes);
  assert.equal(body.messages[3].content, prior[1].content); assert.equal(body.messages[3].reasoning_content, prior[1].reasoning_content);
  for (const hidden of ['task_key','birth_turn','expected','rationale',series.id]) assert.ok(!request.bytes.includes(Buffer.from(hidden)));
});
test('only eligible environment failures can retry', () => {
  const r = { outcome: 'failed', error_code: 'timeout', termination: { prefix_integrity: true, local_pipeline_closed: true } };
  assert.equal(retryable(r), true); assert.equal(retryable({ ...r, error_code: 'protocol_invalid' }), false);
  assert.equal(retryable({ ...r, error_code: 'response_byte_limit' }), false);
});
