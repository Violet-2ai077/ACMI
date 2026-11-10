import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const data = new URL('./data/', import.meta.url);
const policy = JSON.parse(readFileSync(new URL('./split-policy.json', import.meta.url)));
const source = new URL('open-corpus.json', data);
const paths = {
  manifest: new URL('open-manifest.json', data),
  reserve: new URL('internal-reserve-manifest.json', data),
  audit: new URL('near-duplicate-audit.json', data),
};
const axes = ['cluster', 'constructionFamily', 'linguisticPattern', 'taskFixture', 'paraphrase'];
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const compare = (a, b) => a < b ? -1 : Number(a !== b);
const focus = turn => Object.hasOwn(turn, 'expected') || turn.focus === true;
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function validate(scenarios, isReserve) {
  const ids = new Set();
  for (const s of scenarios) {
    assert.match(s.id, isReserve ? /^R\d{2}$/ : /^(D|V)\d{2}$/);
    assert.ok(!ids.has(s.id), 'duplicate scenario ' + s.id);
    ids.add(s.id);
    assert.equal(s.split, isReserve ? 'reserve' : s.id.startsWith('D') ? 'dev' : 'validation');
    assert.ok(['zh', 'en', 'mixed'].includes(s.language), s.id + ' language');
    assert.ok(['low', 'medium', 'high', 'critical'].includes(s.risk), s.id + ' risk');
    assert.ok(s.workspace && axes.slice(0, 4).every(axis => s[axis]), s.id + ' provenance');
    assert.ok(s.turns.some(focus), s.id + ' focus');
    const taskIds = new Map(s.tasks.map(t => [t.id, t]));
    assert.equal(taskIds.size, s.tasks.length, s.id + ' duplicate task');
    const inScope = id => taskIds.has(id) && (taskIds.get(id).workspace ?? s.workspace) === s.workspace;
    const seen = new Set();
    for (const t of s.turns) {
      assert.ok(t.id && !seen.has(t.id), s.id + ' duplicate turn');
      assert.equal(typeof t.text, 'string');
      assert.ok(t.binding == null || inScope(t.binding), s.id + ' binding is not in scope');
      for (const f of t.facts ?? []) {
        assert.ok(inScope(f.taskId), s.id + ' fact is not in scope');
        assert.ok(seen.has(f.cause), s.id + ' fact is not causally prior');
      }
      seen.add(t.id);
      if (isReserve) assert.ok(!Object.hasOwn(t, 'expected'), 'reserve must be label-free');
      if (t.expected) {
        const e = t.expected;
        assert.ok(e.targetId == null || inScope(e.targetId), s.id + ' target is not in scope');
        assert.ok(!e.relation || ['none', 'discussion', 'existing', 'new', 'unknown'].includes(e.relation));
        assert.ok(!e.posture || ['discuss', 'continue', 'switch', 'return', 'pause', 'wait', 'resume', 'close', 'unknown'].includes(e.posture));
        assert.ok(!e.change || ['preserve', 'refine', 'scope', 'objective', 'state', 'unknown'].includes(e.change));
        assert.ok(!e.status || ['active', 'historical', 'ambiguous', 'missing', 'unavailable', 'stale', 'unassigned', 'unknown'].includes(e.status));
        assert.equal(typeof e.mandatory, 'boolean');
        if (['ambiguous', 'missing', 'unavailable', 'stale', 'unassigned', 'unknown'].includes(e.status)) assert.equal(e.targetId, undefined);
      }
    }
  }
}

function reviewScenario(s) {
  const tasks = s.tasks.filter(t => (t.workspace ?? s.workspace) === s.workspace)
    .map(({ id, objective, aliases, status }) => ({ id, objective, aliases, status }));
  return {
    id: s.id, workspace: s.workspace, tasks,
    turns: s.turns.map(t => ({
      id: t.id, text: t.text, actor: t.actor ?? 'user', kind: t.kind ?? 'message',
      session: t.session ?? 's1', binding: t.binding,
      facts: t.facts?.map(({ kind, taskId, nodeId, resultId, cause }) => ({ kind, taskId, nodeId, resultId, cause })),
      focus: focus(t),
    })),
  };
}

function packetOutputs(scenarios) {
  const visible = scenarios.map(reviewScenario);
  const packetId = sha(json(visible));
  const packet = lane => {
    const key = id => sha(lane + ':' + id);
    const ordered = [...visible].sort((a, b) => compare(key(a.id), key(b.id)) || compare(a.id, b.id));
    return { protocol: 'acmi-093-blind-review-v1', packetId, lane, human_review_status: 'pending', scenarios: ordered };
  };
  return ['A', 'B'].map(lane => [
    new URL('docs/annotation/phase-0.9.3-reviewer-' + lane.toLowerCase() + '-packet.json', root),
    json(packet(lane)),
  ]);
}

function profile(s) {
  const text = normalized(s.turns.filter(focus).map(t => t.text).join(' '));
  const points = Array.from(text);
  return {
    id: s.id, split: s.split, groups: s,
    turns: new Set(s.turns.map(t => normalized(t.text)).filter(Boolean)),
    focusTrigrams: new Set(points.slice(0, -2).map((_, i) => points.slice(i, i + 3).join(''))),
  };
}

function nearDuplicateAudit(scenarios) {
  const data = scenarios.map(profile);
  let splitPairs = 0, sharedGroupPairs = 0, duplicateTurnPairs = 0, nearPairs = 0, max = 0;
  for (const [i, a] of data.entries()) {
    for (const b of data.slice(i + 1)) {
      if (a.split === b.split) continue;
      splitPairs++;
      if (axes.some(k => a.groups[k] && a.groups[k] === b.groups[k])) sharedGroupPairs++;
      if ([...a.turns].some(t => b.turns.has(t))) duplicateTurnPairs++;
      const intersection = [...a.focusTrigrams].filter(t => b.focusTrigrams.has(t)).length;
      const union = a.focusTrigrams.size + b.focusTrigrams.size - intersection;
      const similarity = union ? intersection / union : 0;
      max = Math.max(max, similarity);
      if (similarity >= 0.45) nearPairs++;
    }
  }
  assert.equal(sharedGroupPairs + duplicateTurnPairs + nearPairs, 0, 'cross-split leakage candidates require adjudication');
  return { splitPairs, sharedGroupPairs, duplicateTurnPairs, nearPairs, maximumJaccard: Number(max.toFixed(6)) };
}

function openManifest(bytes, scenarios) {
  const counts = xs => Object.fromEntries([...new Set(xs)].sort().map(x => [x, xs.filter(y => x === y).length]));
  return {
    schema: 'acmi-093-corpus-manifest-v1',
    generatorVersion: policy.generatorVersion,
    authoring: 'fresh synthetic, authored directly; no procedural sampling seed',
    bootstrapSeed: policy.bootstrap.seed,
    reviewerOrdering: 'SHA-256 UTF-8 of lane + colon + scenario ID',
    labelProvenance: policy.labelProvenance,
    sha256: sha(bytes),
    scenarioCount: scenarios.length,
    focusCount: scenarios.flatMap(s => s.turns).filter(focus).length,
    splits: counts(scenarios.map(s => s.split)),
    languages: counts(scenarios.map(s => s.language)),
    risk: counts(scenarios.map(s => s.risk)),
    longScenarios: scenarios.filter(s => s.turns.length >= 10 && s.turns.length <= 30).map(s => s.id),
    scenarios: scenarios.map(s => ({
      id: s.id, split: s.split, language: s.language, risk: s.risk,
      groups: Object.fromEntries(axes.map(k => [k, s[k] ?? null])),
      scenarioSha256: sha(JSON.stringify(s)),
      inputsSha256: sha(JSON.stringify(reviewScenario(s))),
      referenceSha256: sha(JSON.stringify(s.turns.filter(focus).map(t => [t.id, t.expected]))),
    })),
  };
}

function readExternalReserve(path, openScenarios) {
  const resolved = realpathSync(path);
  const fromRoot = relative(realpathSync(fileURLToPath(root)), resolved);
  assert.ok(fromRoot === '..' || fromRoot.startsWith('..' + sep) || isAbsolute(fromRoot), 'reserve must be outside the evaluation worktree');
  const bytes = readFileSync(resolved);
  const reserve = JSON.parse(bytes);
  assert.equal(reserve.protocol, 'acmi-093-internal-reserve-v1');
  validate(reserve.scenarios, true);
  const manifest = {
    schema: 'acmi-093-internal-reserve-manifest-v1',
    sha256: sha(bytes), bytes: bytes.length, scenarioCount: reserve.scenarios.length,
    scenarioHashes: reserve.scenarios.map(s => ({ id: s.id, sha256: sha(JSON.stringify(s)) })),
    custody: 'same-operator-external-directory-hash-seal-only',
    state: 'unconsumed', labelStatus: 'input-only', humanReviewStatus: 'pending', evaluationRuns: 0,
    independentCustodian: false, qualificationHoldout: false,
  };
  return [manifest, nearDuplicateAudit([...openScenarios, ...reserve.scenarios])];
}

const [command, reservePath] = process.argv.slice(2);
assert.ok(['generate', 'verify', 'verify-reserve'].includes(command), 'Usage: corpus.mjs generate|verify-reserve <external-reserve-file>; corpus.mjs verify');
const openBytes = readFileSync(source);
const open = JSON.parse(openBytes);
assert.equal(open.protocol, policy.generatorVersion);
validate(open.scenarios, false);
if (command === 'verify-reserve') {
  assert.ok(reservePath, 'external reserve path required');
  const [manifest, audit] = readExternalReserve(reservePath, open.scenarios);
  assert.deepEqual(JSON.parse(readFileSync(paths.reserve)), manifest);
  assert.deepEqual(JSON.parse(readFileSync(paths.audit)).includingReserve, audit);
  process.stdout.write('Verified external reserve hash and non-scoring leakage audit.\n');
} else {
  const openAudit = nearDuplicateAudit(open.scenarios);
  const common = { normalization: 'NFKC lowercase, Unicode letters and digits only', threshold: 0.45, openOnly: openAudit };
  const outputs = [[paths.manifest, json(openManifest(openBytes, open.scenarios))], ...packetOutputs(open.scenarios)];
  if (command === 'generate') {
    assert.ok(reservePath, 'external reserve path required');
    const [manifest, includingReserve] = readExternalReserve(reservePath, open.scenarios);
    outputs.push([paths.reserve, json(manifest)], [paths.audit, json({ ...common, includingReserve })]);
    for (const [path, bytes] of outputs) {
      if (existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, 'refusing to replace freeze: ' + path.pathname);
      else writeFileSync(path, bytes, { flag: 'wx' });
    }
  } else {
    for (const [path, bytes] of outputs) assert.equal(readFileSync(path, 'utf8'), bytes, path.pathname);
    const { includingReserve, ...recorded } = JSON.parse(readFileSync(paths.audit));
    assert.deepEqual(recorded, common);
    assert.ok(includingReserve.splitPairs > openAudit.splitPairs);
    const reserve = JSON.parse(readFileSync(paths.reserve));
    assert.match(reserve.sha256, /^[0-9a-f]{64}$/);
    assert.equal(reserve.state, 'unconsumed');
    assert.equal(reserve.evaluationRuns, 0);
    assert.equal(reserve.qualificationHoldout, false);
    process.stdout.write('Verified open corpus, blind packets and audit receipts (reserve bytes unopened).\n');
  }
}
