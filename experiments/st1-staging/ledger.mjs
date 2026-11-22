// ST1 Host Deterministic State Folding Engine (ledger.mjs)
// Pure-function ledger reducer. Host exclusively allocates short handles (D1, D2... / Q1, Q2...).
// Strictly validates operator types, target_id existence, and state transitions; never silently repairs invalid ops.

export function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      freezeDeep(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export const VALID_OP_TYPES = Object.freeze([
  'ASSERT',
  'SUPERSEDE',
  'OPEN_QUESTION',
  'RESOLVE_QUESTION'
]);

export function createEmptyLedger() {
  return freezeDeep({
    revision: 0,
    next_decision_num: 1,
    next_question_num: 1,
    active: [],
    tombstones: [],
    open_questions: []
  });
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Deterministically folds an array of staging operators into a new immutable ledger snapshot.
 * Invalid operators are rejected and recorded in `rejected_ops` without mutating state or repairing fields.
 */
export function foldLedger(currentLedger, ops, stepMeta = {}) {
  const sourceStep = stepMeta.source_step ?? `step_${currentLedger.revision + 1}`;

  let revision = currentLedger.revision;
  let nextDecisionNum = currentLedger.next_decision_num ?? 1;
  let nextQuestionNum = currentLedger.next_question_num ?? 1;

  const active = currentLedger.active.map(item => ({ ...item }));
  const tombstones = currentLedger.tombstones.map(item => ({ ...item }));
  const openQuestions = currentLedger.open_questions.map(item => ({ ...item }));

  const acceptedOps = [];
  const rejectedOps = [];

  if (!Array.isArray(ops)) {
    rejectedOps.push({
      index: 0,
      op: ops,
      error: 'ops_not_array'
    });
    return freezeDeep({
      ledger: {
        revision,
        next_decision_num: nextDecisionNum,
        next_question_num: nextQuestionNum,
        active,
        tombstones,
        open_questions: openQuestions
      },
      accepted_ops: acceptedOps,
      rejected_ops: rejectedOps,
      rejected_count: rejectedOps.length
    });
  }

  for (let i = 0; i < ops.length; i++) {
    const rawOp = ops[i];
    if (!rawOp || typeof rawOp !== 'object' || Array.isArray(rawOp)) {
      rejectedOps.push({ index: i, op: rawOp, error: 'op_not_object' });
      continue;
    }

    const opType = rawOp.op;
    if (!VALID_OP_TYPES.includes(opType)) {
      rejectedOps.push({ index: i, op: rawOp, error: `invalid_op_type:${String(opType)}` });
      continue;
    }

    // Model is strictly forbidden from inventing or supplying its own primary `id` handle
    if (rawOp.id !== undefined) {
      rejectedOps.push({ index: i, op: rawOp, error: 'model_invented_id_forbidden' });
      continue;
    }

    if (opType === 'ASSERT') {
      const scope = rawOp.scope;
      const key = typeof rawOp.key === 'string' ? rawOp.key.trim() : '';
      const optionCode = typeof rawOp.option_code === 'string' ? rawOp.option_code.trim() : '';
      const summary = typeof rawOp.summary === 'string' ? rawOp.summary.trim() : '';

      if (scope !== 'global') {
        rejectedOps.push({ index: i, op: rawOp, error: 'assert_non_global_scope_rejected' });
        continue;
      }
      if (!isNonEmptyString(key) || !isNonEmptyString(optionCode) || !isNonEmptyString(summary)) {
        rejectedOps.push({ index: i, op: rawOp, error: 'assert_missing_required_fields' });
        continue;
      }
      if (active.some(d => d.key === key)) {
        rejectedOps.push({ index: i, op: rawOp, error: `assert_duplicate_active_key:${key}` });
        continue;
      }

      const newId = `D${nextDecisionNum++}`;
      revision++;
      const entry = {
        id: newId,
        scope: 'global',
        key,
        option_code: optionCode,
        summary,
        source_step: sourceStep
      };
      active.push(entry);
      acceptedOps.push({ index: i, op: rawOp, allocated_id: newId });
      continue;
    }

    if (opType === 'SUPERSEDE') {
      const targetId = typeof rawOp.target_id === 'string' ? rawOp.target_id.trim() : '';
      const optionCode = typeof rawOp.option_code === 'string' ? rawOp.option_code.trim() : '';
      const summary = typeof rawOp.summary === 'string' ? rawOp.summary.trim() : '';
      const reason = typeof rawOp.reason === 'string' ? rawOp.reason.trim() : '';

      if (!isNonEmptyString(targetId) || !isNonEmptyString(optionCode) || !isNonEmptyString(summary) || !isNonEmptyString(reason)) {
        rejectedOps.push({ index: i, op: rawOp, error: 'supersede_missing_required_fields' });
        continue;
      }
      if (rawOp.scope !== undefined && rawOp.scope !== 'global') {
        rejectedOps.push({ index: i, op: rawOp, error: 'supersede_non_global_scope_rejected' });
        continue;
      }

      const activeIdx = active.findIndex(d => d.id === targetId);
      if (activeIdx === -1) {
        const inTombstones = tombstones.some(t => t.id === targetId);
        rejectedOps.push({
          index: i,
          op: rawOp,
          error: inTombstones
            ? `supersede_target_already_tombstoned:${targetId}`
            : `supersede_target_not_found:${targetId}`
        });
        continue;
      }

      const targetEntry = active[activeIdx];
      active.splice(activeIdx, 1);

      const newId = `D${nextDecisionNum++}`;
      revision++;

      tombstones.push({
        id: targetEntry.id,
        scope: targetEntry.scope,
        key: targetEntry.key,
        option_code: targetEntry.option_code,
        superseded_by: newId,
        reason,
        source_step: sourceStep
      });

      active.push({
        id: newId,
        scope: 'global',
        key: targetEntry.key,
        option_code: optionCode,
        summary,
        source_step: sourceStep
      });

      acceptedOps.push({
        index: i,
        op: rawOp,
        superseded_id: targetEntry.id,
        allocated_id: newId
      });
      continue;
    }

    if (opType === 'OPEN_QUESTION') {
      const key = typeof rawOp.key === 'string' ? rawOp.key.trim() : '';
      const summary = typeof rawOp.summary === 'string' ? rawOp.summary.trim() : '';

      if (!isNonEmptyString(key) || !isNonEmptyString(summary)) {
        rejectedOps.push({ index: i, op: rawOp, error: 'open_question_missing_required_fields' });
        continue;
      }

      const newQId = `Q${nextQuestionNum++}`;
      revision++;
      openQuestions.push({
        id: newQId,
        key,
        summary,
        status: 'open',
        resolution: null,
        source_step: sourceStep
      });
      acceptedOps.push({ index: i, op: rawOp, allocated_id: newQId });
      continue;
    }

    if (opType === 'RESOLVE_QUESTION') {
      const targetId = typeof rawOp.target_id === 'string' ? rawOp.target_id.trim() : '';
      const resolution = typeof rawOp.resolution === 'string' ? rawOp.resolution.trim() : '';

      if (!isNonEmptyString(targetId) || !isNonEmptyString(resolution)) {
        rejectedOps.push({ index: i, op: rawOp, error: 'resolve_question_missing_required_fields' });
        continue;
      }

      const qIdx = openQuestions.findIndex(q => q.id === targetId);
      if (qIdx === -1) {
        rejectedOps.push({
          index: i,
          op: rawOp,
          error: `resolve_question_target_not_found:${targetId}`
        });
        continue;
      }

      const targetQ = openQuestions[qIdx];
      if (targetQ.status !== 'open') {
        rejectedOps.push({
          index: i,
          op: rawOp,
          error: `resolve_question_already_resolved:${targetId}`
        });
        continue;
      }

      revision++;
      openQuestions[qIdx] = {
        ...targetQ,
        status: 'resolved',
        resolution,
        source_step: sourceStep
      };
      acceptedOps.push({ index: i, op: rawOp, resolved_id: targetId });
      continue;
    }
  }

  return freezeDeep({
    ledger: {
      revision,
      next_decision_num: nextDecisionNum,
      next_question_num: nextQuestionNum,
      active,
      tombstones,
      open_questions: openQuestions
    },
    accepted_ops: acceptedOps,
    rejected_ops: rejectedOps,
    rejected_count: rejectedOps.length
  });
}

/**
 * Projects a clean read-only Workspace State Ledger snapshot for prompt injection.
 * When `includeTombstones` is false (Part B Arm 4: `ledger_staged_no_tombstone_C1`),
 * omits the `tombstones` array while preserving `revision`, `active`, and `open_questions`.
 */
export function projectReadOnlyLedger(ledger, { includeTombstones = true } = {}) {
  const view = {
    revision: ledger.revision,
    active: ledger.active.map(d => ({
      id: d.id,
      scope: d.scope,
      key: d.key,
      option_code: d.option_code,
      summary: d.summary,
      source_step: d.source_step
    })),
    ...(includeTombstones
      ? {
          tombstones: ledger.tombstones.map(t => ({
            id: t.id,
            scope: t.scope,
            key: t.key,
            option_code: t.option_code,
            superseded_by: t.superseded_by,
            reason: t.reason,
            source_step: t.source_step
          }))
        }
      : {}),
    open_questions: ledger.open_questions.map(q => ({
      id: q.id,
      key: q.key,
      summary: q.summary,
      status: q.status,
      resolution: q.resolution,
      source_step: q.source_step
    }))
  };
  return freezeDeep(view);
}
