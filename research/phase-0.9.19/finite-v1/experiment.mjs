import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { hash } from '../protocol/contracts.mjs';
import { inspectDsh } from '../gate2/dsh-inspect.mjs';
import { serializeCompletion, createCompletionDecoder } from '../gate2/transport.mjs';
import { performDeadlineCompletion } from '../gate2/deadline-transport.mjs';
import { routingHeadersFor } from '../gate2/routing.mjs';
import { materials, PROMPTS, VERSION } from './materials.mjs';
import { score, grounding } from './evaluate.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(ROOT, '../../..');
const frozen = join(ROOT, 'frozen');
const output = join(ROOT, 'evidence');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
const paths = () => ({ packageJson: join(homedir(), 'AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json'),
  profilePatch: join(homedir(), '.dsh/profiles/web/cordis.patch.yml'), credentialsFile: join(homedir(), '.dsh/.credentials.yaml') });
const key = c => `${c.story}-${c.condition}-${c.arm}`;
const coordinate = c => `${String(c.index).padStart(2, '0')}-${key(c)}-t${c.turn}`;
const stamp = () => new Date().toISOString();

function safeRoute() {
  const binding = inspectDsh(paths());
  const { sources, credential, ...route } = binding;
  if (!credential.available) throw new Error('selected_credential_unavailable');
  return { ...route, catalog_sha256: sources.catalog_sha256, credential_reference: credential.reference, credential_source: credential.source };
}
function credential() {
  const p = paths(), require = createRequire(p.packageJson), { parseDocument } = require('yaml');
  const inspection = inspectDsh(p);
  const doc = parseDocument(readFileSync(p.credentialsFile, 'utf8'), { logLevel: 'silent', prettyErrors: false });
  if (doc.errors.length) throw new Error('credential_read_failed');
  const value = doc.getIn(['refs', inspection.credential_ref]) ?? process.env[inspection.credential_ref];
  if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error('credential_read_failed');
  return value;
}
function sourceFiles() {
  const seen = new Set();
  function visit(file) {
    file = resolve(file);
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) visit(resolve(dirname(file), match[1]));
  }
  visit(fileURLToPath(import.meta.url));
  visit(join(ROOT, 'experiment.node-test.mjs'));
  seen.add(join(ROOT, 'PLAN.md'));
  return [...seen].sort();
}

export function auditMaterials(m) {
  if (m.schedule.length !== 48 || new Set(m.schedule.map(coordinate)).size !== 48) throw new Error('schedule_invalid');
  for (const series of m.publicCorpus) {
    if (series.condition !== 'C1' && (series.catalog !== null || series.initial_state !== null)) throw new Error('condition_leak');
    if (series.condition === 'C3' && /[a-f0-9]{8}-[a-f0-9-]{27,}/.test(series.history)) throw new Error('identity_leak');
    const sources = { h0: series.history };
    const known = new Set(series.condition === 'C3' ? [] : [m.oracle.find(o => o.story === series.story && o.condition === series.condition && o.turn === 1).state.tasks[0].id]);
    for (const t of series.turns) {
      sources[t.source_id] = t.text;
      const oracle = m.oracle.find(o => o.story === series.story && o.condition === series.condition && o.turn === t.turn);
      if (grounding(oracle.state, sources).length) throw new Error(`oracle_grounding:${series.story}:${t.turn}`);
      for (const id of oracle.state.created) {
        if (known.has(id) || !t.slots.includes(id)) throw new Error('birth_invalid');
        known.add(id);
      }
      if (oracle.state.tasks.some(t => !known.has(t.id))) throw new Error('identity_not_established');
      const answer = oracle.answer.map(x => x[0]).join(' ');
      for (const arm of ['A', 'B']) {
        const content = arm === 'A' ? JSON.stringify({ answer, state: oracle.state }) : `${answer}<|fm1:state|>${JSON.stringify(oracle.state)}<|fm1:end|>`;
        const result = score(content, arm, oracle, sources);
        if (!['protocol', 'attribution', 'discovery', 'identity', 'state_facts', 'reference_exact', 'grounded', 'state_exact', 'answer_basic'].every(k => result[k])) throw new Error('oracle_self_score');
      }
    }
  }
  return { reviewed_before_exposure: true, reviewer: 'Codex self-audit under delegated Owner authorization; not independent review', public_policies_checked: true,
    all_oracle_refs_unique_visible: true, condition_isolation: true, births_in_visible_slots: true, oracle_protocol_roundtrips: 48, stories: 2, trajectories: 12, turns: 48 };
}

function freeze() {
  if (existsSync(frozen) || existsSync(output)) throw new Error('freeze_or_evidence_already_exists');
  const m = materials(), audit = auditMaterials(m), route = safeRoute();
  mkdirSync(frozen);
  write(join(frozen, 'public.json'), m.publicCorpus);
  write(join(frozen, 'oracle.json'), m.oracle);
  write(join(frozen, 'prompts.json'), PROMPTS);
  write(join(frozen, 'plan.json'), { version: VERSION, batch_id: 'fm1-20261116', owner_authorization: '2026-11-16 finite-path plus environment-retry amendment',
    max_actual_calls: 60, max_retry_calls: 12, max_retries_per_coordinate: 1, retry_wait_ms: 5000, schedule: m.schedule,
    max_output_tokens: 16384, max_input_bytes: 131072, timeout_ms: 180000, max_response_bytes: 1048576, monetary_cost: null });
  write(join(frozen, 'route.json'), route);
  write(join(frozen, 'self-audit.json'), { ...audit, at: stamp(), base_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(), node: process.version });
  const files = [...sourceFiles(), ...readdirSync(frozen).map(n => join(frozen, n))];
  write(join(frozen, 'manifest.json'), { version: VERSION, at: stamp(), files: Object.fromEntries(files.map(p => [relative(REPO, p).replaceAll('\\', '/'), hash(readFileSync(p))])) });
  console.log(JSON.stringify({ action: 'frozen', sha256: hash(readFileSync(join(frozen, 'manifest.json'))), ...audit }));
}

export function verifyFreeze() {
  const manifest = read(join(frozen, 'manifest.json'));
  for (const [p, digest] of Object.entries(manifest.files)) if (hash(readFileSync(join(REPO, p))) !== digest) throw new Error(`freeze_changed:${p}`);
  return hash(readFileSync(join(frozen, 'manifest.json')));
}

export function buildRequest(c, series, prior, route, plan, prompts, freezeHash) {
  const turn = series.turns[c.turn - 1];
  const messages = [{ source_id: 'h0', role: 'user', content: series.history }, ...prior, { source_id: turn.source_id, role: 'user', content: turn.text }];
  const body = { instructions: prompts[c.arm], messages,
    metadata: { protocol: VERSION, source_id: turn.source_id, available_uuid_slots: turn.slots,
      ...(series.catalog ? { initial_catalog_at_h0: series.catalog, initial_state_at_h0: series.initial_state } : {}) } };
  const serialized = JSON.stringify(body);
  const compiled = { body, serialized, request_hash: hash(serialized) };
  const routingHeaders = routingHeadersFor({ policy: { version: 'opencode-conversation-v1', user_agent: 'acmi-attribution-research/0.9.19' },
    runId: plan.batch_id, freezeHash, coordinate: { ...c, family_id: c.story }, sessionId: key(c) });
  const assistantReasoning = Object.fromEntries(prior.filter(m => m.role === 'assistant').map(m => [m.source_id, m.reasoning_content]));
  const request = serializeCompletion(compiled, { route, maxOutputTokens: plan.max_output_tokens, assistantReasoning, routingHeaders });
  if (request.bytes.length > plan.max_input_bytes) throw new Error('input_byte_limit');
  return { request, messages };
}

export function retryable(result) {
  return result.outcome === 'failed' && result.termination?.prefix_integrity === true && result.termination?.local_pipeline_closed === true &&
    (['timeout', 'transport_error'].includes(result.error_code) || result.error_code === 'http_status' && (result.http_status === 408 || result.http_status === 429 || result.http_status >= 500));
}

async function run() {
  const freezeHash = verifyFreeze(), plan = read(join(frozen, 'plan.json')), route = read(join(frozen, 'route.json'));
  if (JSON.stringify(route) !== JSON.stringify(safeRoute())) throw new Error('dsh_binding_changed');
  const dirty = execFileSync('git', ['status', '--porcelain', '--', relative(REPO, ROOT)], { cwd: REPO, encoding: 'utf8' });
  if (dirty.trim()) throw new Error('freeze_must_be_committed');
  if (existsSync(output)) throw new Error('no_resume_or_replacement');
  const secret = credential(), publicCorpus = read(join(frozen, 'public.json')), prompts = read(join(frozen, 'prompts.json'));
  mkdirSync(output);
  write(join(output, 'start.json'), { at: stamp(), freeze_sha256: freezeHash, node: process.version,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(), max_actual_calls: plan.max_actual_calls });
  const histories = new Map(), attempts = [];
  let calls = 0, retries = 0, halt = null;
  for (const c of plan.schedule) {
    try { if (verifyFreeze() !== freezeHash) throw new Error(); }
    catch { halt = 'freeze_changed'; break; }
    const series = publicCorpus.find(s => s.story === c.story && s.condition === c.condition);
    const prior = histories.get(key(c)) ?? [];
    let request, messages;
    try { ({ request, messages } = buildRequest(c, series, prior, route, plan, prompts, freezeHash)); }
    catch { halt = 'request_construction_failed'; break; }
    let completeResult;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (calls >= plan.max_actual_calls) { halt = 'actual_call_cap'; break; }
      const name = `${coordinate(c)}-a${attempt}`, dir = join(output, name);
      mkdirSync(dir);
      writeFileSync(join(dir, 'request.json'), request.bytes, { flag: 'wx' });
      write(join(dir, 'input.json'), { coordinate: c, attempt, messages, request_sha256: request.sha256, endpoint: request.endpoint, headers: request.headers, freeze_sha256: freezeHash });
      const row = { coordinate: c, attempt, directory: name, actual_invoked: false, at: stamp() };
      attempts.push(row);
      let seq = 0;
      const record = event => {
        const { bytes, ...rest } = event;
        appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ seq: ++seq, ...rest, ...(bytes ? { bytes_base64: bytes.toString('base64'), byte_length: bytes.length } : {}) }) + '\n');
      };
      let result;
      try {
        result = await performDeadlineCompletion({ request, credential: secret, timeoutMs: plan.timeout_ms, maxResponseBytes: plan.max_response_bytes,
          fetchImpl: (url, options) => {
            record({ kind: 'fetch_invoked', at: stamp(), ordinal: calls + 1 });
            calls++; row.actual_invoked = true;
            return fetch(url, options);
          }, record });
        write(join(dir, 'result.json'), result);
        Object.assign(row, { outcome: result.outcome, evidence_complete: result.evidence_complete, error_code: result.error_code,
          http_status: result.http_status, latency_ms: result.latency.total_ms, usage: result.usage, monetary_cost: null });
      } catch {
        row.outcome = 'capture_incomplete'; row.evidence_complete = false; halt = 'capture_incomplete';
        break;
      }
      appendFileSync(join(output, 'attempts.jsonl'), JSON.stringify(row) + '\n');
      console.log(JSON.stringify({ index: c.index, condition: c.condition, arm: c.arm, story: c.story, turn: c.turn, attempt, calls, outcome: result.outcome, error: result.error_code, ms: Math.round(result.latency.total_ms) }));
      if (result.outcome === 'complete' && result.evidence_complete) { completeResult = result; break; }
      if (attempt === 1 && retryable(result) && retries < plan.max_retry_calls) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, plan.retry_wait_ms));
      } else { halt = result.error_code ?? result.outcome; break; }
    }
    if (!completeResult) break;
    const turn = series.turns[c.turn - 1];
    histories.set(key(c), [...prior, { source_id: turn.source_id, role: 'user', content: turn.text },
      { source_id: `a${c.turn}`, role: 'assistant', content: completeResult.content, reasoning_content: completeResult.reasoning }]);
  }
  write(join(output, 'end.json'), { at: stamp(), actual_calls: calls, retries, halt, attempts,
    complete_coordinates: attempts.filter(a => a.outcome === 'complete' && a.evidence_complete).map(a => a.coordinate.index),
    not_sent: plan.schedule.filter(c => !attempts.some(a => a.coordinate.index === c.index && a.actual_invoked)),
    no_resume: true, monetary_cost: null });
  console.log(JSON.stringify({ finished: true, calls, retries, halt }));
}

function verifyAndScore() {
  const freezeHash = verifyFreeze(), plan = read(join(frozen, 'plan.json')), oracles = read(join(frozen, 'oracle.json'));
  const publicCorpus = read(join(frozen, 'public.json')), prompts = read(join(frozen, 'prompts.json')), route = read(join(frozen, 'route.json'));
  const end = existsSync(join(output, 'end.json')) ? read(join(output, 'end.json')) : null;
  const rows = [], checks = [], previous = new Map(), hashes = {};
  const directories = readdirSync(output, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of directories) {
    const dir = join(output, name), input = read(join(dir, 'input.json')), c = input.coordinate;
    const result = existsSync(join(dir, 'result.json')) ? read(join(dir, 'result.json')) : null;
    const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const req = readFileSync(join(dir, 'request.json'));
    const sources = Object.fromEntries(input.messages.map(m => [m.source_id, m.content]));
    const series = publicCorpus.find(s => s.story === c.story && s.condition === c.condition);
    const expected = buildRequest(c, series, previous.get(key(c)) ?? [], route, plan, prompts, freezeHash);
    const wire = events.filter(e => e.kind === 'wire').map(e => Buffer.from(e.bytes_base64, 'base64'));
    const requests = events.filter(e => e.kind === 'request');
    const invoked = events.filter(e => e.kind === 'fetch_invoked');
    const terminal = events.filter(e => e.kind === 'terminal');
    const checksRow = { directory: name, request_hash: hash(req) === input.request_sha256,
      exact_request_and_lineage: req.equals(expected.request.bytes), exact_input_messages: JSON.stringify(input.messages) === JSON.stringify(expected.messages),
      one_request: requests.length === 1 && Buffer.from(requests[0].bytes_base64, 'base64').equals(req),
      one_invocation: invoked.length === 1, event_sequence: events.every((e, i) => e.seq === i + 1),
      wire_hash: result ? hash(Buffer.concat(wire)) === result.termination.wire_sha256 : null,
      wire_bytes: result ? Buffer.concat(wire).length === result.wire_bytes : null,
      terminal_observed: terminal.length === 1, complete_stream_redecoded: null };
    if (result?.outcome === 'complete' && result.evidence_complete) {
      const decoder = createCompletionDecoder({ onDelta() {} });
      try {
        for (const bytes of wire) decoder.push(bytes);
        decoder.finish();
        const decoded = decoder.snapshot();
        checksRow.complete_stream_redecoded = ['content', 'reasoning', 'finish_reason', 'usage', 'generation_id', 'response_model', 'done'].every(k => JSON.stringify(decoded[k]) === JSON.stringify(result[k]));
      } catch { checksRow.complete_stream_redecoded = false; }
      checksRow.content_deltas = Buffer.concat(events.filter(e => e.kind === 'content').map(e => Buffer.from(e.bytes_base64, 'base64'))).toString() === result.content;
      checksRow.reasoning_deltas = Buffer.concat(events.filter(e => e.kind === 'reasoning').map(e => Buffer.from(e.bytes_base64, 'base64'))).toString() === result.reasoning;
      checksRow.terminal_content = terminal[0]?.result.content === result.content && terminal[0]?.result.reasoning === result.reasoning && terminal[0]?.result.outcome === result.outcome;
      previous.set(key(c), [...(previous.get(key(c)) ?? []), { source_id: `u${c.turn}`, role: 'user', content: series.turns[c.turn - 1].text },
        { source_id: `a${c.turn}`, role: 'assistant', content: result.content, reasoning_content: result.reasoning }]);
    }
    const valid = result?.outcome === 'complete' && result.evidence_complete && !Object.values(checksRow).includes(false);
    const oracle = oracles.find(o => o.story === c.story && o.condition === c.condition && o.turn === c.turn);
    rows.push({ coordinate: c, attempt: input.attempt, directory: name, actual_invoked: invoked.length > 0,
      outcome: result?.outcome ?? 'evidence_incomplete', capture_valid: Boolean(valid), error_code: result?.error_code ?? null,
      wire_bytes: result?.wire_bytes ?? null, latency: result?.latency ?? null, usage: result?.usage ?? null,
      response_model: result?.response_model ?? null, monetary_cost: null, score: valid ? score(result.content, c.arm, oracle, sources) : null });
    checks.push(checksRow);
    for (const file of readdirSync(dir)) hashes[`${name}/${file}`] = hash(readFileSync(join(dir, file)));
  }
  for (const name of ['start.json', 'end.json', 'attempts.jsonl']) if (existsSync(join(output, name))) hashes[name] = hash(readFileSync(join(output, name)));
  const groups = [];
  for (const condition of ['C1', 'C2', 'C3']) for (const arm of ['A', 'B']) {
    const rr = rows.filter(r => r.coordinate.condition === condition && r.coordinate.arm === arm);
    const metric = name => ({ pass: rr.filter(r => r.score?.[name] === true).length, assessed: rr.filter(r => typeof r.score?.[name] === 'boolean').length });
    const completedTrajectories = ['amber-filter', 'jade-kit'].filter(story => rr.filter(r => r.coordinate.story === story && r.capture_valid).length === 4);
    groups.push({ condition, arm, planned_turns: 8, actual_calls: rr.filter(r => r.actual_invoked).length,
      completed: rr.filter(r => r.outcome === 'complete').length, failed_attempts: rr.filter(r => r.outcome !== 'complete').length,
      evidence_incomplete: rr.filter(r => !r.capture_valid).length, not_sent: 8 - new Set(rr.filter(r => r.actual_invoked).map(r => r.coordinate.index)).size,
      complete_trajectories: completedTrajectories.length,
      metrics: Object.fromEntries(['protocol', 'attribution', 'discovery', 'identity', 'state_facts', 'reference_exact', 'grounded', 'state_exact', 'answer_basic'].map(k => [k, metric(k)])),
      trajectory_all_pass: Object.fromEntries(['identity', 'state_facts', 'state_exact', 'answer_basic'].map(k => [k, completedTrajectories.filter(story => rr.filter(r => r.coordinate.story === story && r.capture_valid).every(r => r.score?.[k] === true)).length])) });
  }
  const summary = { freeze_sha256: freezeHash, end_observed: Boolean(end), actual_calls: rows.filter(r => r.actual_invoked).length,
    completed: rows.filter(r => r.outcome === 'complete').length, failed: rows.filter(r => r.outcome !== 'complete').length,
    not_sent: plan.schedule.filter(c => !rows.some(r => r.coordinate.index === c.index && r.actual_invoked)), groups, monetary_cost: null,
    observed_end_call_count_matches: end ? end.actual_calls === rows.filter(r => r.actual_invoked).length : null,
    all_integrity_checks_pass: !checks.some(c => Object.values(c).includes(false)), rows };
  const destination = join(ROOT, 'analysis'); mkdirSync(destination);
  write(join(destination, 'scores.json'), summary);
  write(join(destination, 'verification.json'), { at: stamp(), freeze_sha256: freezeHash, checks, hashes,
    limitations: ['not a power-loss durability proof', 'raw wire means delivered Fetch body bytes', 'failed prefix is not a complete response'] });
  console.log(JSON.stringify({ ...summary, rows: undefined, not_sent: summary.not_sent.length }));
}

function safetyScan() {
  const secret = credential(), files = [];
  function walk(dir) { for (const d of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, d.name); if (d.isDirectory()) walk(p); else files.push(p); } }
  walk(ROOT);
  const hits = [];
  for (const p of files) {
    const b = readFileSync(p), s = b.toString();
    if (b.includes(Buffer.from(secret)) || /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(s) || /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(s)) hits.push(relative(ROOT, p));
  }
  if (hits.length) { console.log(JSON.stringify({ safe: false, paths: hits })); process.exitCode = 1; }
  else console.log(JSON.stringify({ safe: true, scanned_files: files.length, selected_credential_bytes_absent: true, strong_signatures_absent: true, data: 'synthetic only; not a universal secret detector' }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === 'freeze') freeze();
    else if (command === 'run') await run();
    else if (command === 'score') verifyAndScore();
    else if (command === 'scan') safetyScan();
    else if (command === 'check-freeze') console.log(verifyFreeze());
    else throw new Error('unknown_command');
  } catch (e) {
    console.error(JSON.stringify({ stopped: true, code: e.message?.startsWith('freeze_changed:') ? e.message : 'local_preflight_or_execution_failure', exception_type: e.constructor.name }));
    process.exitCode = 1;
  }
}
