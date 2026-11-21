// TC3-B Deterministic Evaluator & Report Generator
// Strictly reuses original TC1–TC3 parseOutput and answerChecks,
// plus gap-bucket statistics (birth_or_continue / short_return / long_return) and diagnostic closed_fence_detached_marker.

export function parseOutput(content) {
  if (typeof content !== 'string') {
    return { valid: false, error: 'not_string', marker: null, answer: null };
  }
  const markers = content.match(/<\|task:/g) ?? [];
  const match = /<\|task:([1-9][0-9]{0,2}|UNRESOLVED)\|>\s*$/.exec(content);
  if (markers.length !== 1 || !match) {
    return { valid: false, error: 'missing_duplicate_or_malformed_marker', marker: null, answer: null };
  }
  const answer = content.slice(0, match.index).trim();
  if (!answer || /```\s*$/.test(answer)) {
    return { valid: false, error: 'empty_answer_or_fenced_marker', marker: null, answer: null };
  }
  return { valid: true, error: null, marker: match[1], answer };
}

// Purely diagnostic detector: when model wraps the SMS/email draft in a closed code block ```...```
// and places <|task:N|> outside after the closing ``` fence.
// Does NOT count as strict_valid, canonical_exact, or full_pass.
export function inspectClosedFenceDetachedMarker(content) {
  if (typeof content !== 'string') {
    return { closed_fence_detached_marker: false, detached_marker: null, detached_body: null };
  }
  const markers = content.match(/<\|task:/g) ?? [];
  const match = /<\|task:([1-9][0-9]{0,2}|UNRESOLVED)\|>\s*$/.exec(content);
  if (markers.length !== 1 || !match) {
    return { closed_fence_detached_marker: false, detached_marker: null, detached_body: null };
  }
  const answer = content.slice(0, match.index).trim();
  if (answer.length > 0 && /```\s*$/.test(answer)) {
    return {
      closed_fence_detached_marker: true,
      detached_marker: match[1],
      detached_body: answer
    };
  }
  return { closed_fence_detached_marker: false, detached_marker: null, detached_body: null };
}

export function checkAnswerMinimal(answerText, answerChecks) {
  if (typeof answerText !== 'string' || !Array.isArray(answerChecks)) {
    return { pass: false, checks: [] };
  }
  const checks = answerChecks.map(options => ({
    options,
    pass: options.some(pattern => new RegExp(pattern, 'iu').test(answerText))
  }));
  return {
    pass: checks.every(c => c.pass),
    checks
  };
}

export function gradeTurn(rawContent, oracleTurn) {
  const parsed = parseOutput(rawContent);
  const fenceDiag = inspectClosedFenceDetachedMarker(rawContent);

  const answerCheckResult = parsed.valid
    ? checkAnswerMinimal(parsed.answer, oracleTurn.answerChecks)
    : { pass: false, checks: [] };

  const strict_valid = parsed.valid;
  const canonical_exact = strict_valid && parsed.marker === oracleTurn.expected;
  const answer_minimal = strict_valid ? answerCheckResult.pass : false;
  const full_pass = strict_valid && canonical_exact && answer_minimal;

  return {
    turn: oracleTurn.turn,
    source_id: oracleTurn.source_id,
    task_key: oracleTurn.task_key,
    kind: oracleTurn.kind,
    birth_turn: oracleTurn.birth_turn,
    previous_visit_turn: oracleTurn.previous_visit_turn,
    gap_turns: oracleTurn.gap_turns,
    gap_bucket: oracleTurn.gap_bucket,
    expected: oracleTurn.expected,
    observed: parsed.marker,
    strict_valid,
    protocol_error: parsed.error,
    canonical_exact,
    answer_minimal,
    full_pass,
    answer_checks: answerCheckResult.checks,
    answer: parsed.answer,
    closed_fence_detached_marker: fenceDiag.closed_fence_detached_marker,
    detached_marker: fenceDiag.detached_marker
  };
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function evaluateConditionTrajectory(condRecords) {
  const sorted = [...condRecords].sort((a, b) => a.turn - b.turn);
  const byTurn = new Map(sorted.map(r => [r.turn, r]));

  const births = sorted.filter(r => r.grade.kind === 'birth');
  const birthMarkerByBirthTurn = new Map();
  let allBirthsValidNumeric = births.length === 5;
  const seenBirthMarkers = new Set();

  for (const b of births) {
    const m = b.grade.observed;
    if (!b.grade.strict_valid || !/^[1-9][0-9]{0,2}$/.test(String(m ?? ''))) {
      allBirthsValidNumeric = false;
    } else {
      birthMarkerByBirthTurn.set(b.turn, m);
      seenBirthMarkers.add(m);
    }
  }
  const uniqueBirthMarkers = allBirthsValidNumeric && seenBirthMarkers.size === births.length;

  const returnAssessments = sorted
    .filter(r => r.grade.kind === 'return')
    .map(r => {
      const targetBirthMarker = birthMarkerByBirthTurn.get(r.grade.birth_turn) ?? null;
      const obs = r.grade.observed;
      if (!uniqueBirthMarkers) {
        return {
          turn: r.turn,
          task_key: r.grade.task_key,
          gap_turns: r.grade.gap_turns,
          gap_bucket: r.grade.gap_bucket,
          expected: r.grade.expected,
          actual_birth_marker: targetBirthMarker,
          observed: obs,
          assessable: false,
          restored: false,
          reason: 'birth_missing_invalid_or_collision'
        };
      }
      const restored = r.grade.strict_valid && obs === targetBirthMarker;
      let reason = null;
      if (!restored) {
        const prevTurnRec = byTurn.get(r.turn - 1);
        const prevMarker = prevTurnRec?.grade?.observed ?? null;
        if (!r.grade.strict_valid) reason = 'return_protocol_invalid';
        else if (obs === 'UNRESOLVED') reason = 'unnecessary_abstention';
        else if (obs === prevMarker) reason = 'previous_task_marker_reused';
        else if (seenBirthMarkers.has(obs)) reason = 'other_established_task_marker';
        else reason = 'fresh_marker_on_return';
      }
      return {
        turn: r.turn,
        task_key: r.grade.task_key,
        gap_turns: r.grade.gap_turns,
        gap_bucket: r.grade.gap_bucket,
        expected: r.grade.expected,
        actual_birth_marker: targetBirthMarker,
        observed: obs,
        assessable: true,
        restored,
        reason
      };
    });

  return {
    unique_birth_markers: uniqueBirthMarkers,
    return_assessments: returnAssessments
  };
}

function summarizeSlice(records) {
  const total = records.length;
  const strictValidCount = records.filter(r => r.grade.strict_valid).length;
  const canonicalExactCount = records.filter(r => r.grade.canonical_exact).length;
  const answerMinimalCount = records.filter(r => r.grade.answer_minimal).length;
  const fullPassCount = records.filter(r => r.grade.full_pass).length;
  const closedFenceCount = records.filter(r => r.grade.closed_fence_detached_marker).length;
  const unresolvedCount = records.filter(r => r.grade.observed === 'UNRESOLVED').length;

  const reasoningTokens = records.map(r => r.usage?.reasoning_tokens ?? 0);
  const elapsedMs = records.map(r => r.elapsed_ms ?? 0);

  return {
    total,
    strict_valid_count: strictValidCount,
    strict_valid_rate: total ? strictValidCount / total : 0,
    canonical_exact_count: canonicalExactCount,
    canonical_exact_rate: total ? canonicalExactCount / total : 0,
    answer_minimal_count: answerMinimalCount,
    answer_minimal_rate: total ? answerMinimalCount / total : 0,
    full_pass_count: fullPassCount,
    full_pass_rate: total ? fullPassCount / total : 0,
    closed_fence_detached_count: closedFenceCount,
    unresolved_count: unresolvedCount,
    mean_reasoning_tokens: Number(mean(reasoningTokens).toFixed(1)),
    median_reasoning_tokens: Number(median(reasoningTokens).toFixed(1)),
    mean_elapsed_ms: Number(mean(elapsedMs).toFixed(1))
  };
}

export function summarizeRun(records) {
  const conditionIds = ['S0_baseline', 'S1_strip_cot', 'S2_strip_cot_and_header'];
  const bucketIds = ['birth_or_continue', 'short_return', 'long_return'];

  const byCondition = {};
  const byConditionAndBucket = {};

  for (const condId of conditionIds) {
    const condRecs = records.filter(r => r.condition_id === condId);
    if (!condRecs.length) continue;

    const traj = evaluateConditionTrajectory(condRecs);
    const overall = summarizeSlice(condRecs);
    const returnsAssessed = traj.return_assessments.filter(a => a.assessable).length;
    const returnsRestored = traj.return_assessments.filter(a => a.restored).length;

    const t24 = condRecs.find(r => r.turn === 24);

    byCondition[condId] = {
      ...overall,
      conditional_restoration_assessed: returnsAssessed,
      conditional_restoration_correct: returnsRestored,
      conditional_restoration_rate: returnsAssessed ? returnsRestored / returnsAssessed : 0,
      turn_24_gap_14: t24
        ? {
            expected: t24.grade.expected,
            observed: t24.grade.observed,
            strict_valid: t24.grade.strict_valid,
            canonical_exact: t24.grade.canonical_exact,
            answer_minimal: t24.grade.answer_minimal,
            full_pass: t24.grade.full_pass,
            reasoning_tokens: t24.usage?.reasoning_tokens ?? 0,
            elapsed_ms: t24.elapsed_ms ?? 0
          }
        : null,
      return_assessments: traj.return_assessments
    };

    byConditionAndBucket[condId] = {};
    for (const bId of bucketIds) {
      const bRecs = condRecs.filter(r => r.grade.gap_bucket === bId);
      byConditionAndBucket[condId][bId] = summarizeSlice(bRecs);
    }
  }

  return {
    total_records: records.length,
    by_condition: byCondition,
    by_condition_and_bucket: byConditionAndBucket
  };
}

function pct(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

export function generateMarkdownReport(summary, records, meta) {
  const lines = [];
  lines.push('# TC3-B Report: De-Greenhouse 24-Turn Task Continuity Stress Test');
  lines.push('');
  lines.push(`- **Run ID**: \`${meta.run_id}\``);
  lines.push(`- **Protocol Version**: \`${meta.protocol_version}\``);
  lines.push(`- **System Prompt**: \`SYSTEM_C0\` (Verbatim original TC1-TC3 prompt; single factor varied = history stripping)`);
  lines.push(`- **Model**: \`${meta.model}\` (\`reasoning_effort=${meta.reasoning_effort}\`)`);
  lines.push(`- **Started At**: \`${meta.started_at}\``);
  lines.push(`- **Completed At**: \`${meta.completed_at}\``);
  lines.push(`- **Total API Calls**: \`${records.length}\` (3 conditions x 24 turns)`);
  lines.push(`- **Transport Retries**: \`${meta.total_transport_retries}\``);
  lines.push('');

  lines.push('## 1. Overall Condition Comparison (24 Turns per Condition)');
  lines.push('');
  lines.push('| Condition | History Retained | Strict Valid | Canonical Exact | Return Restoration (19 turns) | Answer Minimal | Full Pass | Closed-Fence Diagnostic | Mean Reasoning Tokens | Mean Latency (s) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const conditionLabels = {
    S0_baseline: 'content + reasoning_content (Unstripped)',
    S1_strip_cot: 'content only (CoT stripped)',
    S2_strip_cot_and_header: 'content only + stripExplicitHeaders(content)'
  };

  for (const condId of ['S0_baseline', 'S1_strip_cot', 'S2_strip_cot_and_header']) {
    const c = summary.by_condition[condId];
    if (!c) continue;
    lines.push(
      `| \`${condId}\` | ${conditionLabels[condId]} | ${c.strict_valid_count}/${c.total} (${pct(c.strict_valid_rate)}) | **${c.canonical_exact_count}/${c.total} (${pct(c.canonical_exact_rate)})** | ${c.conditional_restoration_correct}/${c.conditional_restoration_assessed} (${pct(c.conditional_restoration_rate)}) | ${c.answer_minimal_count}/${c.total} (${pct(c.answer_minimal_rate)}) | **${c.full_pass_count}/${c.total} (${pct(c.full_pass_rate)})** | ${c.closed_fence_detached_count} | ${c.mean_reasoning_tokens} | ${(c.mean_elapsed_ms / 1000).toFixed(2)}s |`
    );
  }
  lines.push('');

  lines.push('## 2. Accuracy & Reasoning Effort Breakdown by Gap Span Bucket');
  lines.push('');
  lines.push('- **`birth_or_continue`** (5 turns: `t1, t2, t4, t5, t7`, `gap_turns = 0`)');
  lines.push('- **`short_return`** (16 turns: `t3, t6, t8, t10, t11, t13, t14, t15, t16, t17, t18, t19, t20, t21, t22, t23`, `gap_turns = 1..4`)');
  lines.push('- **`long_return`** (3 turns: `t9` [`gap=5`], `t12` [`gap=5`], `t24` [`gap=14`])');
  lines.push('');
  lines.push('| Condition | Gap Bucket | Turns | Canonical Exact | Answer Minimal | Full Pass | Closed-Fence Diagnostic | Mean Reasoning Tokens | Median Reasoning Tokens | Mean Latency (s) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const condId of ['S0_baseline', 'S1_strip_cot', 'S2_strip_cot_and_header']) {
    const buckets = summary.by_condition_and_bucket[condId];
    if (!buckets) continue;
    for (const bId of ['birth_or_continue', 'short_return', 'long_return']) {
      const b = buckets[bId];
      if (!b) continue;
      lines.push(
        `| \`${condId}\` | \`${bId}\` | ${b.total} | **${b.canonical_exact_count}/${b.total} (${pct(b.canonical_exact_rate)})** | ${b.answer_minimal_count}/${b.total} (${pct(b.answer_minimal_rate)}) | **${b.full_pass_count}/${b.total} (${pct(b.full_pass_rate)})** | ${b.closed_fence_detached_count} | ${b.mean_reasoning_tokens} | ${b.median_reasoning_tokens} | ${(b.mean_elapsed_ms / 1000).toFixed(2)}s |`
      );
    }
  }
  lines.push('');

  lines.push('## 3. Highlight: Turn 24 Extreme Long-Range Return (`south-confirmation`, `gap_turns = 14`, last visited at Turn 9)');
  lines.push('');
  lines.push('| Condition | Expected Marker | Observed Marker | Strict Valid | Canonical Exact | Answer Minimal | Full Pass | Reasoning Tokens | Latency (s) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const condId of ['S0_baseline', 'S1_strip_cot', 'S2_strip_cot_and_header']) {
    const t24 = summary.by_condition[condId]?.turn_24_gap_14;
    if (!t24) continue;
    lines.push(
      `| \`${condId}\` | \`<|task:${t24.expected}|>\` | \`${t24.observed ? `<|task:${t24.observed}|>` : 'NULL'}\` | ${t24.strict_valid ? 'PASS' : 'FAIL'} | **${t24.canonical_exact ? 'PASS' : 'FAIL'}** | ${t24.answer_minimal ? 'PASS' : 'FAIL'} | **${t24.full_pass ? 'PASS' : 'FAIL'}** | ${t24.reasoning_tokens} | ${(t24.elapsed_ms / 1000).toFixed(2)}s |`
    );
  }
  lines.push('');

  lines.push('## 4. 24-Turn Trajectory Comparison Matrix (`S0` vs `S1` vs `S2`)');
  lines.push('');
  lines.push('| Turn | Task Key | Kind | Gap | Bucket | Expected | S0 Observed (Full) | S1 Observed (Full) | S2 Observed (Full) | S0 CoT Tok | S1 CoT Tok | S2 CoT Tok |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (let t = 1; t <= 24; t++) {
    const r0 = records.find(r => r.condition_id === 'S0_baseline' && r.turn === t);
    const r1 = records.find(r => r.condition_id === 'S1_strip_cot' && r.turn === t);
    const r2 = records.find(r => r.condition_id === 'S2_strip_cot_and_header' && r.turn === t);
    const ref = r0 || r1 || r2;
    if (!ref) continue;

    const fmtCell = r => {
      if (!r) return '-';
      const obs = r.grade.observed ?? 'INVALID';
      const status = r.grade.full_pass
        ? 'PASS'
        : r.grade.canonical_exact
          ? 'MARKER_OK_ANS_FAIL'
          : r.grade.closed_fence_detached_marker
            ? `FENCE_DETACHED(${r.grade.detached_marker})`
            : 'FAIL';
      return `\`${obs}\` (${status})`;
    };

    lines.push(
      `| t${t} | \`${ref.grade.task_key}\` | \`${ref.grade.kind}\` | ${ref.grade.gap_turns} | \`${ref.grade.gap_bucket}\` | \`${ref.grade.expected}\` | ${fmtCell(r0)} | ${fmtCell(r1)} | ${fmtCell(r2)} | ${r0?.usage?.reasoning_tokens ?? '-'} | ${r1?.usage?.reasoning_tokens ?? '-'} | ${r2?.usage?.reasoning_tokens ?? '-'} |`
    );
  }
  lines.push('');

  // List any failures or discrepancies if present
  const failures = records.filter(r => !r.grade.full_pass);
  lines.push('## 5. Failure & Anomaly Log');
  lines.push('');
  if (failures.length === 0) {
    lines.push('- **Zero failures across all executed turns** (`full_pass = 100%`).');
  } else {
    lines.push('| Condition | Turn | Task Key | Gap | Expected | Observed | Strict Valid | Canonical Exact | Answer Minimal | Closed-Fence Diagnostic | Protocol Error |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const f of failures) {
      lines.push(
        `| \`${f.condition_id}\` | t${f.turn} | \`${f.grade.task_key}\` | ${f.grade.gap_turns} | \`${f.grade.expected}\` | \`${f.grade.observed ?? 'NULL'}\` | ${f.grade.strict_valid} | ${f.grade.canonical_exact} | ${f.grade.answer_minimal} | ${f.grade.closed_fence_detached_marker} | \`${f.grade.protocol_error ?? 'none'}\` |`
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}
