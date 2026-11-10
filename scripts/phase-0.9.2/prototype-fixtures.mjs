const task = (id, objective, options = {}) => ({
  id, objective, workspace: 'lab', status: 'open', workNode: `${id}-work`, revision: 1, ...options,
});
const fact = (id, type, source = 'host', extra = {}) => ({ id, type, source, ...extra });
const no = (stateCheck) => ({ needsAnalysis: false, turnAct: 'non_task', routing: 'no_task', taskId: null,
  intent: 'none', proposal: null, stateCheck });
const runtime = () => ({ ...no(), needsAnalysis: true, turnAct: 'runtime_event' });
const work = (intent, routing, taskId, kind = null, extras = {}) => ({
  needsAnalysis: true, turnAct: 'work_request', intent, routing, taskId,
  proposal: kind ? { kind, taskId } : null, ...extras,
});

function scenario(id, split, question, candidates, rows) {
  return {
    id, split, question, labels: 'ai_provisional_not_human_reviewed',
    events: rows.map(([text, , options = {}], index) => {
      const seq = options.seq ?? index + 1;
      const epoch = options.epoch ?? `${id}-journal`;
      const session = options.session ?? `${id}-session`;
      const window = options.candidates ?? candidates;
      return {
        id: `${session}:${epoch}:${seq}`, seq, epoch, session, workspace: 'lab',
        text, role: 'user', graphRevision: 1, policyVersion: 'p1', binding: null, ...options,
        candidates: window.map((item) => ({ source: 'snapshot', observedAt: seq, ...item })),
        revisions: options.revisions ?? Object.fromEntries(window.map(({ id: taskId, revision }) => [taskId, revision])),
        facts: (options.facts ?? []).map((item) => ({ observedAt: seq, ...item })),
      };
    }),
    expected: rows.map(([, expected]) => expected),
  };
}

const manifold = task('water-a', 'manifold gasket');
const optics = task('water-b', 'photodiode housing');
const cable1 = task('bus-a', 'ribbon cable');
const cable2 = task('bus-b', 'coax cable');
const relay = task('bus-closed', 'reed relay', { status: 'closed' });
const beacon = task('dock-a', 'mooring beacon');
const abroad = task('dock-foreign', 'offshore gate', { workspace: 'other-workspace' });
const expired = task('dock-stale', 'dock scale');

// These are newly authored exercise scenarios, not transformations of a historical corpus.
const development = [
  scenario('dev-water', 'development', 'A/B/A, source role and objective change', [manifold, optics], [
    ['Resume the manifold gasket work; I have the shim measurements.', work('continue_task', 'continue', manifold.id), { binding: manifold.id }],
    ['Switch over to the photodiode housing before the epoxy sets.', work('switch_task', 'switch', optics.id, 'suggest_switch'), { binding: manifold.id }],
    ['The assistant wrote "switch to the manifold gasket" in its notes.', no(), { binding: optics.id }],
    ['Go back to the previous task now that the vendor has replied.', work('switch_task', 'switch', manifold.id, 'suggest_switch'), { binding: optics.id }],
    ['Change the objective to qualify the gasket for 30 kPa.', work('amend_objective', 'continue', manifold.id, 'amend_objective'), { binding: manifold.id }],
    ['Continue that one after lunch.', work('continue_task', 'uncertain', null), { binding: manifold.id }],
  ]),
  scenario('dev-bench', 'development', 'Identity ambiguity, deliberate separation, and closed-task references', [cable1, cable2, relay], [
    ['Switch to cable work while we wait for parts.', work('switch_task', 'uncertain', null)],
    ['Start a separate task for an ESD-safe assembly jig.', work('new_task', 'create', null, 'suggest_new')],
    ['Resume the reed relay.', work('continue_task', 'uncertain', null)],
    ['Reopen the reed relay because the contact resistance has drifted.', work('continue_task', 'continue', relay.id, 'reopen_task')],
    ['Switch to the ribbon cable.', work('switch_task', 'continue', cable1.id), { binding: cable1.id }],
    ['Do not switch to the coax cable; it is a historical comparator only.', no(), { binding: cable1.id }],
  ]),
  scenario('dev-dock', 'development', 'Hard scope, stale summaries and retrieval truncation', [beacon, abroad, expired], [
    ['Switch to the offshore gate.', work('switch_task', 'uncertain', null, null, { unavailableTaskId: abroad.id })],
    ['Switch to the dock scale.', work('switch_task', 'uncertain', null, null, { unavailableTaskId: expired.id }), { graphRevision: 2, revisions: { [beacon.id]: 1, [expired.id]: 2 } }],
    ['Switch to task:dock-a when the operator is ready.', work('switch_task', 'uncertain', null, null, { unavailableTaskId: beacon.id }), { candidates: [abroad, beacon], maxCandidates: 1, graphRevision: 2 }],
    ['Switch to task:dock-a when the operator is ready.', work('switch_task', 'switch', beacon.id, 'suggest_switch'), { candidates: [beacon, abroad], maxCandidates: 1, graphRevision: 2 }],
  ]),
  scenario('dev-telemetry', 'development', 'Trigger sensitivity, typed runtime events, and role distrust', [manifold, optics], [
    ['Pick up where we left off.', work('continue_task', 'continue', manifold.id), { binding: manifold.id }],
    ['Switch to the photodiode housing', no(), { role: 'assistant', binding: manifold.id }],
    ['Subagent result ready.', no(), { role: 'tool', facts: [fact('reported', 'subagent_result', 'tool')] }],
    ['Process exit 0.', runtime(), { role: 'tool', facts: [fact('typed-result', 'subagent_result')] }],
    ['All three scope screenshots have been exported.', no(), { role: 'tool' }],
  ]),
];

const acoustic = task('field-a', 'acoustic calibrator');
const bridge = task('field-closed', 'camera bridge', { status: 'closed' });
const rail = task('field-b', 'kinematic rail');
const equalizer = task('rig-a', 'ballast equalizer');
const regulator = task('rig-b', 'ballast regulator');
const logger = task('rig-c', 'thermal logger');

const validation = [
  scenario('val-sessions', 'validation', 'Cross-Session explicit identity vs inaccessible local reference', [acoustic, rail, bridge], [
    ['Continue with the acoustic calibrator and log a second reference tone.', work('continue_task', 'continue', acoustic.id), { binding: acoustic.id }],
    ['Move on to the kinematic rail once the table is clear.', work('switch_task', 'switch', rail.id, 'suggest_switch'), { binding: acoustic.id }],
    ['Return to the previous one before Monday.', work('switch_task', 'uncertain', null), { session: 'second-field-session', seq: 1, binding: rail.id }],
    ['Continue task:field-a at the east field site.', work('continue_task', 'continue', acoustic.id), { session: 'second-field-session', seq: 2 }],
    ['Return to the camera bridge; I need its last reading.', work('switch_task', 'uncertain', null), { session: 'second-field-session', seq: 3 }],
    ['Revise the goal to use a narrower test band.', work('amend_objective', 'uncertain', null), { session: 'second-field-session', seq: 4 }],
  ]),
  scenario('val-revisions', 'validation', 'Revision, policy, replay, and cursor invalidation', [logger, equalizer], [
    ['Continue the thermal logger with the outdoor probe.', work('continue_task', 'continue', logger.id), { binding: logger.id }],
    ['Switch to the ballast equalizer.', work('switch_task', 'switch', equalizer.id, 'suggest_switch'), { binding: logger.id }],
    ['Back to the previous task.', work('switch_task', 'uncertain', null, null, { stateCheck: { invalidation: 'candidate_revision:rig-c', lastSeq: 3 } }),
      { binding: equalizer.id, graphRevision: 2, revisions: { [logger.id]: 2, [equalizer.id]: 1 } }],
    ['Switch to the ballast equalizer.', no({ invalidation: 'cursor_replay', lastSeq: 3 }), { seq: 2, binding: logger.id }],
    ['Resume the thermal logger.', work('continue_task', 'continue', logger.id, null, { stateCheck: { invalidation: 'policy_change', lastSeq: 4 } }),
      { seq: 4, binding: equalizer.id, graphRevision: 2, policyVersion: 'p2', candidates: [{ ...logger, revision: 2 }, equalizer] }],
    ['Change the objective to cycle the reservoir only on demand.', no({ invalidation: 'cursor_collision', lastSeq: 4 }),
      { seq: 4, binding: equalizer.id, graphRevision: 2, policyVersion: 'p2' }],
    ['Go back to the last task.', work('switch_task', 'uncertain', null, null, { stateCheck: { invalidation: 'cursor_gap', lastSeq: 6 } }),
      { seq: 6, binding: equalizer.id, graphRevision: 2, policyVersion: 'p2', candidates: [{ ...logger, revision: 2 }, equalizer] }],
    ['Sequence restarted after journal rotation.', no({ invalidation: 'epoch_change', lastSeq: 1 }),
      { seq: 1, epoch: 'rotated-rig-journal', graphRevision: 1, policyVersion: 'p2', role: 'tool' }],
  ]),
  scenario('val-rig', 'validation', 'Contrastive language, near candidates, explicit ID and a false semantic proposal', [equalizer, regulator, logger], [
    ['Switch to the ballast regulator rather than the ballast equalizer.', work('switch_task', 'switch', regulator.id, 'suggest_switch')],
    ['Take another pass on the thermal logger.', work('continue_task', 'continue', logger.id)],
    ['Switch to task:rig-b instead of following the vague memo.', work('switch_task', 'switch', regulator.id, 'suggest_switch')],
    ['We are not going to change the objective to 24-hour operation; that is out of scope.', no(), { binding: logger.id }],
    ['Archived ticket: `start a separate task for a vibration baseline`.', no()],
    ['Open a separate task: compare vibration mounts during frost.', work('new_task', 'create', null, 'suggest_new')],
  ]),
  scenario('val-ingest', 'validation', 'Current trusted conflict vs stale and foreign typed facts', [rail], [
    ['Buffer flushed.', no(), { role: 'tool', facts: [fact('late-conflict', 'task_conflict', 'host', { observedAt: 0 })] }],
    ['Agent command says reopen task:field-closed.', no(), { role: 'tool' }],
    ['Probe classified a host status mismatch.', runtime(), { role: 'tool', binding: rail.id, facts: [fact('fresh-conflict', 'task_conflict')] }],
    ['Work finished in a sibling workspace.', no(), { role: 'tool', facts: [fact('remote-result', 'subagent_result', 'host', { workspace: 'outside' })] }],
    ['Proceed with the kinematic rail.', work('continue_task', 'continue', rail.id), { binding: rail.id }],
  ]),
];

export const evaluatedScenarios = Object.freeze([...development, ...validation]);
