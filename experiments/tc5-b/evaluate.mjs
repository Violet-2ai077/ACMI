// TC5-B Deterministic Evaluators & Aggregators
// Zero external dependencies. Strict TC1–TC5 tail-marker hard validation.

export function parseOutput(content) {
  if (typeof content !== 'string') {
    return { valid: false, error: 'not_string', marker: null, answer: null };
  }
  const markers = content.match(/<\|task:/g) ?? [];
  const match = /<\|task:([1-9][0-9]{0,2}|UNRESOLVED)\|>\s*$/.exec(content);
  if (markers.length !== 1 || !match) {
    return {
      valid: false,
      error: 'missing_duplicate_or_malformed_marker',
      marker: null,
      answer: null
    };
  }
  const answer = content.slice(0, match.index).trim();
  if (!answer || /```\s*$/.test(answer)) {
    return {
      valid: false,
      error: 'empty_answer_or_fenced_marker',
      marker: null,
      answer: null
    };
  }
  return { valid: true, error: null, marker: match[1], answer };
}

export function checkAnswerGroups(answer, answerChecks = []) {
  if (typeof answer !== 'string') return { pass: false, checks: [] };
  const checks = answerChecks.map(options => ({
    options,
    pass: options.some(pattern => new RegExp(pattern, 'iu').test(answer))
  }));
  return {
    pass: checks.every(c => c.pass),
    checks
  };
}

export function gradeProbe(rawContent, probe) {
  if (!probe || !probe.expected || !probe.kind) {
    throw new Error('Invalid probe passed to gradeProbe');
  }

  const parsed = parseOutput(rawContent);
  const lexical = parsed.valid
    ? checkAnswerGroups(parsed.answer, probe.answerChecks)
    : { pass: false, checks: null };

  const marker_valid = parsed.valid;
  const observed = parsed.marker;
  const expected = probe.expected;
  const marker_exact = marker_valid && observed === expected;
  const answer_minimal = marker_valid && lexical.pass;
  const pass = marker_exact && answer_minimal;

  const older_relevant = probe.recent_relevant === '1' ? '2' : '1';
  const isAmbiguous = probe.kind === 'ambiguous';

  const unresolved_marker = marker_valid && observed === 'UNRESOLVED';
  const clarified = isAmbiguous && marker_exact && answer_minimal;
  const guessed_recent = isAmbiguous && marker_valid && observed === probe.recent_relevant;
  const guessed_older = isAmbiguous && marker_valid && observed === older_relevant;
  const guessed_id1 = isAmbiguous && marker_valid && observed === '1';
  const guessed_id2 = isAmbiguous && marker_valid && observed === '2';

  const over_abstained = !isAmbiguous && marker_valid && observed === 'UNRESOLVED';
  const congruent_recency = !isAmbiguous ? probe.expected === probe.recent_relevant : null;
  const wrong_candidate =
    !isAmbiguous &&
    marker_valid &&
    ['1', '2'].includes(observed) &&
    observed !== probe.expected;

  return {
    marker_valid,
    protocol_error: parsed.error,
    kind: probe.kind,
    expected,
    observed,
    recent_relevant: probe.recent_relevant,
    older_relevant,
    congruent_recency,
    marker_exact,
    answer_minimal,
    pass,
    unresolved_marker,
    clarified,
    guessed_recent,
    guessed_older,
    guessed_id1,
    guessed_id2,
    over_abstained,
    wrong_candidate,
    answer_checks: lexical.checks,
    answer: parsed.answer
  };
}

export function gradeStoryTurn(rawContent, oracleTurn) {
  if (!oracleTurn || !oracleTurn.expected) {
    throw new Error('Invalid oracleTurn passed to gradeStoryTurn');
  }
  const parsed = parseOutput(rawContent);
  const lexical = parsed.valid
    ? checkAnswerGroups(parsed.answer, oracleTurn.answerChecks)
    : { pass: false, checks: null };

  const canonical_exact = parsed.valid && parsed.marker === oracleTurn.expected;
  const answer_minimal = parsed.valid && lexical.pass;
  const pass = canonical_exact && answer_minimal;

  return {
    protocol: parsed.valid,
    protocol_error: parsed.error,
    story: oracleTurn.story,
    turn: oracleTurn.turn,
    kind: oracleTurn.kind,
    category: oracleTurn.category,
    expected: oracleTurn.expected,
    observed: parsed.marker,
    canonical_exact,
    answer_minimal,
    pass,
    unnecessary_abstention:
      oracleTurn.kind !== 'ambiguous' && parsed.valid && parsed.marker === 'UNRESOLVED',
    chose_recent_candidate:
      oracleTurn.kind === 'ambiguous' &&
      parsed.valid &&
      parsed.marker === oracleTurn.most_recent_candidate,
    answer_checks: lexical.checks,
    answer: parsed.answer
  };
}

function rate(count, total) {
  return total === 0 ? 0 : count / total;
}

function fmtPct(r, count, total) {
  if (total === 0) return 'N/A (0/0)';
  return `${(r * 100).toFixed(1)}% (${count}/${total})`;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function summarizeContractOverall(items) {
  const total = items.length;
  const ambig = items.filter(r => r.grade?.kind === 'ambiguous');
  const unambig = items.filter(r => r.grade?.kind === 'unambiguous');

  const ambigClarifyCount = ambig.filter(r => r.grade?.clarified === true).length;
  const ambigUnresolvedCount = ambig.filter(r => r.grade?.unresolved_marker === true).length;
  const overAbstainCount = unambig.filter(r => r.grade?.over_abstained === true).length;
  const unambigReturnExactCount = unambig.filter(r => r.grade?.marker_exact === true).length;
  const unambigPassCount = unambig.filter(r => r.grade?.pass === true).length;
  const markerValidCount = items.filter(r => r.grade?.marker_valid === true).length;
  const answerMinimalCount = items.filter(r => r.grade?.answer_minimal === true).length;
  const overallPassCount = items.filter(r => r.grade?.pass === true).length;

  const rTokens = items.map(
    r =>
      r.usage?.completion_tokens_details?.reasoning_tokens ??
      r.usage?.opencode?.tokens?.reasoning ??
      0
  );
  const latenciesSec = items.map(r => (r.latency_ms ?? 0) / 1000);

  return {
    total,
    ambiguous_total: ambig.length,
    unambiguous_total: unambig.length,
    ambiguity_clarify_count: ambigClarifyCount,
    ambiguity_clarify_rate: rate(ambigClarifyCount, ambig.length),
    ambiguity_unresolved_count: ambigUnresolvedCount,
    ambiguity_unresolved_rate: rate(ambigUnresolvedCount, ambig.length),
    over_abstention_count: overAbstainCount,
    over_abstention_rate: rate(overAbstainCount, unambig.length),
    unambiguous_return_count: unambigReturnExactCount,
    unambiguous_return_rate: rate(unambigReturnExactCount, unambig.length),
    unambiguous_pass_count: unambigPassCount,
    unambiguous_pass_rate: rate(unambigPassCount, unambig.length),
    marker_valid_count: markerValidCount,
    marker_valid_rate: rate(markerValidCount, total),
    answer_minimal_count: answerMinimalCount,
    answer_minimal_rate: rate(answerMinimalCount, total),
    overall_pass_count: overallPassCount,
    overall_pass_rate: rate(overallPassCount, total),
    mean_reasoning_tokens: mean(rTokens),
    mean_latency_s: mean(latenciesSec)
  };
}

function summarizeBiasRow(ambigItems) {
  const total = ambigItems.length;
  const unresolved_count = ambigItems.filter(r => r.grade?.unresolved_marker === true).length;
  const clarify_pass_count = ambigItems.filter(r => r.grade?.clarified === true).length;
  const guessed_recent_count = ambigItems.filter(r => r.grade?.guessed_recent === true).length;
  const guessed_older_count = ambigItems.filter(r => r.grade?.guessed_older === true).length;
  const guessed_id1_count = ambigItems.filter(r => r.grade?.guessed_id1 === true).length;
  const guessed_id2_count = ambigItems.filter(r => r.grade?.guessed_id2 === true).length;

  return {
    total,
    unresolved_count,
    unresolved_rate: rate(unresolved_count, total),
    clarify_pass_count,
    clarify_pass_rate: rate(clarify_pass_count, total),
    guessed_recent_count,
    guessed_recent_rate: rate(guessed_recent_count, total),
    guessed_older_count,
    guessed_older_rate: rate(guessed_older_count, total),
    guessed_id1_count,
    guessed_id1_rate: rate(guessed_id1_count, total),
    guessed_id2_count,
    guessed_id2_rate: rate(guessed_id2_count, total)
  };
}

function summarizeUnambiguousRow(unambigItems) {
  const total = unambigItems.length;
  const return_exact_count = unambigItems.filter(r => r.grade?.marker_exact === true).length;
  const full_pass_count = unambigItems.filter(r => r.grade?.pass === true).length;
  const over_abstention_count = unambigItems.filter(r => r.grade?.over_abstained === true).length;
  const wrong_candidate_count = unambigItems.filter(r => r.grade?.wrong_candidate === true).length;

  return {
    total,
    return_exact_count,
    return_exact_rate: rate(return_exact_count, total),
    full_pass_count,
    full_pass_rate: rate(full_pass_count, total),
    over_abstention_count,
    over_abstention_rate: rate(over_abstention_count, total),
    wrong_candidate_count,
    wrong_candidate_rate: rate(wrong_candidate_count, total)
  };
}

export function summarizeRun(records = []) {
  const expARecords = records.filter(r => r.exp === 'A');
  const expBRecords = records.filter(r => r.exp === 'B');

  const expAByContract = {};
  const expABiasTable = {};
  const expAOverAbstentionTable = {};

  for (const contract of ['C0', 'C1']) {
    const cItems = expARecords.filter(r => r.contract === contract);
    expAByContract[contract] = summarizeContractOverall(cItems);

    const cAmbig = cItems.filter(r => r.grade?.kind === 'ambiguous');
    expABiasTable[contract] = {
      recent_1: summarizeBiasRow(cAmbig.filter(r => r.grade?.recent_relevant === '1')),
      recent_2: summarizeBiasRow(cAmbig.filter(r => r.grade?.recent_relevant === '2')),
      all: summarizeBiasRow(cAmbig)
    };

    const cUnambig = cItems.filter(r => r.grade?.kind === 'unambiguous');
    expAOverAbstentionTable[contract] = {
      congruent: summarizeUnambiguousRow(
        cUnambig.filter(r => r.grade?.congruent_recency === true)
      ),
      incongruent_older: summarizeUnambiguousRow(
        cUnambig.filter(r => r.grade?.congruent_recency === false)
      ),
      all: summarizeUnambiguousRow(cUnambig)
    };
  }

  // Experiment B closed-loop aggregation
  const bTotal = expBRecords.length;
  const bProtocolCount = expBRecords.filter(r => r.grade?.protocol === true).length;
  const bCanonicalCount = expBRecords.filter(r => r.grade?.canonical_exact === true).length;
  const bAnswerMinCount = expBRecords.filter(r => r.grade?.answer_minimal === true).length;
  const bFullPassCount = expBRecords.filter(r => r.grade?.pass === true).length;
  const bAmbig = expBRecords.filter(r => r.grade?.kind === 'ambiguous');
  const bAmbigClarifiedCount = bAmbig.filter(r => r.grade?.pass === true).length;
  const bUnnecessaryAbstentions = expBRecords.filter(
    r => r.grade?.unnecessary_abstention === true
  ).length;

  const keyFocusTurns = expBRecords
    .filter(r => [6, 7, 10].includes(r.turn))
    .sort((a, b) => a.story.localeCompare(b.story) || a.turn - b.turn)
    .map(r => ({
      story: r.story,
      turn: r.turn,
      kind: r.grade?.kind,
      expected: r.grade?.expected,
      observed: r.grade?.observed,
      canonical_exact: r.grade?.canonical_exact,
      answer_minimal: r.grade?.answer_minimal,
      pass: r.grade?.pass,
      answer_preview: (r.grade?.answer ?? '').replace(/\s+/g, ' ').slice(0, 120)
    }));

  const strictLocalCriterionMet =
    bTotal === 24 &&
    bCanonicalCount === 24 &&
    bAmbigClarifiedCount === 4 &&
    bUnnecessaryAbstentions === 0;

  const totalTransportRetries = records.reduce(
    (acc, r) => acc + (Number.isInteger(r.transport_retries) ? r.transport_retries : 0),
    0
  );

  const stats = {
    total_records: records.length,
    total_transport_retries: totalTransportRetries,
    experiment_A: {
      total_tasks: expARecords.length,
      overall_by_contract: expAByContract,
      bias_decoupling: expABiasTable,
      anti_over_abstention: expAOverAbstentionTable
    },
    experiment_B: {
      total_tasks: bTotal,
      protocol_valid_count: bProtocolCount,
      protocol_valid_rate: rate(bProtocolCount, bTotal),
      canonical_exact_count: bCanonicalCount,
      canonical_exact_rate: rate(bCanonicalCount, bTotal),
      answer_minimal_count: bAnswerMinCount,
      answer_minimal_rate: rate(bAnswerMinCount, bTotal),
      full_pass_count: bFullPassCount,
      full_pass_rate: rate(bFullPassCount, bTotal),
      ambiguous_total: bAmbig.length,
      ambiguous_clarified_count: bAmbigClarifiedCount,
      ambiguous_clarified_rate: rate(bAmbigClarifiedCount, bAmbig.length),
      unnecessary_abstentions: bUnnecessaryAbstentions,
      strict_local_criterion_met: strictLocalCriterionMet,
      key_checkpoints_t6_t7_t10: keyFocusTurns
    }
  };

  const c0 = expAByContract.C0;
  const c1 = expAByContract.C1;

  const lines = [
    '# TC5-B: Implicit Ambiguity Recency/Primacy Counterbalance & Anti-Default Attribution Report',
    '',
    `- **Total Graded Tasks**: ${records.length}`,
    `- **Transport Retries**: ${totalTransportRetries} (semantic/format retries strictly 0)`,
    '',
    '## Experiment A: 32 Frozen Prefix Probes × {C0, C1} (64 Tasks)',
    '',
    '### A.1 Overall C0 vs C1 Comparison',
    '',
    '| Contract | Ambiguity Clarify Rate | Over-Abstention Rate | Unambiguous Return Rate | Marker Valid Rate | Answer Minimal Rate | Avg Reasoning Tokens | Avg Latency (s) |',
    '|---|---|---|---|---|---|---|---|',
    `| **C0** (TC5 Baseline) | ${fmtPct(c0.ambiguity_clarify_rate, c0.ambiguity_clarify_count, c0.ambiguiguous_total ?? c0.ambiguous_total)} | ${fmtPct(c0.over_abstention_rate, c0.over_abstention_count, c0.unambiguous_total)} | ${fmtPct(c0.unambiguous_return_rate, c0.unambiguous_return_count, c0.unambiguous_total)} | ${fmtPct(c0.marker_valid_rate, c0.marker_valid_count, c0.total)} | ${fmtPct(c0.answer_minimal_rate, c0.answer_minimal_count, c0.total)} | ${c0.mean_reasoning_tokens.toFixed(1)} | ${c0.mean_latency_s.toFixed(2)}s |`,
    `| **C1** (Anti-Default Contract) | ${fmtPct(c1.ambiguity_clarify_rate, c1.ambiguity_clarify_count, c1.ambiguous_total)} | ${fmtPct(c1.over_abstention_rate, c1.over_abstention_count, c1.unambiguous_total)} | ${fmtPct(c1.unambiguous_return_rate, c1.unambiguous_return_count, c1.unambiguous_total)} | ${fmtPct(c1.marker_valid_rate, c1.marker_valid_count, c1.total)} | ${fmtPct(c1.answer_minimal_rate, c1.answer_minimal_count, c1.total)} | ${c1.mean_reasoning_tokens.toFixed(1)} | ${c1.mean_latency_s.toFixed(2)}s |`,
    '',
    '### A.2 Bias Decoupling Table (Ambiguous Probes Only: Recency vs Primacy)',
    '',
    '| Contract | Prefix Recency (`recent_relevant`) | `UNRESOLVED` Marker Rate | Clarify Full Pass Rate | `guessed_recent` Rate | `guessed_older` Rate | `guessed_id1` (Primacy) Rate | `guessed_id2` Rate |',
    '|---|---|---|---|---|---|---|---|'
  ];

  for (const contract of ['C0', 'C1']) {
    for (const [rowKey, label] of [
      ['recent_1', '`recent_relevant="1"` (Recency=1, Primacy=1)'],
      ['recent_2', '`recent_relevant="2"` (Recency=2, Primacy=1)'],
      ['all', '**All Ambiguous**']
    ]) {
      const b = expABiasTable[contract][rowKey];
      lines.push(
        `| **${contract}** | ${label} | ${fmtPct(b.unresolved_rate, b.unresolved_count, b.total)} | ${fmtPct(b.clarify_pass_rate, b.clarify_pass_count, b.total)} | ${fmtPct(b.guessed_recent_rate, b.guessed_recent_count, b.total)} | ${fmtPct(b.guessed_older_rate, b.guessed_older_count, b.total)} | ${fmtPct(b.guessed_id1_rate, b.guessed_id1_count, b.total)} | ${fmtPct(b.guessed_id2_rate, b.guessed_id2_count, b.total)} |`
      );
    }
  }

  lines.push(
    '',
    '### A.3 Anti-Over-Abstention Breakdown (Unambiguous Return Control Probes Only)',
    '',
    '| Contract | Return Target vs Recency | Return Marker Exact Rate | Full Pass Rate (`marker + lexical`) | Over-Abstention (`UNRESOLVED`) Rate | Wrong Candidate Rate |',
    '|---|---|---|---|---|---|'
  );

  for (const contract of ['C0', 'C1']) {
    for (const [rowKey, label] of [
      ['congruent', '`expected === recent_relevant` (Return to Recent Candidate)'],
      ['incongruent_older', '`expected !== recent_relevant` (Return to Older Candidate)'],
      ['all', '**All Unambiguous**']
    ]) {
      const u = expAOverAbstentionTable[contract][rowKey];
      lines.push(
        `| **${contract}** | ${label} | ${fmtPct(u.return_exact_rate, u.return_exact_count, u.total)} | ${fmtPct(u.full_pass_rate, u.full_pass_count, u.total)} | ${fmtPct(u.over_abstention_rate, u.over_abstention_count, u.total)} | ${fmtPct(u.wrong_candidate_rate, u.wrong_candidate_count, u.total)} |`
      );
    }
  }

  lines.push(
    '',
    '## Experiment B: Original TC5 24-Turn Closed-Loop Regression under `SYSTEM_C1`',
    '',
    `- **Protocol Valid**: ${fmtPct(stats.experiment_B.protocol_valid_rate, bProtocolCount, bTotal)}`,
    `- **Canonical Marker Exact**: ${fmtPct(stats.experiment_B.canonical_exact_rate, bCanonicalCount, bTotal)}`,
    `- **Answer Minimal Lexical Pass**: ${fmtPct(stats.experiment_B.answer_minimal_rate, bAnswerMinCount, bTotal)}`,
    `- **Full Turn Pass (\`canonical + lexical\`)**: ${fmtPct(stats.experiment_B.full_pass_rate, bFullPassCount, bTotal)}`,
    `- **Implicit Ambiguity Clarified (\`t6\`, \`t10\`)**: ${fmtPct(stats.experiment_B.ambiguous_clarified_rate, bAmbigClarifiedCount, bAmbig.length)}`,
    `- **Unnecessary Abstentions**: ${bUnnecessaryAbstentions}`,
    `- **Strict Local Criterion Met**: \`${strictLocalCriterionMet}\``,
    '',
    '### B.1 Key TC5 Failure Checkpoints (`t6`, `t7`, `t10`) Status under `SYSTEM_C1`',
    '',
    '| Story | Turn | Kind | Expected Marker | Observed Marker | Marker Exact | Lexical Pass | Full Pass | Answer Preview |',
    '|---|---|---|---|---|---|---|---|---|'
  );

  for (const k of keyFocusTurns) {
    lines.push(
      `| \`${k.story}\` | \`t${k.turn}\` | \`${k.kind}\` | \`${k.expected}\` | \`${k.observed}\` | \`${k.canonical_exact}\` | \`${k.answer_minimal}\` | \`${k.pass}\` | ${k.answer_preview} |`
    );
  }

  lines.push(
    '',
    '### B.2 Full 24-Turn Closed-Loop Trajectory Summary',
    '',
    '| Story | Turn | Kind | Expected | Observed | Marker Exact | Lexical Pass | Full Pass |',
    '|---|---|---|---|---|---|---|---|'
  );

  const sortedB = [...expBRecords].sort(
    (a, b) => a.story.localeCompare(b.story) || a.turn - b.turn
  );
  for (const r of sortedB) {
    lines.push(
      `| \`${r.story}\` | \`t${r.turn}\` | \`${r.grade?.kind}\` | \`${r.grade?.expected}\` | \`${r.grade?.observed}\` | \`${r.grade?.canonical_exact}\` | \`${r.grade?.answer_minimal}\` | \`${r.grade?.pass}\` |`
    );
  }

  lines.push('');

  return {
    stats,
    markdown: lines.join('\n')
  };
}
