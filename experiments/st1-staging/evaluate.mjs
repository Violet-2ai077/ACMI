// ST1 Deterministic Evaluator & Report Generator (evaluate.mjs)
// Strictly uses JSON.parse(raw.trim()) with zero markdown fence stripping, zero repair, and zero LLM Judge.

export function parseStrictJson(rawContent) {
  if (typeof rawContent !== 'string') {
    return { valid: false, value: null, error: 'not_string' };
  }
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return { valid: false, value: null, error: 'empty_content' };
  }
  if (trimmed.startsWith('```') || trimmed.endsWith('```')) {
    return { valid: false, value: null, error: 'markdown_fence_forbidden' };
  }
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, value: null, error: 'root_not_json_object' };
    }
    return { valid: true, value, error: null };
  } catch (err) {
    return {
      valid: false,
      value: null,
      error: `json_parse_error:${String(err.message || err)}`
    };
  }
}

export function gradeStagingOp(rawContent, expectedSpec, foldResult = null) {
  const parsed = parseStrictJson(rawContent);
  const json_valid = parsed.valid && Array.isArray(parsed.value?.ops);
  const ops = json_valid ? parsed.value.ops : [];

  const observedOpTypes = ops.map(o => String(o?.op ?? ''));
  const expectedOpTypes = expectedSpec.expected_op_types ?? [];

  const sortedObserved = [...observedOpTypes].sort().join(',');
  const sortedExpected = [...expectedOpTypes].sort().join(',');
  const op_types_exact = json_valid && sortedObserved === sortedExpected;

  // Check false_write first
  let false_write = false;
  if (json_valid) {
    if (expectedSpec.expect_noop && ops.length > 0) {
      false_write = true;
    }
    if (
      expectedSpec.forbid_assert_or_supersede &&
      ops.some(o => o?.op === 'ASSERT' || o?.op === 'SUPERSEDE')
    ) {
      false_write = true;
    }
    if (Array.isArray(expectedSpec.forbidden_keys) && expectedSpec.forbidden_keys.length > 0) {
      for (const fk of expectedSpec.forbidden_keys) {
        if (
          ops.some(
            o =>
              o?.key === fk ||
              o?.option_code === fk ||
              String(o?.summary ?? '').includes(fk)
          )
        ) {
          false_write = true;
        }
      }
    }
  }

  // Check target_id_exact
  let target_id_exact = json_valid;
  if (json_valid) {
    if (expectedSpec.expected_target_id) {
      const supOp = ops.find(o => o?.op === 'SUPERSEDE');
      if (!supOp || supOp.target_id !== expectedSpec.expected_target_id) {
        target_id_exact = false;
      }
    }
    if (expectedSpec.expected_resolve_target_id) {
      const resOp = ops.find(o => o?.op === 'RESOLVE_QUESTION');
      if (!resOp || resOp.target_id !== expectedSpec.expected_resolve_target_id) {
        target_id_exact = false;
      }
    }
    if (expectedSpec.expect_noop && ops.length > 0) {
      target_id_exact = false;
    }
  }

  // Check option_exact
  let option_exact = json_valid;
  if (json_valid) {
    if (expectedSpec.expect_noop) {
      option_exact = ops.length === 0;
    } else if (expectedSpec.expected_option_code) {
      const decOp = ops.find(o => o?.op === 'ASSERT' || o?.op === 'SUPERSEDE');
      if (!decOp || decOp.option_code !== expectedSpec.expected_option_code) {
        option_exact = false;
      }
      if (expectedSpec.expected_key && decOp && decOp.op === 'ASSERT' && decOp.key !== expectedSpec.expected_key) {
        option_exact = false;
      }
    } else if (expectedSpec.expected_question_key) {
      const qOp = ops.find(o => o?.op === 'OPEN_QUESTION');
      if (!qOp || qOp.key !== expectedSpec.expected_question_key) {
        option_exact = false;
      }
    }
  }

  // Check reason_evidence_hit
  let reason_evidence_hit = json_valid;
  if (json_valid && expectedSpec.reason_regex) {
    const supOp = ops.find(o => o?.op === 'SUPERSEDE');
    const reasonText = typeof supOp?.reason === 'string' ? supOp.reason : '';
    reason_evidence_hit = new RegExp(expectedSpec.reason_regex, 'iu').test(reasonText);
  }

  const host_rejected_ops = foldResult ? foldResult.rejected_count : 0;
  const full_pass =
    json_valid &&
    op_types_exact &&
    target_id_exact &&
    option_exact &&
    reason_evidence_hit &&
    !false_write &&
    host_rejected_ops === 0;

  return {
    json_valid,
    parse_error: parsed.error,
    observed_ops_count: ops.length,
    observed_op_types: observedOpTypes,
    expected_op_types: expectedOpTypes,
    op_types_exact,
    target_id_exact,
    option_exact,
    reason_evidence_hit,
    false_write,
    host_rejected_ops,
    full_pass
  };
}

export function gradeWorkerDelivery(rawContent, scenario) {
  const parsed = parseStrictJson(rawContent);
  const val = parsed.value;
  const schemaValid =
    parsed.valid &&
    typeof val.active_option === 'string' &&
    typeof val.reject_reproposal === 'boolean' &&
    typeof val.rejection_evidence === 'string' &&
    Array.isArray(val.open_blockers);

  if (!schemaValid) {
    return {
      json_valid: false,
      parse_error: parsed.error || 'worker_schema_mismatch',
      observed_active_option: null,
      expected_active_option: scenario.opt_c,
      active_option_exact: false,
      observed_reject_reproposal: null,
      rejected_regression: false,
      observed_rejection_evidence: null,
      tombstone_evidence_cited: false,
      observed_open_blockers: null,
      open_blockers_exact: false,
      full_pass: false
    };
  }

  const active_option_exact = val.active_option.trim() === scenario.opt_c;
  const rejected_regression = val.reject_reproposal === true;
  const tombstone_evidence_cited = new RegExp(scenario.falsify_a_regex, 'iu').test(
    val.rejection_evidence
  );
  const open_blockers_exact = val.open_blockers.length === 0;

  const full_pass =
    active_option_exact &&
    rejected_regression &&
    tombstone_evidence_cited &&
    open_blockers_exact;

  return {
    json_valid: true,
    parse_error: null,
    observed_active_option: val.active_option.trim(),
    expected_active_option: scenario.opt_c,
    active_option_exact,
    observed_reject_reproposal: val.reject_reproposal,
    rejected_regression,
    observed_rejection_evidence: val.rejection_evidence,
    tombstone_evidence_cited,
    observed_open_blockers: val.open_blockers,
    open_blockers_exact,
    full_pass
  };
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function summarizeStagingSlice(recs) {
  const total = recs.length;
  const jsonValid = recs.filter(r => r.grade.json_valid).length;
  const opTypesExact = recs.filter(r => r.grade.op_types_exact).length;
  const targetIdExact = recs.filter(r => r.grade.target_id_exact).length;
  const optionExact = recs.filter(r => r.grade.option_exact).length;
  const reasonHit = recs.filter(r => r.grade.reason_evidence_hit).length;
  const falseWrite = recs.filter(r => r.grade.false_write).length;
  const hostRejectedSteps = recs.filter(r => r.grade.host_rejected_ops > 0).length;
  const totalHostRejectedOps = recs.reduce((acc, r) => acc + (r.grade.host_rejected_ops || 0), 0);
  const fullPass = recs.filter(r => r.grade.full_pass).length;

  const rTokens = recs.map(r => r.usage?.reasoning_tokens ?? 0);
  const latencies = recs.map(r => r.elapsed_ms ?? 0);

  return {
    total,
    json_valid_count: jsonValid,
    json_valid_rate: total ? jsonValid / total : 0,
    op_types_exact_count: opTypesExact,
    op_types_exact_rate: total ? opTypesExact / total : 0,
    target_id_exact_count: targetIdExact,
    target_id_exact_rate: total ? targetIdExact / total : 0,
    option_exact_count: optionExact,
    option_exact_rate: total ? optionExact / total : 0,
    reason_evidence_hit_count: reasonHit,
    reason_evidence_hit_rate: total ? reasonHit / total : 0,
    false_write_count: falseWrite,
    false_write_rate: total ? falseWrite / total : 0,
    host_rejected_steps: hostRejectedSteps,
    total_host_rejected_ops: totalHostRejectedOps,
    full_pass_count: fullPass,
    full_pass_rate: total ? fullPass / total : 0,
    mean_reasoning_tokens: Number(mean(rTokens).toFixed(1)),
    median_reasoning_tokens: Number(median(rTokens).toFixed(1)),
    mean_elapsed_ms: Number(mean(latencies).toFixed(1))
  };
}

function summarizeWorkerSlice(recs) {
  const total = recs.length;
  const jsonValid = recs.filter(r => r.grade.json_valid).length;
  const activeExact = recs.filter(r => r.grade.active_option_exact).length;
  const rejectedReg = recs.filter(r => r.grade.rejected_regression).length;
  const tombstoneCited = recs.filter(r => r.grade.tombstone_evidence_cited).length;
  const blockersExact = recs.filter(r => r.grade.open_blockers_exact).length;
  const fullPass = recs.filter(r => r.grade.full_pass).length;

  const rTokens = recs.map(r => r.usage?.reasoning_tokens ?? 0);
  const latencies = recs.map(r => r.elapsed_ms ?? 0);

  return {
    total,
    json_valid_count: jsonValid,
    json_valid_rate: total ? jsonValid / total : 0,
    active_option_exact_count: activeExact,
    active_option_exact_rate: total ? activeExact / total : 0,
    rejected_regression_count: rejectedReg,
    rejected_regression_rate: total ? rejectedReg / total : 0,
    tombstone_evidence_cited_count: tombstoneCited,
    tombstone_evidence_cited_rate: total ? tombstoneCited / total : 0,
    open_blockers_exact_count: blockersExact,
    open_blockers_exact_rate: total ? blockersExact / total : 0,
    full_pass_count: fullPass,
    full_pass_rate: total ? fullPass / total : 0,
    mean_reasoning_tokens: Number(mean(rTokens).toFixed(1)),
    median_reasoning_tokens: Number(median(rTokens).toFixed(1)),
    mean_elapsed_ms: Number(mean(latencies).toFixed(1))
  };
}

export function summarizeRun(records) {
  const a1Records = records.filter(r => r.part === 'A1');
  const a2Records = records.filter(r => r.part === 'A2');
  const bRecords = records.filter(r => r.part === 'B');

  const a1ByStepKind = {};
  for (const kind of ['birth', 'falsify_and_supersede', 'authority_trap_noop', 'multi_hop_ruling']) {
    a1ByStepKind[kind] = summarizeStagingSlice(a1Records.filter(r => r.step_kind === kind));
  }

  const a2ByCategory = {};
  for (const cat of [
    'equal_authority_conflict',
    'local_scope_leak_trap',
    'unauthorized_resurrection_trap'
  ]) {
    a2ByCategory[cat] = summarizeStagingSlice(a2Records.filter(r => r.trap_category === cat));
  }

  const bByArm = {};
  for (const armId of [
    'raw_noisy_C0',
    'ledger_gold_C1',
    'ledger_staged_C1',
    'ledger_staged_no_tombstone_C1'
  ]) {
    bByArm[armId] = summarizeWorkerSlice(bRecords.filter(r => r.arm_id === armId));
  }

  return {
    total_records: records.length,
    part_a1_overall: summarizeStagingSlice(a1Records),
    part_a1_by_step_kind: a1ByStepKind,
    part_a2_overall: summarizeStagingSlice(a2Records),
    part_a2_by_category: a2ByCategory,
    part_b_by_arm: bByArm
  };
}

function pct(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

export function generateMarkdownReport(summary, records, meta) {
  const lines = [];
  lines.push(
    '# ST1 Report: Asynchronous Staging State Operator Extraction, Host Deterministic Folding & Cross-Worker Tombstone Anti-Regression'
  );
  lines.push('');
  lines.push(`- **Run ID**: \`${meta.run_id}\``);
  lines.push(`- **Protocol Version**: \`${meta.protocol_version}\``);
  lines.push(`- **Model**: \`${meta.model}\` (\`reasoning_effort=${meta.reasoning_effort}\`)`);
  lines.push(`- **Started At**: \`${meta.started_at}\``);
  lines.push(`- **Completed At**: \`${meta.completed_at}\``);
  lines.push(`- **Total Graded Tasks**: \`${records.length}\` (A1: 24 steps, A2: 12 traps, Part B: 24 handoffs)`);
  lines.push(`- **Transport Retries**: \`${meta.total_transport_retries}\` (Semantic/format retries: strictly 0)`);
  lines.push('');

  lines.push('## 1. Part A1: 6-Scenario × 4-Step Multi-Hop Engineering Evolution Staging (24 Steps)');
  lines.push('');
  lines.push(
    '| Step Kind | Steps | JSON Valid | Op Types Exact | Target ID Exact | Option/Key Exact | Falsification Evidence Cited | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const kind of ['birth', 'falsify_and_supersede', 'authority_trap_noop', 'multi_hop_ruling']) {
    const s = summary.part_a1_by_step_kind[kind];
    if (!s || !s.total) continue;
    lines.push(
      `| \`${kind}\` | ${s.total} | ${s.json_valid_count}/${s.total} (${pct(s.json_valid_rate)}) | ${s.op_types_exact_count}/${s.total} (${pct(s.op_types_exact_rate)}) | ${s.target_id_exact_count}/${s.total} (${pct(s.target_id_exact_rate)}) | ${s.option_exact_count}/${s.total} (${pct(s.option_exact_rate)}) | ${s.reason_evidence_hit_count}/${s.total} (${pct(s.reason_evidence_hit_rate)}) | ${s.false_write_count}/${s.total} (${pct(s.false_write_rate)}) | ${s.total_host_rejected_ops} | **${s.full_pass_count}/${s.total} (${pct(s.full_pass_rate)})** | ${s.mean_reasoning_tokens} | ${(s.mean_elapsed_ms / 1000).toFixed(2)}s |`
    );
  }
  const a1All = summary.part_a1_overall;
  if (a1All && a1All.total) {
    lines.push(
      `| **All A1 Steps** | **${a1All.total}** | **${a1All.json_valid_count}/${a1All.total} (${pct(a1All.json_valid_rate)})** | **${a1All.op_types_exact_count}/${a1All.total} (${pct(a1All.op_types_exact_rate)})** | **${a1All.target_id_exact_count}/${a1All.total} (${pct(a1All.target_id_exact_rate)})** | **${a1All.option_exact_count}/${a1All.total} (${pct(a1All.option_exact_rate)})** | **${a1All.reason_evidence_hit_count}/${a1All.total} (${pct(a1All.reason_evidence_hit_rate)})** | **${a1All.false_write_count}/${a1All.total} (${pct(a1All.false_write_rate)})** | **${a1All.total_host_rejected_ops}** | **${a1All.full_pass_count}/${a1All.total} (${pct(a1All.full_pass_rate)})** | **${a1All.mean_reasoning_tokens}** | **${(a1All.mean_elapsed_ms / 1000).toFixed(2)}s** |`
    );
  }
  lines.push('');

  lines.push('## 2. Part A2: 12 Frozen Boundary Trap Probes (Authority Conflict, Local Leak & Unauthorized Resurrection)');
  lines.push('');
  lines.push(
    '| Trap Category | Probes | Expected Behavior | JSON Valid | Op Types Exact | Key/No-Op Exact | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const trapDesc = {
    equal_authority_conflict: 'ONLY `OPEN_QUESTION` (no `ASSERT`/`SUPERSEDE`)',
    local_scope_leak_trap: '`ops: []` (no global write for local params)',
    unauthorized_resurrection_trap: '`ops: []` (no rollback to tombstoned `OPT_A`)'
  };

  for (const cat of [
    'equal_authority_conflict',
    'local_scope_leak_trap',
    'unauthorized_resurrection_trap'
  ]) {
    const s = summary.part_a2_by_category[cat];
    if (!s || !s.total) continue;
    lines.push(
      `| \`${cat}\` | ${s.total} | ${trapDesc[cat]} | ${s.json_valid_count}/${s.total} (${pct(s.json_valid_rate)}) | ${s.op_types_exact_count}/${s.total} (${pct(s.op_types_exact_rate)}) | ${s.option_exact_count}/${s.total} (${pct(s.option_exact_rate)}) | **${s.false_write_count}/${s.total} (${pct(s.false_write_rate)})** | ${s.total_host_rejected_ops} | **${s.full_pass_count}/${s.total} (${pct(s.full_pass_rate)})** | ${s.mean_reasoning_tokens} | ${(s.mean_elapsed_ms / 1000).toFixed(2)}s |`
    );
  }
  const a2All = summary.part_a2_overall;
  if (a2All && a2All.total) {
    lines.push(
      `| **All A2 Traps** | **${a2All.total}** | **3 Categories × 4** | **${a2All.json_valid_count}/${a2All.total} (${pct(a2All.json_valid_rate)})** | **${a2All.op_types_exact_count}/${a2All.total} (${pct(a2All.op_types_exact_rate)})** | **${a2All.option_exact_count}/${a2All.total} (${pct(a2All.option_exact_rate)})** | **${a2All.false_write_count}/${a2All.total} (${pct(a2All.false_write_rate)})** | **${a2All.total_host_rejected_ops}** | **${a2All.full_pass_count}/${a2All.total} (${pct(a2All.full_pass_rate)})** | **${a2All.mean_reasoning_tokens}** | **${(a2All.mean_elapsed_ms / 1000).toFixed(2)}s** |`
    );
  }
  lines.push('');

  lines.push('## 3. Part B: Cross-Worker Handoff & Tombstone Anti-Regression (6 Scenarios × 4 Arms = 24 Tasks)');
  lines.push('');
  lines.push(
    '| Arm ID | Contract | Handoff Context | JSON Valid | Active Option Exact (`OPT_C`) | Rejected Regression (`true`) | Tombstone Evidence Cited (`falsify_a`) | Open Blockers Exact (`[]`) | Full Pass | Mean CoT Tokens | Mean Latency (s) |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const armDesc = {
    raw_noisy_C0: 'Verbatim Step 1-4 raw dialogue transcript (apple-to-apple)',
    ledger_gold_C1: 'Gold Host-folded ledger (`active` + `tombstones` + `open_questions`)',
    ledger_staged_C1: 'Actual Part A1 staged & Host-folded ledger (`active` + `tombstones` + `open_questions`)',
    ledger_staged_no_tombstone_C1: 'Actual Part A1 staged ledger WITHOUT `tombstones` (`active` + `open_questions` only)'
  };

  for (const armId of [
    'raw_noisy_C0',
    'ledger_gold_C1',
    'ledger_staged_C1',
    'ledger_staged_no_tombstone_C1'
  ]) {
    const s = summary.part_b_by_arm[armId];
    if (!s || !s.total) continue;
    const contractLabel = armId.endsWith('_C0') ? '`C0`' : '`C1`';
    lines.push(
      `| \`${armId}\` | ${contractLabel} | ${armDesc[armId]} | ${s.json_valid_count}/${s.total} (${pct(s.json_valid_rate)}) | **${s.active_option_exact_count}/${s.total} (${pct(s.active_option_exact_rate)})** | **${s.rejected_regression_count}/${s.total} (${pct(s.rejected_regression_rate)})** | **${s.tombstone_evidence_cited_count}/${s.total} (${pct(s.tombstone_evidence_cited_rate)})** | **${s.open_blockers_exact_count}/${s.total} (${pct(s.open_blockers_exact_rate)})** | **${s.full_pass_count}/${s.total} (${pct(s.full_pass_rate)})** | ${s.mean_reasoning_tokens} | ${(s.mean_elapsed_ms / 1000).toFixed(2)}s |`
    );
  }
  lines.push('');

  lines.push('## 4. Per-Scenario Part B Matrix (6 Scenarios × 4 Arms)');
  lines.push('');
  lines.push(
    '| Scenario | Expected Active / Falsify A | `raw_noisy_C0` | `ledger_gold_C1` | `ledger_staged_C1` | `ledger_staged_no_tombstone_C1` |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');

  const bRecords = records.filter(r => r.part === 'B');
  const scenarioIds = [...new Set(bRecords.map(r => r.scenario_id))];

  for (const scId of scenarioIds) {
    const scRecs = bRecords.filter(r => r.scenario_id === scId);
    const ref = scRecs[0];
    const fmtArm = armId => {
      const r = scRecs.find(x => x.arm_id === armId);
      if (!r) return '-';
      const g = r.grade;
      if (!g.json_valid) return 'INVALID_JSON';
      const flags = [
        `act=${g.observed_active_option}`,
        `rej=${g.rejected_regression}`,
        `evid=${g.tombstone_evidence_cited}`,
        `blk=${g.open_blockers_exact}`
      ].join(', ');
      return g.full_pass ? `**PASS** (${flags})` : `FAIL (${flags})`;
    };
    lines.push(
      `| \`${scId}\` | \`${ref?.expected_active_option}\` / \`${ref?.falsify_a_code}\` | ${fmtArm('raw_noisy_C0')} | ${fmtArm('ledger_gold_C1')} | ${fmtArm('ledger_staged_C1')} | ${fmtArm('ledger_staged_no_tombstone_C1')} |`
    );
  }
  lines.push('');

  return lines.join('\n');
}
