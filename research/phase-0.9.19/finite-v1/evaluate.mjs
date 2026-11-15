import { hash, UUID } from '../protocol/contracts.mjs';

export function strictJson(text) {
  const value = JSON.parse(text);
  const stack = [];
  for (const m of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const token = m[0], top = stack.at(-1);
    if (token === '{' || token === '[') stack.push({ object: token === '{', key: token === '{', keys: new Set() });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (top?.object) top.key = true; }
    else if (token[0] === '"' && top?.object && top.key) {
      const key = JSON.parse(token);
      if (top.keys.has(key)) throw new Error('duplicate_json_key');
      top.keys.add(key); top.key = false;
    } else if (/^[\d-]/.test(token) && !Number.isFinite(Number(token))) throw new Error('nonfinite_number');
  }
  return value;
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, ks) => object(v) && Object.keys(v).sort().join('|') === [...ks].sort().join('|');
const string = v => typeof v === 'string' && v.length > 0;
const id = v => typeof v === 'string' && UUID.test(v);
const choice = (v, s) => s.split('|').includes(v);
const ref = v => keys(v, ['source_id', 'quote']) && string(v.source_id) && string(v.quote);
const list = (v, fn, max = 32) => Array.isArray(v) && v.length <= max && v.every(fn) && new Set(v.map(x => JSON.stringify(canonical(x)))).size === v.length;
const item = (v, fields, enums) => keys(v, ['ref', ...fields]) && ref(v.ref) && Object.entries(enums).every(([k, vals]) => choice(v[k], vals));

export function validate(state) {
  if (!keys(state, ['task_ids', 'focus', 'created', 'unresolved', 'tasks'])) return false;
  if (!list(state.task_ids, id) || !list(state.created, id) || !list(state.unresolved, ref) || !(state.focus === null || id(state.focus))) return false;
  if (!list(state.tasks, t => keys(t, ['id', 'goal', 'criteria', 'work', 'decision', 'conflicts', 'lifecycle']) && id(t.id) && ref(t.goal) &&
    list(t.criteria, c => item(c, ['status'], { status: 'pending|satisfied|superseded' })) &&
    list(t.work, w => item(w, ['status', 'basis', 'evidence'], { status: 'planned|running|ready|completed', basis: 'planned|reported|observed|accepted' }) && list(w.evidence, ref)) &&
    (t.decision === null || (keys(t.decision, ['ref', 'evidence']) && ref(t.decision.ref) && list(t.decision.evidence, ref))) &&
    list(t.conflicts, c => item(c, ['status'], { status: 'open|resolved' })) && choice(t.lifecycle, 'planned|running|ready|completed'), 8)) return false;
  const ids = state.tasks.map(t => t.id);
  if (new Set(ids).size !== ids.length || ![...state.task_ids, ...state.created, ...(state.focus ? [state.focus] : [])].every(x => ids.includes(x))) return false;
  return state.tasks.every(t => ['criteria', 'work', 'conflicts'].every(k => new Set(t[k].map(x => JSON.stringify(canonical(x.ref)))).size === t[k].length));
}

export function parseOutput(content, arm) {
  let value;
  if (arm === 'A') value = strictJson(content);
  else if (arm === 'B') {
    const parts = content.split('<|fm1:state|>');
    if (parts.length !== 2) throw new Error('state_frame_count');
    const end = parts[1].split('<|fm1:end|>');
    if (end.length !== 2 || end[1].trim() || /<\|fm1:/.test(parts[0])) throw new Error('end_frame');
    value = { answer: parts[0].trim(), state: strictJson(end[0]) };
  } else throw new Error('unknown_arm');
  if (!keys(value, ['answer', 'state']) || !string(value.answer) || !validate(value.state)) throw new Error('schema');
  return value;
}

export function refs(value, path = '') {
  if (ref(value)) return [{ path, value }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => refs(v, `${path}/${k}`));
}
export function grounding(value, sources) {
  return refs(value).flatMap(({ path, value: r }) => {
    const text = sources[r.source_id];
    return typeof text === 'string' && text.split(r.quote).length === 2 ? [] : [{ path, ref: r, error: 'quote_not_unique_at_source' }];
  });
}
export function facts(value) {
  if (ref(value)) return value.quote;
  if (Array.isArray(value)) return value.map(facts);
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'evidence').map(([k, v]) => [k, facts(v)]));
  return value;
}
function refProjection(tasks) {
  return tasks.map(t => ({ id: t.id, goal: t.goal, criteria: t.criteria.map(c => c.ref),
    work: t.work.map(w => ({ ref: w.ref, evidence: w.evidence })), decision: t.decision,
    conflicts: t.conflicts.map(c => c.ref) }));
}
export function differences(expected, actual, path = '') {
  if (equal(expected, actual)) return [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const identity = x => object(x) ? x.id ?? x.ref?.quote ?? x.quote : x;
    const ekeys = expected.map(identity), akeys = actual.map(identity);
    if (new Set(ekeys).size === expected.length && new Set(akeys).size === actual.length) {
      return expected.flatMap((e, i) => {
        const j = akeys.indexOf(ekeys[i]);
        return j < 0 ? [{ path, error: 'missing_item', expected: e, actual: null }] : differences(e, actual[j], `${path}/${j}`);
      }).concat(actual.flatMap((a, j) => ekeys.includes(akeys[j]) ? [] : [{ path: `${path}/${j}`, error: 'extra_item', expected: null, actual: a }]));
    }
  }
  if (object(expected) && object(actual)) return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap(k => differences(expected[k], actual[k], `${path}/${k}`));
  return [{ path, expected: expected ?? null, actual: actual ?? null }];
}

export function score(content, arm, oracle, sources) {
  let parsed;
  try { parsed = parseOutput(content, arm); }
  catch (e) { return { protocol: false, error: e.message, attribution: null, discovery: null, identity: null, state_facts: null, reference_exact: null, grounded: null, state_exact: null, answer_basic: null }; }
  const { state, answer } = parsed, target = oracle.state;
  const groundErrors = grounding(state, sources);
  const answerChecks = oracle.answer.map(options => ({ options, pass: options.some(s => new RegExp(`(^|[^a-z0-9])${s}([^a-z0-9]|$)`, 'i').test(answer)) }));
  return { protocol: true,
    attribution: equal({ task_ids: state.task_ids, focus: state.focus, unresolved: state.unresolved }, { task_ids: target.task_ids, focus: target.focus, unresolved: target.unresolved }),
    discovery: equal(state.created, target.created),
    identity: equal(state.tasks.map(t => ({ id: t.id, goal: t.goal.quote })), target.tasks.map(t => ({ id: t.id, goal: t.goal.quote }))),
    state_facts: equal(facts(state.tasks), facts(target.tasks)), reference_exact: equal(refProjection(state.tasks), refProjection(target.tasks)),
    grounded: !groundErrors.length, state_exact: equal(state.tasks, target.tasks), answer_basic: answerChecks.every(c => c.pass),
    answer_checks: answerChecks, errors: differences(target, state, '/state'), grounding_errors: groundErrors,
    field_exact: Object.fromEntries(['goal', 'criteria', 'work', 'decision', 'conflicts', 'lifecycle'].map(k => [k, equal(state.tasks.map(t => ({ id: t.id, value: facts(t[k]) })), target.tasks.map(t => ({ id: t.id, value: facts(t[k]) })))])),
    observed_state_sha256: hash(state), answer };
}
