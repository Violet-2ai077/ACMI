import { createHash } from 'node:crypto';

const WINDOW = 6;
const FACT_LIMIT = 8;
const TEXT_LIMIT = 640;
const RECENT_LIMIT = 4;
const FRESHNESS = 12;
const triggerCue = /\b(?:switch|resume|continue|reopen|go back|return to|back to|new task|separate task|(?:change|revise|update|replace|amend) (?:the )?(?:objective|goal))\b/i;
const typedFacts = new Set(['subagent_result', 'task_conflict', 'binding_changed']);
const stop = new Set('the to for a an task workstream we you it this that previous last earlier task current where left off switch back resume continue reopen pick up move on go return proceed with take another pass at can please could start create separate new open change revise update replace amend objective goal'.split(' '));

export const configs = Object.freeze({
  'flat-reference': { stages: false, state: false, trigger: false, facts: true },
  hierarchical: { stages: true, state: false, trigger: false, facts: true },
  'event-state-hybrid': { stages: true, state: true, trigger: true, facts: true },
  'ablate-no-trigger': { stages: true, state: true, trigger: false, facts: true },
  'ablate-no-memory': { stages: true, state: true, trigger: true, facts: true, noMemory: true },
  'ablate-no-runtime-facts': { stages: true, state: true, trigger: true, facts: false },
});

function cleanText(text) {
  return text.slice(0, TEXT_LIMIT).replace(/`[^`]*(?:`|$)|"[^"]*(?:"|$)|\u201c[^\u201d]*(?:\u201d|$)/g, ' ').trim();
}

function tokens(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function classify(text) {
  if (/\b(?:change|revise|update|replace|amend) (?:the )?(?:objective|goal)\b/i.test(text)) return 'amend_objective';
  if (/\b(?:new task|(?:create|start|open) (?:a )?separate task)\b/i.test(text)) return 'new_task';
  if (/\b(?:switch(?: over)? to|move on to|go back to|return to|back to)\b/i.test(text)) return 'switch_task';
  if (/\b(?:resume|continue|reopen|pick up where we left off|take another pass (?:on|at)|proceed with)\b/i.test(text)) return 'continue_task';
  return 'none';
}

function snapshot(event) {
  const limit = event.maxCandidates ?? WINDOW;
  return event.candidates.slice(0, Number.isSafeInteger(limit) ? Math.max(0, Math.min(WINDOW, limit)) : 0);
}
const turnRef = (event) => `turn:${event.id}`;
const candidateRef = (candidate) => `candidate:${candidate.id}:${candidate.revision}`;
const revisionFor = (event, id) => Object.hasOwn(event.revisions, id) ? event.revisions[id] : null;

function candidateIssue(event, candidate) {
  if (candidate.workspace !== event.workspace) return 'foreign_workspace';
  if (revisionFor(event, candidate.id) !== candidate.revision) return 'stale_candidate';
  if (candidate.source !== 'snapshot' || !Number.isSafeInteger(candidate.observedAt) ||
      candidate.observedAt < 0 || candidate.observedAt > event.seq || event.seq - candidate.observedAt > FRESHNESS) {
    return 'unproven_candidate';
  }
  return null;
}

function trustedFacts(event, config) {
  if (!config.facts) return [];
  return event.facts.slice(0, FACT_LIMIT).filter((fact) => typedFacts.has(fact.type) && fact.source === 'host' &&
    fact.observedAt === event.seq && typeof fact.id === 'string' &&
    (fact.session === undefined || fact.session === event.session) &&
    (fact.workspace === undefined || fact.workspace === event.workspace));
}

function reconcile(event, previous, config) {
  const invalidations = [];
  const fresh = { epoch: event.epoch, lastSeq: event.seq, graphRevision: event.graphRevision,
    policyVersion: event.policyVersion, binding: event.binding, recent: [], replay: false, invalidations };
  if (!config.state) return { ...fresh, lastSeq: null };
  fresh.fingerprint = createHash('sha256').update(JSON.stringify([
    event.id, event.role, event.text.slice(0, TEXT_LIMIT), event.binding, event.graphRevision, event.policyVersion,
    snapshot(event).map(({ id, objective, workspace, revision, status, workNode, source, observedAt }) =>
      [id, objective.slice(0, TEXT_LIMIT), workspace, revision, status, workNode, source, observedAt, revisionFor(event, id)]),
    event.facts.slice(0, FACT_LIMIT),
  ])).digest('hex');
  if (!previous) return fresh;
  if (previous.epoch !== event.epoch) invalidations.push('epoch_change');
  else {
    if (event.seq <= previous.lastSeq) {
      const reason = event.seq === previous.lastSeq && fresh.fingerprint !== previous.fingerprint
        ? 'cursor_collision' : 'cursor_replay';
      if (reason === 'cursor_collision') {
        return { ...previous, recent: [], replay: true, invalidations: [reason] };
      }
      return { ...previous, replay: true, invalidations: [reason] };
    }
    if (event.seq !== previous.lastSeq + 1) invalidations.push('cursor_gap');
  }
  if (event.graphRevision < previous.graphRevision) invalidations.push('graph_rewind');
  if (event.policyVersion !== previous.policyVersion) invalidations.push('policy_change');
  if (invalidations.length || config.noMemory) return fresh;
  fresh.recent = previous.recent.filter(({ id, revision }) => {
    if (revisionFor(event, id) === revision) return true;
    invalidations.push(`candidate_revision:${id}`);
    return false;
  });
  return fresh;
}

function remember(state, candidate, config) {
  if (!candidate || !config.state || config.noMemory) return;
  state.recent = [{ id: candidate.id, revision: candidate.revision },
    ...state.recent.filter(({ id }) => id !== candidate.id)].slice(0, RECENT_LIMIT);
}

function taskTarget(event, state, intent, text, config, stages, cost) {
  const ranked = [];
  const candidates = snapshot(event);
  const invalid = [];
  const direct = text.match(/\btask:([a-z0-9_-]+)\b/i)?.[1];
  const previous = /\b(?:previous|earlier|last) (?:task|one)\b/i.test(text);
  const unresolved = /\b(?:that one|that task|the other one|same as before)\b/i.test(text);
  const current = intent === 'amend_objective' || /\b(?:this|current) task\b/i.test(text) ||
    /^(?:continue|resume|pick up where we left off|proceed)[.!?]?$/i.test(text);
  const anchors = previous && !direct
    ? state.recent.filter(({ id }) => id !== state.binding)
    : [];
  const request = new Set(tokens(text).filter((word) => !stop.has(word)));
  const phrase = tokens(text).join(' ');
  for (const candidate of candidates) {
    const issue = candidateIssue(event, candidate);
    if (issue && config.stages) {
      invalid.push({ id: candidate.id, reason: issue });
      continue;
    }
    cost.candidateComparisons++;
    const objective = tokens(candidate.objective.slice(0, TEXT_LIMIT));
    let score = 0;
    let support = null;
    if (direct) {
      score = candidate.id === direct ? 100 : 0;
      support = 'explicit_id';
    } else if (previous || unresolved) {
      const index = anchors.findIndex(({ id, revision }) => id === candidate.id && revision === candidate.revision);
      score = index < 0 ? 0 : 100 - index;
      support = 'recent_anchor';
    } else if (current) {
      score = state.binding === candidate.id ? 100 : 0;
      support = 'host_binding';
    } else if (objective.length) {
      const hits = objective.filter((word) => request.has(word)).length;
      score = hits + (hits > 0 && ` ${phrase} `.includes(` ${objective.join(' ')} `) ? 4 : 0);
      support = 'objective_terms';
    }
    if (score > 0) ranked.push({ candidate, score, support });
  }
  ranked.sort((a, b) => b.score - a.score);
  const tied = ranked.length > 1 && ranked[0].score === ranked[1].score;
  const reason = !ranked.length ? (previous ? 'missing_recent_anchor' : unresolved ? 'unresolved_reference' :
    direct ? 'requested_id_unavailable' : current ? 'binding_unavailable' : 'no_retrieval_match') :
    tied && config.stages ? 'ambiguous_candidates' : 'ranked';
  if (config.stages) {
    stages.push({ stage: 'retrieval', reason, invalid, ranked: ranked.map(({ candidate, score, support }) => ({ id: candidate.id, score, support })) });
  }
  return reason === 'ranked' ? { ...ranked[0], reason } : { candidate: null, reason };
}

function reject(reason) {
  return { disposition: 'rejected', reason, executed: false };
}

export function guardProposal(event, proposal) {
  if (!proposal) return { disposition: 'not_applicable', reason: 'no_proposal', executed: false };
  if (!['suggest_new', 'suggest_switch', 'amend_objective', 'reopen_task'].includes(proposal.kind)) return reject('unsupported_proposal');
  if (event.graphRevision !== proposal.graphRevision) return reject('stale_graph');
  if (event.role !== 'user' || !Array.isArray(proposal.evidence) || !proposal.evidence.includes(turnRef(event))) return reject('missing_turn_evidence');
  if (proposal.kind === 'suggest_new') {
    if (proposal.taskId !== null || !proposal.objectiveText) return reject('invalid_new_task');
  } else {
    const candidate = snapshot(event).find(({ id }) => id === proposal.taskId);
    if (!candidate) return reject('not_in_candidate_window');
    const issue = candidateIssue(event, candidate);
    if (issue) return reject(issue);
    if (candidate.revision !== proposal.candidateRevision || !proposal.evidence.includes(candidateRef(candidate))) return reject('missing_candidate_evidence');
    if (proposal.kind === 'amend_objective' && (event.binding !== candidate.id || !proposal.objectiveText)) return reject('unbound_objective_amendment');
    if (proposal.kind === 'reopen_task' && candidate.status !== 'closed') return reject('candidate_not_closed');
    if (proposal.kind !== 'reopen_task' && candidate.status === 'closed') return reject('candidate_closed');
  }
  return { disposition: 'host_review_only', reason: 'provenance_checks_passed', executed: false };
}

function analyze(event, state, config) {
  const cost = { triggerChars: 0, analysisChars: 0, candidateComparisons: 0, stages: 0 };
  const stages = [];
  const facts = trustedFacts(event, config);
  const text = !state.replay && event.role === 'user' ? cleanText(event.text) : '';
  let trigger = null;
  if (config.trigger && !state.replay) {
    if (facts.length) trigger = 'trusted_fact';
    else if (state.invalidations.length) trigger = 'invalidation';
    else if (text) {
      cost.triggerChars = text.length;
      if (triggerCue.test(text)) trigger = 'text_cue';
    }
  }
  const analyzed = !state.replay && (!config.trigger || trigger !== null);
  const row = { analyzed, trigger, routing: 'no_task', taskId: null, turnAct: 'non_task', workIntent: 'none',
    reason: state.replay ? state.invalidations[0] : analyzed ? 'no_task_act' : 'trigger_skip',
    proposal: null, evidence: [], state: { ...state }, stages, cost };
  if (!analyzed) return row;
  cost.analysisChars = text.length;
  const intent = classify(text);
  const runtimeEvent = facts.length > 0;
  row.turnAct = intent === 'none' ? runtimeEvent ? 'runtime_event' : 'non_task' : 'work_request';
  row.workIntent = intent;
  row.evidence = [...(intent !== 'none' ? [turnRef(event)] : []), ...facts.map(({ id }) => `fact:${id}`)];
  if (config.stages) stages.push({ stage: 'turn_act', value: row.turnAct });
  else stages.push({ stage: 'single_pass' });
  if (intent === 'none') {
    if (runtimeEvent) row.reason = 'runtime_fact_review_only';
    return row;
  }
  if (config.stages) stages.push({ stage: 'work_intent', value: intent });
  const selected = intent === 'new_task' ? { candidate: null, reason: 'explicit_new_task' } :
    taskTarget(event, state, intent, text, config, stages, cost);
  const candidate = selected.candidate;
  row.reason = selected.reason;
  const reopen = /\breopen\b/i.test(text);
  const lifecycleConflict = candidate && (reopen ? candidate.status !== 'closed' : candidate.status === 'closed');
  if (lifecycleConflict) row.reason = reopen ? 'reopen_non_closed' : 'closed_needs_explicit_reopen';
  if (lifecycleConflict || (!candidate && intent !== 'new_task')) row.routing = 'uncertain';
  else if (intent === 'new_task') row.routing = 'create';
  else if (intent === 'switch_task') row.routing = state.binding === candidate.id ? 'continue' : 'switch';
  else row.routing = 'continue';
  if (row.routing !== 'uncertain' && candidate) {
    row.taskId = candidate.id;
    row.evidence.push(candidateRef(candidate));
    if (config.stages) stages.push({ stage: 'resolution', support: selected.support, candidate: candidate.id });
    if (!candidateIssue(event, candidate)) remember(state, candidate, config);
  }
  if (row.routing !== 'uncertain') {
    const kind = row.routing === 'create' ? 'suggest_new' : row.routing === 'switch' ? 'suggest_switch' :
      intent === 'amend_objective' ? 'amend_objective' : reopen ? 'reopen_task' : null;
    if (kind) {
      const objectiveText = kind === 'amend_objective'
        ? text.split(/\b(?:objective|goal)\b\s*(?:to\s+|:\s*)?/i)[1]?.trim()
        : kind === 'suggest_new' ? text.split(/\b(?:new|separate) task\b\s*(?:for\s+|:\s*)?/i)[1]?.trim() : null;
      row.proposal = { kind, taskId: row.taskId, candidateRevision: candidate?.revision ?? null,
        graphRevision: event.graphRevision, objectiveText: objectiveText || null, evidence: [...row.evidence] };
      if (config.stages) stages.push({ stage: 'proposal', kind });
    }
  } else if (config.stages) stages.push({ stage: 'resolution', abstention: row.reason });
  row.state = { ...state };
  return row;
}

export function runScenario(scenario, configName) {
  if (!Object.hasOwn(configs, configName)) throw new Error(`Unknown configuration: ${configName}`);
  const config = configs[configName];
  const sessions = new Map();
  return scenario.events.map((event, index) => {
    const key = JSON.stringify([event.workspace, event.session]);
    const state = reconcile(event, sessions.get(key), config);
    const row = analyze(event, state, config);
    row.guard = guardProposal(event, row.proposal);
    if (config.stages && row.proposal) row.stages.push({ stage: 'guard', disposition: row.guard.disposition, reason: row.guard.reason });
    row.cost.stages = row.stages.length;
    if (config.state) sessions.set(key, state);
    const { fingerprint: _fingerprint, ...stateTrace } = row.state;
    return { index, eventId: event.id, ...row, state: stateTrace };
  });
}
