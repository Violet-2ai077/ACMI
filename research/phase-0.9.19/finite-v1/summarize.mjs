// Post-exposure descriptive extraction only; frozen scoring logic is imported unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { score, parseOutput } from './evaluate.mjs';
import { hash } from '../protocol/contracts.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const report = read('analysis/scores.json'), oracle = read('frozen/oracle.json');
let reproduced = 0;
for (const row of report.rows) {
  const input = read(`evidence/${row.directory}/input.json`), result = read(`evidence/${row.directory}/result.json`);
  const target = oracle.find(o => ['story', 'condition', 'turn'].every(k => o[k] === row.coordinate[k]));
  const rerun = score(result.content, row.coordinate.arm, target, Object.fromEntries(input.messages.map(m => [m.source_id, m.content])));
  if (JSON.stringify(rerun) !== JSON.stringify(row.score)) throw new Error('determinism_mismatch');
  reproduced++;
}
const sum = values => values.reduce((a, b) => a + b, 0);
function statistics(rows) {
  const ms = rows.map(r => r.latency.total_ms);
  return { calls: rows.length, duration_sum_ms: sum(ms), duration_mean_ms: sum(ms) / ms.length, duration_min_ms: Math.min(...ms), duration_max_ms: Math.max(...ms),
    provider_usage_present: rows.filter(r => r.usage !== null).length,
    prompt_tokens: sum(rows.map(r => r.usage.prompt_tokens)), completion_tokens: sum(rows.map(r => r.usage.completion_tokens)),
    total_tokens: sum(rows.map(r => r.usage.total_tokens)), reasoning_tokens: sum(rows.map(r => r.usage.completion_tokens_details.reasoning_tokens)),
    provider_cost_field_sum: sum(rows.map(r => r.usage.cost)), provider_list_cost_sum: sum(rows.map(r => r.usage.opencode.list_cost)),
    provider_allowance_sum: sum(rows.map(r => r.usage.opencode.allowance)), verified_charge: null, currency_verified: false,
    max_wire_bytes: Math.max(...rows.map(r => r.wire_bytes)), total_wire_bytes: sum(rows.map(r => r.wire_bytes)) };
}
const groupStats = report.groups.map(g => ({ condition: g.condition, arm: g.arm, ...statistics(report.rows.filter(r => r.coordinate.condition === g.condition && r.coordinate.arm === g.arm)) }));
const trajectories = [];
for (const g of report.groups) for (const story of ['amber-filter', 'jade-kit']) {
  const rows = report.rows.filter(r => r.coordinate.condition === g.condition && r.coordinate.arm === g.arm && r.coordinate.story === story);
  trajectories.push({ condition: g.condition, arm: g.arm, story, rows: rows.map(r => r.coordinate.index),
    protocol: rows.map(r => r.score.protocol), attribution: rows.map(r => r.score.attribution), identity: rows.map(r => r.score.identity),
    state_facts: rows.map(r => r.score.state_facts), state_exact: rows.map(r => r.score.state_exact),
    field_exact: rows.map(r => r.score.field_exact), answer_basic: rows.map(r => r.score.answer_basic) });
}
const caseIndices = [2, 3, 14, 15, 18, 26, 27, 32, 37, 38, 39, 40, 43, 44, 45, 46, 47, 48];
const cases = caseIndices.map(index => {
  const row = report.rows.find(r => r.coordinate.index === index), path = `evidence/${row.directory}`;
  const input = read(`${path}/input.json`), result = read(`${path}/result.json`);
  return { coordinate: row.coordinate, raw_result: `${path}/result.json`, raw_content_pointer: '/content', input: `${path}/request.json`,
    result_sha256: hash(readFileSync(join(root, path, 'result.json'))),
    current_user: input.messages.at(-1), parsed_output: parseOutput(result.content, row.coordinate.arm), frozen_score: row.score };
});
const summary = { analysis_kind: 'descriptive extraction; no new score, judge, threshold or repaired output',
  deterministic_rescore_identical: reproduced, scores_sha256: hash(readFileSync(join(root, 'analysis/scores.json'))),
  start: read('evidence/start.json'), end_at: read('evidence/end.json').at, overall_acquisition_statistics: statistics(report.rows), groupStats, trajectories, cases };
writeFileSync(join(root, 'analysis/supplement.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...summary, cases: undefined, trajectories: undefined }));
