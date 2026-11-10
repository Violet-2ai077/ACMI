import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./annotation.mjs', import.meta.url));
const artifacts = new URL('../../docs/research/phase-0.9.2-annotation/', import.meta.url);
const files = ['reviewer-a.json', 'reviewer-b.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function temporaryDirectory(t) {
  const path = mkdtempSync(join(tmpdir(), 'acmi-annotation-test-'));
  t.after(() => {
    for (const file of readdirSync(path)) unlinkSync(join(path, file));
    rmdirSync(path);
  });
  return path;
}

test('generates reproducible answer-free packets over the same independently ordered cases', t => {
  const out = temporaryDirectory(t);
  execFileSync(process.execPath, [cli, out]);
  assert.deepEqual(readdirSync(out).sort(), files);
  const [a, b] = files.map(file => {
    const bytes = readFileSync(join(out, file));
    assert.deepEqual(bytes, readFileSync(new URL(file, artifacts)));
    return JSON.parse(bytes);
  });
  assert.equal(a.reviewLane, 'A');
  assert.equal(b.reviewLane, 'B');
  assert.equal(a.packetId, b.packetId);
  assert.equal(a.packetId, sha256(readFileSync(new URL('pilot-inputs.json', artifacts))));
  assert.equal(a.usage, 'open_unscored_annotation_dry_run');
  assert.notDeepEqual(a.cases.map(x => x.caseId), b.cases.map(x => x.caseId));
  assert.deepEqual(a.cases.toSorted(byId), b.cases.toSorted(byId));
  assert.equal(new Set(a.cases.map(x => x.caseId)).size, a.cases.length);
  assert.ok(a.cases.some(x => x.events.length >= 10));
  for (const row of a.cases) {
    assert.deepEqual(Object.keys(row).sort(),
      ['binding', 'candidates', 'caseId', 'contextStatus', 'events', 'focusEventId']);
    assert.ok(row.events.some(x => x.eventId === row.focusEventId));
    assert.equal(row.events.at(-1).eventId, row.focusEventId);
    assert.equal(new Set(row.events.map(x => x.eventId)).size, row.events.length);
    for (const event of row.events) {
      assert.deepEqual(Object.keys(event).sort(), ['eventId', 'role', 'sessionId', 'text']);
    }
    for (const candidate of row.candidates) {
      assert.deepEqual(Object.keys(candidate).sort(), ['objective', 'sessionId', 'state', 'taskId']);
    }
  }
});

function byId(a, b) {
  return a.caseId < b.caseId ? -1 : Number(a.caseId !== b.caseId);
}

test('does not replace a previously emitted reviewer packet', t => {
  const out = temporaryDirectory(t);
  execFileSync(process.execPath, [cli, out]);
  const before = files.map(file => readFileSync(join(out, file)));
  const result = spawnSync(process.execPath, [cli, out], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.deepEqual(files.map(file => readFileSync(join(out, file))), before);
});

test('research reserve has a matching raw-byte freeze and is not in the open packets', () => {
  const bytes = readFileSync(new URL('reserved-research-inputs.json', artifacts));
  const manifest = JSON.parse(readFileSync(new URL('reserved-research-manifest.json', artifacts)));
  const cases = JSON.parse(bytes);
  const open = JSON.parse(readFileSync(new URL('pilot-inputs.json', artifacts)));
  assert.equal(manifest.sha256, sha256(bytes));
  assert.equal(manifest.bytes, bytes.length);
  assert.equal(manifest.caseCount, cases.length);
  assert.equal(manifest.evaluationCount, 0);
  assert.equal(manifest.humanReviewStatus, 'pending');
  assert.equal(manifest.qualificationHoldout, false);
  const openIds = new Set(open.map(x => x.caseId));
  const openText = new Set(open.flatMap(x => x.events.map(y => y.text)));
  for (const row of cases) {
    assert.ok(!openIds.has(row.caseId));
    for (const event of row.events) assert.ok(!openText.has(event.text));
  }
});
