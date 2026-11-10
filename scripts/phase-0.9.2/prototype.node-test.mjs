import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { guardProposal, runScenario } from './prototype-engine.mjs';
import { runPrototype } from './prototype.mjs';

test('prototype export does not overwrite evidence in an existing output directory', async (t) => {
  const out = await mkdtemp(join(tmpdir(), 'acmi-092-prototype-test-'));
  t.after(() => rm(out, { recursive: true }));
  const path = join(out, 'scenarios.json');
  await writeFile(path, 'prior evidence');
  await assert.rejects(runPrototype(out), { code: 'EEXIST' });
  assert.equal(await readFile(path, 'utf8'), 'prior evidence');
});

const owner = 'rack-lab';
const cand = (id, objective, workspace = owner, revision = 1) => ({
  id, objective, workspace, revision, status: 'open', workNode: `${id}-node`,
  source: 'snapshot', observedAt: 0,
});
const candidates = [cand('a', 'Hydraulic fitting'), cand('b', 'Optical tuner')];
const event = (seq, text, overrides = {}) => ({
  id: `j:${seq}`, seq, epoch: 'j', session: 's', workspace: owner,
  text, role: 'user', graphRevision: 1, policyVersion: 'p1',
  binding: null, candidates, revisions: { a: 1, b: 1 }, facts: [], ...overrides,
});
const run = (events, config = 'event-state-hybrid') => runScenario({ events }, config);

test('role noise, quoted commands and unresolved references are distinct', () => {
  const rows = run([
    event(1, 'Switch to Hydraulic fitting', { role: 'assistant' }),
    event(2, 'The record says "Switch to Optical tuner".'),
    event(3, 'Continue that one'),
  ]);
  assert.deepEqual(rows.map(({ routing }) => routing), ['no_task', 'no_task', 'uncertain']);
  assert.ok(rows.every(({ proposal }) => proposal === null));
});

test('A/B/A uses a local, revision-checked recent anchor rather than binding', () => {
  const rows = run([
    event(1, 'Resume Hydraulic fitting', { binding: 'a' }),
    event(2, 'Switch to Optical tuner', { binding: 'b' }),
    event(3, 'Go back to the previous task', { binding: 'b' }),
    event(4, 'Go back to the previous task', { binding: 'b', graphRevision: 2, revisions: { a: 2, b: 1 } }),
  ]);
  assert.equal(rows[2].taskId, 'a');
  assert.equal(rows[3].routing, 'uncertain');
  assert.ok(rows[3].state.invalidations.includes('candidate_revision:a'));
});

test('journal replay, gaps, epochs, session changes and rewinds do not reapply state', () => {
  const rows = run([
    event(1, 'Resume Hydraulic fitting'),
    event(2, 'Switch to Optical tuner', { binding: 'b' }),
    event(2, 'Switch to Optical tuner', { binding: 'b' }),
    event(4, 'Go back to the previous task', { binding: 'b' }),
    event(1, 'Go back to the previous task', { epoch: 'other', binding: 'b', id: 'other:1' }),
    event(1, 'Go back to the previous task', { session: 'second', binding: 'b' }),
  ]);
  assert.deepEqual(rows.map(({ state }) => state.lastSeq), [1, 2, 2, 4, 1, 1]);
  assert.equal(rows[2].state.replay, true);
  assert.deepEqual(rows.slice(3).map(({ taskId }) => taskId), [null, null, null]);
  assert.deepEqual(rows[3].state.invalidations, ['cursor_gap']);
  assert.deepEqual(rows[4].state.invalidations, ['epoch_change']);
  assert.deepEqual(rows[5].state.invalidations, []);
});

test('task switch and lifecycle objective amendment remain separate', () => {
  const [amend, move] = run([
    event(1, 'Change the objective to half the pressure drop', { binding: 'a' }),
    event(2, 'Switch to Optical tuner', { binding: 'a' }),
  ]);
  assert.deepEqual([amend.routing, amend.workIntent, amend.proposal.kind, amend.taskId],
    ['continue', 'amend_objective', 'amend_objective', 'a']);
  assert.deepEqual([move.routing, move.workIntent, move.proposal.kind, move.taskId],
    ['switch', 'switch_task', 'suggest_switch', 'b']);
  assert.equal(move.state.binding, 'a');
  assert.equal(move.guard.executed, false);
});

test('foreign, stale and unproven proposals are rejected independently of route', () => {
  const e = event(1, 'Switch to Hydraulic fitting', { candidates: [cand('a', 'Hydraulic fitting', 'other')], graphRevision: 2 });
  const proposal = { kind: 'suggest_switch', taskId: 'a', candidateRevision: 1, graphRevision: 2, evidence: ['turn:j:1', 'candidate:a:1'] };
  assert.equal(guardProposal(e, proposal).reason, 'foreign_workspace');
  assert.equal(guardProposal({ ...e, candidates, revisions: { a: 2 } }, proposal).reason, 'stale_candidate');
  assert.equal(guardProposal({ ...e, candidates }, { ...proposal, evidence: [] }).reason, 'missing_turn_evidence');
  assert.equal(run([e], 'hierarchical')[0].routing, 'uncertain');
  assert.equal(run([e], 'flat-reference')[0].guard.reason, 'foreign_workspace');
});

test('typed host facts can trigger review but are not task binding or execution', () => {
  const rows = run([
    event(1, 'routine stream', { role: 'tool', facts: [{ type: 'subagent_result', source: 'tool', id: 'untrusted', observedAt: 1 }] }),
    event(2, 'routine stream', { role: 'tool', facts: [{ type: 'subagent_result', source: 'host', id: 'trusted', observedAt: 2 }] }),
  ]);
  assert.equal(rows[0].analyzed, false);
  assert.equal(rows[1].turnAct, 'runtime_event');
  assert.deepEqual(rows[1].evidence, ['fact:trusted']);
  assert.equal(rows[1].proposal, null);
  assert.equal(rows[1].state.binding, null);
  assert.equal(rows[1].guard.executed, false);
});

test('trigger ablation distinguishes review recall from correct routing', () => {
  const e = event(1, 'Pick up where we left off.', { binding: 'a' });
  assert.equal(run([e])[0].analyzed, false);
  assert.equal(run([e], 'ablate-no-trigger')[0].taskId, 'a');
  const [ablated] = run([event(1, 'Resume Hydraulic fitting')], 'ablate-no-trigger');
  assert.equal(ablated.trigger, null);
  assert.equal(ablated.cost.triggerChars, 0);
});

test('unterminated quotation at the input budget does not become a directive', () => {
  const [row] = run([event(1, `Log line: "Switch to Hydraulic fitting ${'x'.repeat(650)}"`)]);
  assert.equal(row.routing, 'no_task');
  assert.equal(row.proposal, null);
});

test('an invalid negative candidate budget cannot expose IDs outside the window', () => {
  const [row] = run([event(1, 'Switch to task:a', { maxCandidates: -1 })]);
  assert.equal(row.routing, 'uncertain');
  assert.equal(row.reason, 'requested_id_unavailable');
  assert.equal(row.cost.candidateComparisons, 0);
});
