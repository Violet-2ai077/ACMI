// Post-exposure extraction, not a new metric or an output repair.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../protocol/contracts.mjs';
import { score, summarize } from './evaluate.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const stored = read('analysis/scores.json'), plan = read('frozen/plan.json'), oracle = read('frozen/oracle.json');
let reproduced = 0;
for (const row of stored.rows.filter(r => r.capture_valid)) {
  const result = read(`evidence/${row.directory}/result.json`), expected = oracle.find(o => o.story === row.story && o.turn === row.turn);
  if (JSON.stringify(score(result.content, expected)) !== JSON.stringify(row.score)) throw new Error('score_changed');
  reproduced++;
}
const again = summarize(stored.rows, plan, oracle);
for (const [k, value] of Object.entries(again)) if (JSON.stringify(value) !== JSON.stringify(stored[k])) throw new Error('summary_changed');
const sum = values => values.reduce((a, b) => a + b, 0);
function stats(rows) {
  const latencies = rows.map(r => r.latency?.total_ms).filter(Number.isFinite), usage = rows.map(r => r.usage).filter(Boolean);
  return { attempts: rows.length, total_latency_ms: sum(latencies), mean_latency_ms: sum(latencies) / latencies.length,
    min_latency_ms: Math.min(...latencies), max_latency_ms: Math.max(...latencies),
    usage_available: usage.length, prompt_tokens: sum(usage.map(u => u.prompt_tokens)), completion_tokens: sum(usage.map(u => u.completion_tokens)),
    total_tokens: sum(usage.map(u => u.total_tokens)), reasoning_tokens: sum(usage.map(u => u.completion_tokens_details?.reasoning_tokens ?? 0)),
    provider_cost_field_count: usage.filter(u => typeof u.cost === 'number').length,
    provider_cost_field_sum: sum(usage.map(u => u.cost ?? 0)),
    provider_list_cost_field_count: usage.filter(u => typeof u.opencode?.list_cost === 'number').length,
    provider_list_cost_field_sum: sum(usage.map(u => u.opencode?.list_cost ?? 0)),
    provider_allowance_field_sum: sum(usage.map(u => u.opencode?.allowance ?? 0)),
    verified_charge: null, currency_verified: false,
    total_wire_bytes: sum(rows.map(r => r.wire_bytes ?? 0)), max_wire_bytes: Math.max(...rows.map(r => r.wire_bytes ?? 0)) };
}
const caseIndices = [2, 6, 10, 14, 17, 18, 22, 23, 24];
const cases = stored.rows.filter(r => caseIndices.includes(r.index)).map(row => {
  const prefix = `evidence/${row.directory}`, input = read(`${prefix}/input.json`), result = read(`${prefix}/result.json`);
  return { index: row.index, story: row.story, turn: row.turn, category: row.category,
    raw_result: `${prefix}/result.json`, raw_pointer: '/content', request: `${prefix}/request.json`,
    result_sha256: hash(readFileSync(join(root, prefix, 'result.json'))), current_user: input.messages.at(-1).content,
    raw_content: result.content, frozen_score: row.score };
});
const result = { kind: 'descriptive extraction; frozen metrics unchanged; no semantic rescoring',
  deterministic_scores_identical: reproduced, deterministic_summary_identical: true,
  scores_sha256: hash(readFileSync(join(root, 'analysis/scores.json'))), start: read('evidence/start.json'), end_at: read('evidence/end.json').at,
  response_models: [...new Set(stored.rows.map(r => r.response_model))], overall_acquisition: stats(stored.rows),
  by_story: stored.trajectories.map(t => ({ story: t.story, ...stats(stored.rows.filter(r => r.story === t.story)) })), cases };
writeFileSync(join(root, 'analysis/supplement.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...result, cases: undefined }));
