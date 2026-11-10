import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));

test('checked-in corpus reports, packets and reserve freeze reproduce', () => {
  assert.match(execFileSync(process.execPath, [
    fileURLToPath(new URL('./corpus.mjs', import.meta.url)), 'verify',
  ], { encoding: 'utf8' }), /Verified/);
});

test('reviewer packets are matched but differently ordered and reveal no evaluator labels', () => {
  const open = load('scripts/phase-0.9.3/data/open-corpus.json');
  const a = load('docs/annotation/phase-0.9.3-reviewer-a-packet.json');
  const b = load('docs/annotation/phase-0.9.3-reviewer-b-packet.json');
  assert.equal(a.packetId, b.packetId);
  assert.equal(a.scenarios.length, open.scenarios.length);
  assert.notDeepEqual(a.scenarios.map(x => x.id), b.scenarios.map(x => x.id));
  assert.deepEqual([...a.scenarios].sort(byId), [...b.scenarios].sort(byId));
  for (const scenario of a.scenarios) {
    assert.deepEqual(Object.keys(scenario).sort(), ['id', 'tasks', 'turns', 'workspace']);
    assert.ok(scenario.turns.some(turn => turn.focus === true));
    for (const turn of scenario.turns) {
      assert.ok(!Object.hasOwn(turn, 'expected'));
      assert.ok(!Object.hasOwn(turn, 'claims'));
    }
  }
});

function byId(a, b) {
  return a.id < b.id ? -1 : Number(a.id !== b.id);
}
