import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, PROMPTS } from './materials.mjs';
import { strictJson, score, parseOutput, grounding, differences } from './evaluate.mjs';
import { auditMaterials, buildRequest, retryable } from './experiment.mjs';
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs';
import { hash } from '../protocol/contracts.mjs';

const m = materials();
const o = m.oracle.find(o => o.story === 'jade-kit' && o.condition === 'C3' && o.turn === 1);
const s = m.publicCorpus.find(s => s.story === o.story && s.condition === o.condition);
const sources = { h0: s.history, u1: s.turns[0].text };
const answer = 'It still needs verification and acceptance.';
const encode = state => JSON.stringify({ answer, state });
const route = { version: 'gate2-dsh-route-v1', api: 'openai-completions', thinking_format: 'deepseek', max_tokens_field: 'max_tokens',
  reasoning_effort: 'max', model_alias: 'synthetic', output_tokens_declared: 32768, assistant_reasoning_content_required: true, endpoint: 'https://synthetic.invalid/chat/completions' };
const plan = { batch_id: 'synthetic', max_output_tokens: 16384, max_input_bytes: 131072 };

test('pre-exposure corpus/condition/oracle self-audit, 48 planned turns', () => assert.equal(auditMaterials(m).oracle_protocol_roundtrips, 48));
test('duplicate keys, invalid JSON and nonfinite numbers rejected without repair', () => {
  for (const t of ['{"a":1,"a":2}', '{"a":1e999}', '```json\n{}\n```', '{"a":}']) assert.throws(() => strictJson(t));
  assert.deepEqual(strictJson('{"a":[{"x":1},{"x":2}]}'), { a: [{ x: 1 }, { x: 2 }] });
});
test('A and B parse the same oracle, B frames cannot be doubled', () => {
  assert.deepEqual(parseOutput(encode(o.state), 'A').state, o.state);
  const b = `${answer}<|fm1:state|>${JSON.stringify(o.state)}<|fm1:end|>\n`;
  assert.deepEqual(parseOutput(b, 'B').state, o.state);
  assert.throws(() => parseOutput(b + b, 'B'));
  assert.throws(() => parseOutput(b + 'extra', 'B'));
});
test('reported completion is a fact failure, not a protocol or attribution failure', () => {
  const state = structuredClone(o.state); state.tasks[0].work[0].status = 'completed';
  const r = score(encode(state), 'A', o, sources);
  assert.equal(r.protocol, true); assert.equal(r.attribution, true); assert.equal(r.state_facts, false);
  assert.ok(r.errors.some(e => e.path === '/state/tasks/0/work/0/status'));
});
test('reference source drift fails refs/grounding but not facts', () => {
  const state = structuredClone(o.state); state.tasks[0].work[0].evidence[0].source_id = 'future';
  const r = score(encode(state), 'A', o, sources);
  assert.equal(r.state_facts, true); assert.equal(r.reference_exact, false); assert.equal(r.grounded, false); assert.equal(r.state_exact, false);
});
test('missing marker is not unresolved', () => {
  const r = score(answer, 'A', o, sources);
  assert.equal(r.protocol, false); assert.equal(r.attribution, null);
});
test('missing off-focus task fails identity and retained state', () => {
  const target = m.oracle.find(o => o.story === 'jade-kit' && o.condition === 'C3' && o.turn === 4);
  const state = structuredClone(target.state); state.tasks.pop();
  const r = score(encode(state), 'A', target, {});
  assert.equal(r.protocol, true); assert.equal(r.identity, false); assert.equal(r.state_exact, false);
});
test('duplicate items and foreign IDs fail schema', () => {
  const state = structuredClone(o.state); state.tasks[0].work.push(structuredClone(state.tasks[0].work[0]));
  assert.equal(score(encode(state), 'A', o, sources).protocol, false);
});
test('ordered actual assistant content/reasoning survives request construction verbatim', () => {
  const c = m.schedule.find(c => c.condition === 'C3' && c.story === 'jade-kit' && c.turn === 2 && c.arm === 'A');
  const prior = [{ source_id: 'u1', role: 'user', content: s.turns[0].text }, { source_id: 'a1', role: 'assistant', content: 'WRONG STATE stays', reasoning_content: 'captured reasoning stays' }];
  const request = buildRequest(c, s, prior, route, plan, PROMPTS, 'a'.repeat(64)).request;
  const wire = JSON.parse(request.bytes);
  assert.equal(wire.messages[4].content, prior[1].content);
  assert.equal(wire.messages[4].reasoning_content, prior[1].reasoning_content);
  const altered = structuredClone(prior); altered[1].content = 'repaired';
  assert.notEqual(buildRequest(c, s, altered, route, plan, PROMPTS, 'a'.repeat(64)).request.sha256, request.sha256);
  assert.ok(!request.bytes.includes(Buffer.from('oracle')));
});
test('retry eligibility excludes byte limit, schema, local evidence error and unclosed pipeline', () => {
  const r = { outcome: 'failed', error_code: 'timeout', termination: { prefix_integrity: true, local_pipeline_closed: true } };
  assert.equal(retryable(r), true);
  for (const error_code of ['response_byte_limit', 'evidence_write_failed', 'schema']) assert.equal(retryable({ ...r, error_code }), false);
  assert.equal(retryable({ ...r, termination: { prefix_integrity: false, local_pipeline_closed: true } }), false);
  assert.equal(retryable({ ...r, error_code: 'http_status', http_status: 503 }), true);
  assert.equal(retryable({ ...r, error_code: 'http_status', http_status: 401 }), false);
});
test('grounding rejects duplicated visible quotes and diff paths target raw fields', () => {
  assert.equal(grounding({ source_id: 'u', quote: 'x' }, { u: 'x x' }).length, 1);
  assert.deepEqual(differences({ a: 1 }, { a: 2 }, '/state'), [{ path: '/state/a', expected: 1, actual: 2 }]);
});
test('existing transport captures original read boundaries and exactly one invocation', async () => {
  const bytes = Buffer.from('{}'), events = [];
  const data = `data: ${JSON.stringify({ id: 'synthetic', model: 'synthetic', choices: [{ index: 0, delta: { content: 'answer', reasoning_content: 'reason' }, finish_reason: null }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
  const raw = Buffer.from(data); let calls = 0;
  const result = await performDeadlineCompletion({ request: { bytes, sha256: hash(bytes), endpoint: route.endpoint }, credential: 'SYNTHETIC_ONLY',
    timeoutMs: 180000, maxResponseBytes: 1048576, record: e => events.push(e),
    fetchImpl: async () => { calls++; return new Response(new ReadableStream({ start(c) { c.enqueue(raw.subarray(0, 7)); c.enqueue(raw.subarray(7)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } }); } });
  assert.equal(calls, 1); assert.equal(result.outcome, 'complete'); assert.equal(result.evidence_complete, true);
  assert.equal(events.filter(e => e.kind === 'wire').length, 2);
  assert.equal(result.content, 'answer'); assert.equal(result.reasoning, 'reason');
});
