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
import { materials, PROMPT, VERSION } from './materials.mjs';
import { score, summarize } from './evaluate.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url)), REPO = resolve(ROOT, '../../..');
const FROZEN = join(ROOT, 'frozen'), EVIDENCE = join(ROOT, 'evidence');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, value) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const at = () => new Date().toISOString();
const git = args => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const nameFor = c => `${String(c.index).padStart(2, '0')}-${c.story}-t${c.turn}`;
const paths = () => ({ packageJson: join(homedir(), 'AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json'),
  profilePatch: join(homedir(), '.dsh/profiles/web/cordis.patch.yml'), credentialsFile: join(homedir(), '.dsh/.credentials.yaml') });

function safeRoute() {
  const { sources, credential, ...binding } = inspectDsh(paths());
  if (!credential.available) throw new Error('selected_credential_unavailable');
  return { ...binding, catalog_sha256: sources.catalog_sha256, credential_reference: credential.reference, credential_source: credential.source };
}
function selectedCredential() {
  const p = paths(), binding = inspectDsh(p), { parseDocument } = createRequire(p.packageJson)('yaml');
  const doc = parseDocument(readFileSync(p.credentialsFile, 'utf8'), { logLevel: 'silent', prettyErrors: false });
  if (doc.errors.length) throw new Error('credential_read_failed');
  const value = doc.getIn(['refs', binding.credential_ref]) ?? process.env[binding.credential_ref];
  if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error('credential_read_failed');
  return value;
}
function dependencies() {
  const seen = new Set();
  function visit(path) {
    path = resolve(path); if (seen.has(path)) return; seen.add(path);
    for (const match of readFileSync(path, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) visit(resolve(dirname(path), match[1]));
  }
  visit(fileURLToPath(import.meta.url)); visit(join(ROOT, 'continuity.node-test.mjs'));
  seen.add(join(ROOT, 'PLAN.md'));
  return [...seen].sort();
}
export function audit(m) {
  if (m.schedule.length !== 14 || new Set(m.schedule.map(nameFor)).size !== 14 || m.publicCorpus.length !== 1) throw new Error('schedule_invalid');
  const counts = { birth: 0, continue: 0, return: 0 };
  for (const series of m.publicCorpus) {
    if (Object.keys(series).sort().join('|') !== 'id|turns' || series.turns.length !== 14) throw new Error('public_shape');
    if (series.turns.some(t => Object.keys(t).sort().join('|') !== 'source_id|text|turn')) throw new Error('oracle_leak');
    const seen = new Map(); let previous;
    for (const turn of series.turns) {
      const o = m.oracle.find(o => o.story === series.id && o.turn === turn.turn);
      if (!o) throw new Error('missing_oracle');
      const fresh = !seen.has(o.task_key);
      if (fresh) seen.set(o.task_key, { marker: String(seen.size + 1), turn: o.turn });
      const birth = seen.get(o.task_key), kind = fresh ? 'birth' : previous === o.task_key ? 'continue' : 'return';
      if (o.expected !== birth.marker || o.birth_turn !== birth.turn || o.kind !== kind) throw new Error('identity_or_return_mismatch');
      for (const group of o.answerChecks) {
        if (!group.length) throw new Error('empty_answer_group');
        for (const pattern of group) new RegExp(pattern, 'iu');
      }
      counts[kind]++; previous = o.task_key;
    }
  }
  if (JSON.stringify(counts) !== JSON.stringify({ birth: 5, continue: 0, return: 9 })) throw new Error('oracle_counts');
  return { self_reviewer: 'Codex under explicit Owner delegation; not independent review', before_model_exposure: true,
    stories: 1, turns: 14, counts, public_private_fields_separated: true, birth_and_return_anchors_reviewed: true };
}

function freeze() {
  if (existsSync(FROZEN) || existsSync(EVIDENCE)) throw new Error('freeze_or_evidence_exists');
  const m = materials(), review = audit(m), route = safeRoute();
  mkdirSync(FROZEN);
  write(join(FROZEN, 'public.json'), m.publicCorpus); write(join(FROZEN, 'oracle.json'), m.oracle);
  write(join(FROZEN, 'prompt.json'), { version: VERSION, prompt: PROMPT }); write(join(FROZEN, 'route.json'), route);
  write(join(FROZEN, 'plan.json'), { version: VERSION, batch_id: 'tc2-20261116', authorization: 'Owner longer similar-task continuity request after TC1; no full state; bounded environment retries',
    schedule: m.schedule, max_actual_calls: 16, max_retry_calls: 2, retry_wait_ms: 5000, previous_conversation_calls: 104, combined_ceiling: 120,
    max_output_tokens: 16384, max_input_bytes: 131072, max_response_bytes: 1048576, timeout_ms: 180000 });
  write(join(FROZEN, 'self-review.json'), { ...review, at: at(), node: process.version, base_commit: git(['rev-parse', 'HEAD']) });
  const files = [...dependencies(), ...readdirSync(FROZEN).map(n => join(FROZEN, n))];
  write(join(FROZEN, 'manifest.json'), { version: VERSION, at: at(), files: Object.fromEntries(files.map(p => [relative(REPO, p).replaceAll('\\', '/'), hash(readFileSync(p))])) });
  console.log(JSON.stringify({ frozen: verifyFreeze(), review }));
}
export function verifyFreeze() {
  for (const [p, digest] of Object.entries(read(join(FROZEN, 'manifest.json')).files)) if (hash(readFileSync(join(REPO, p))) !== digest) throw new Error('freeze_changed');
  return hash(readFileSync(join(FROZEN, 'manifest.json')));
}
export function buildRequest(c, series, prior, route, plan, prompt, freezeHash) {
  const turn = series.turns[c.turn - 1];
  const messages = [...prior, { source_id: turn.source_id, role: 'user', content: turn.text }];
  const body = { instructions: prompt, messages, metadata: { protocol: VERSION, current_source_id: turn.source_id } };
  const serialized = JSON.stringify(body), compiled = { body, serialized, request_hash: hash(serialized) };
  const routingHeaders = routingHeadersFor({ policy: { version: 'opencode-conversation-v1', user_agent: 'acmi-attribution-research/0.9.19' },
    runId: plan.batch_id, freezeHash, coordinate: { family_id: c.story, condition: 'long-continuity-only', arm: 'inline', track: 'CLOSED-LOOP' }, sessionId: c.story });
  const assistantReasoning = Object.fromEntries(prior.filter(m => m.role === 'assistant').map(m => [m.source_id, m.reasoning_content]));
  const request = serializeCompletion(compiled, { route, maxOutputTokens: plan.max_output_tokens, assistantReasoning, routingHeaders });
  if (request.bytes.length > plan.max_input_bytes) throw new Error('input_byte_limit');
  return { request, messages };
}
export function retryable(r) {
  return r.outcome === 'failed' && r.termination?.prefix_integrity === true && r.termination?.local_pipeline_closed === true &&
    (['timeout', 'transport_error'].includes(r.error_code) || r.error_code === 'http_status' && (r.http_status === 408 || r.http_status === 429 || r.http_status >= 500));
}
async function run() {
  const freezeHash = verifyFreeze(), plan = read(join(FROZEN, 'plan.json')), route = read(join(FROZEN, 'route.json'));
  if (JSON.stringify(route) !== JSON.stringify(safeRoute())) throw new Error('route_changed');
  if (git(['status', '--porcelain', '--', relative(REPO, ROOT)])) throw new Error('freeze_not_committed');
  if (existsSync(EVIDENCE)) throw new Error('no_resume');
  const secret = selectedCredential(), corpus = read(join(FROZEN, 'public.json')), prompt = read(join(FROZEN, 'prompt.json')).prompt;
  mkdirSync(EVIDENCE);
  write(join(EVIDENCE, 'start.json'), { at: at(), freeze_sha256: freezeHash, commit: git(['rev-parse', 'HEAD']), node: process.version, max_actual_calls: plan.max_actual_calls });
  const histories = new Map(), attempts = [];
  let calls = 0, retries = 0, halt = null;
  for (const c of plan.schedule) {
    try { if (verifyFreeze() !== freezeHash) throw new Error(); } catch { halt = 'freeze_changed'; break; }
    const series = corpus.find(s => s.id === c.story), prior = histories.get(c.story) ?? [];
    let request, messages;
    try { ({ request, messages } = buildRequest(c, series, prior, route, plan, prompt, freezeHash)); }
    catch { halt = 'request_construction_failed'; break; }
    let accepted;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (calls >= plan.max_actual_calls || calls + plan.previous_conversation_calls >= plan.combined_ceiling) { halt = 'call_cap'; break; }
      const name = `${nameFor(c)}-a${attempt}`, dir = join(EVIDENCE, name);
      mkdirSync(dir);
      writeFileSync(join(dir, 'request.json'), request.bytes, { flag: 'wx' });
      write(join(dir, 'input.json'), { coordinate: c, attempt, messages, endpoint: request.endpoint, headers: request.headers, request_sha256: request.sha256, freeze_sha256: freezeHash });
      const row = { ...c, attempt, directory: name, invoked: false, at: at() }; attempts.push(row);
      let seq = 0;
      const record = event => {
        const { bytes, ...rest } = event;
        appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ seq: ++seq, ...rest, ...(bytes ? { bytes_base64: bytes.toString('base64'), byte_length: bytes.length } : {}) }) + '\n');
      };
      let result;
      try {
        result = await performDeadlineCompletion({ request, credential: secret, timeoutMs: plan.timeout_ms, maxResponseBytes: plan.max_response_bytes, record,
          fetchImpl: (url, options) => { record({ kind: 'fetch_invoked', at: at(), ordinal: calls + 1 }); calls++; row.invoked = true; return fetch(url, options); } });
        write(join(dir, 'result.json'), result);
        Object.assign(row, { outcome: result.outcome, evidence_complete: result.evidence_complete, error_code: result.error_code, http_status: result.http_status,
          latency_ms: result.latency.total_ms, usage: result.usage, verified_charge: null });
      } catch { row.outcome = 'capture_incomplete'; row.evidence_complete = false; halt = 'capture_incomplete'; break; }
      appendFileSync(join(EVIDENCE, 'attempts.jsonl'), JSON.stringify(row) + '\n');
      console.log(JSON.stringify({ index: c.index, story: c.story, turn: c.turn, attempt, calls, outcome: result.outcome, error: result.error_code, ms: Math.round(result.latency.total_ms) }));
      if (result.outcome === 'complete' && result.evidence_complete) { accepted = result; break; }
      if (attempt === 1 && retryable(result) && retries < plan.max_retry_calls) { retries++; await new Promise(resolve => setTimeout(resolve, plan.retry_wait_ms)); }
      else { halt = result.error_code ?? result.outcome; break; }
    }
    if (!accepted) break;
    histories.set(c.story, [...prior, { source_id: `u${c.turn}`, role: 'user', content: series.turns[c.turn - 1].text },
      { source_id: `a${c.turn}`, role: 'assistant', content: accepted.content, reasoning_content: accepted.reasoning }]);
  }
  write(join(EVIDENCE, 'end.json'), { at: at(), actual_calls: calls, retry_calls: retries, halt, attempts,
    not_sent: plan.schedule.filter(c => !attempts.some(a => a.index === c.index && a.invoked)), no_resume: true, verified_charge: null });
  console.log(JSON.stringify({ finished: true, calls, retries, halt }));
}
function analyze() {
  const freezeHash = verifyFreeze(), plan = read(join(FROZEN, 'plan.json')), route = read(join(FROZEN, 'route.json'));
  const corpus = read(join(FROZEN, 'public.json')), oracle = read(join(FROZEN, 'oracle.json')), prompt = read(join(FROZEN, 'prompt.json')).prompt;
  const end = existsSync(join(EVIDENCE, 'end.json')) ? read(join(EVIDENCE, 'end.json')) : null;
  const rows = [], checks = [], hashes = {}, histories = new Map();
  for (const name of readdirSync(EVIDENCE, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    const dir = join(EVIDENCE, name), input = read(join(dir, 'input.json')), c = input.coordinate;
    const result = existsSync(join(dir, 'result.json')) ? read(join(dir, 'result.json')) : null;
    const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const req = readFileSync(join(dir, 'request.json')), prior = histories.get(c.story) ?? [], series = corpus.find(s => s.id === c.story);
    const expected = buildRequest(c, series, prior, route, plan, prompt, freezeHash);
    const wire = events.filter(e => e.kind === 'wire').map(e => Buffer.from(e.bytes_base64, 'base64'));
    const requests = events.filter(e => e.kind === 'request'), invoked = events.filter(e => e.kind === 'fetch_invoked'), terminal = events.filter(e => e.kind === 'terminal');
    const check = { directory: name, request_hash: hash(req) === input.request_sha256, exact_request_and_lineage: req.equals(expected.request.bytes),
      input_messages: JSON.stringify(input.messages) === JSON.stringify(expected.messages), one_invocation: invoked.length === 1,
      one_request: requests.length === 1 && Buffer.from(requests[0].bytes_base64, 'base64').equals(req), event_sequence: events.every((e, i) => e.seq === i + 1),
      wire_hash: result ? hash(Buffer.concat(wire)) === result.termination.wire_sha256 : null,
      wire_bytes: result ? Buffer.concat(wire).length === result.wire_bytes : null, terminal_observed: terminal.length === 1, complete_redecode: null };
    if (result?.outcome === 'complete' && result.evidence_complete) {
      const decoder = createCompletionDecoder({ onDelta() {} });
      try {
        for (const bytes of wire) decoder.push(bytes);
        decoder.finish(); const decoded = decoder.snapshot();
        check.complete_redecode = ['content', 'reasoning', 'finish_reason', 'usage', 'generation_id', 'response_model', 'done'].every(k => JSON.stringify(decoded[k]) === JSON.stringify(result[k]));
      } catch { check.complete_redecode = false; }
      for (const channel of ['content', 'reasoning']) check[channel + '_deltas'] = Buffer.concat(events.filter(e => e.kind === channel).map(e => Buffer.from(e.bytes_base64, 'base64'))).toString() === result[channel];
      check.terminal_matches = ['content', 'reasoning', 'outcome', 'evidence_complete'].every(k => terminal[0]?.result[k] === result[k]);
      histories.set(c.story, [...prior, { source_id: `u${c.turn}`, role: 'user', content: series.turns[c.turn - 1].text },
        { source_id: `a${c.turn}`, role: 'assistant', content: result.content, reasoning_content: result.reasoning }]);
    }
    const valid = result?.outcome === 'complete' && result.evidence_complete && !Object.values(check).includes(false);
    const target = oracle.find(o => o.story === c.story && o.turn === c.turn);
    rows.push({ ...c, attempt: input.attempt, directory: name, category: target.category, invoked: invoked.length > 0,
      outcome: result?.outcome ?? 'evidence_incomplete', capture_valid: Boolean(valid), error_code: result?.error_code ?? null,
      wire_bytes: result?.wire_bytes ?? null, latency: result?.latency ?? null, usage: result?.usage ?? null,
      response_model: result?.response_model ?? null, score: valid ? score(result.content, target) : null });
    checks.push(check);
    for (const file of readdirSync(dir)) hashes[`${name}/${file}`] = hash(readFileSync(join(dir, file)));
  }
  for (const name of ['start.json', 'end.json', 'attempts.jsonl']) if (existsSync(join(EVIDENCE, name))) hashes[name] = hash(readFileSync(join(EVIDENCE, name)));
  const summary = summarize(rows, plan, oracle), destination = join(ROOT, 'analysis'); mkdirSync(destination);
  write(join(destination, 'scores.json'), { freeze_sha256: freezeHash, ...summary, rows });
  write(join(destination, 'verification.json'), { at: at(), freeze_sha256: freezeHash, end_observed: Boolean(end),
    calls_match_end: end ? summary.actual_calls === end.actual_calls : null, all_checks_pass: !checks.some(c => Object.values(c).includes(false)), checks, hashes });
  console.log(JSON.stringify({ ...summary, trajectories: undefined, not_sent: summary.not_sent.length }));
}
function scan() {
  const secret = Buffer.from(selectedCredential()), hits = []; let files = 0, streams = 0;
  const unsafe = bytes => bytes.includes(secret) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(bytes.toString());
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) { walk(path); continue; }
      files++; const bytes = readFileSync(path);
      if (unsafe(bytes)) hits.push(relative(ROOT, path));
      if (item.name === 'events.jsonl') {
        const events = bytes.toString().trim().split('\n').map(JSON.parse);
        for (const channel of ['wire', 'content', 'reasoning']) {
          const decoded = Buffer.concat(events.filter(e => e.kind === channel).map(e => Buffer.from(e.bytes_base64, 'base64')));
          streams++; if (unsafe(decoded)) hits.push(`${relative(ROOT, path)}:${channel}`);
        }
      }
    }
  }
  walk(ROOT); console.log(JSON.stringify({ safe: !hits.length, files, decoded_streams: streams, hits, scope: 'selected credential bytes and strong signatures; not universal detection' }));
  if (hits.length) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'freeze') freeze();
    else if (process.argv[2] === 'run') await run();
    else if (process.argv[2] === 'score') analyze();
    else if (process.argv[2] === 'scan') scan();
    else if (process.argv[2] === 'check-freeze') console.log(verifyFreeze());
    else throw new Error('unknown_command');
  } catch (e) { console.error(JSON.stringify({ stopped: true, code: 'local_preflight_or_execution_failure', exception_type: e.constructor.name })); process.exitCode = 1; }
}
