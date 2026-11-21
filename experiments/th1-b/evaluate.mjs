// TH1-B Deterministic Pure-Function Evaluators
// Zero external dependencies. No JSON repair, no regex extraction, no LLM Judge.

export function gradeReceiver(rawContent, scenario) {
  if (!scenario || !scenario.expected || !Array.isArray(scenario.stale_footers)) {
    throw new Error('Invalid scenario passed to gradeReceiver');
  }

  let parsed = null;
  let json_valid = false;

  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (trimmed.length > 0) {
      try {
        const candidate = JSON.parse(trimmed);
        if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsed = candidate;
          json_valid = true;
        }
      } catch {
        parsed = null;
        json_valid = false;
      }
    }
  }

  let schema_valid = false;
  let actualLatestCode = null;
  let actualSeal = null;
  let actualFooter = null;

  if (json_valid && parsed !== null) {
    const keys = Object.keys(parsed).sort();
    const exactKeys = keys.length === 2 && keys[0] === 'print_line' && keys[1] === 'trail';
    const validTrail =
      Array.isArray(parsed.trail) &&
      parsed.trail.length > 0 &&
      parsed.trail.every(item => typeof item === 'string' && item.length > 0 && !/\s/.test(item));
    const validPrintLineType =
      typeof parsed.print_line === 'string' &&
      parsed.print_line.length > 0 &&
      !/\s/.test(parsed.print_line);

    if (exactKeys && validTrail && validPrintLineType) {
      const parts = parsed.print_line.split('/');
      if (parts.length === 3 && parts.every(part => part.length > 0)) {
        schema_valid = true;
        [actualLatestCode, actualSeal, actualFooter] = parts;
      }
    }
  }

  const expectedTrail = scenario.expected.trail;
  const expectedLatestCode = expectedTrail[expectedTrail.length - 1];

  const trail_exact =
    schema_valid &&
    JSON.stringify(parsed.trail) === JSON.stringify(expectedTrail) &&
    actualLatestCode === expectedLatestCode;

  const seal_exact = schema_valid && actualSeal === scenario.expected.seal;
  const footer_exact = schema_valid && actualFooter === scenario.expected.footer;

  const pass =
    json_valid &&
    schema_valid &&
    trail_exact &&
    seal_exact &&
    footer_exact &&
    parsed.print_line === scenario.expected.print_line;

  const stale_resurrected =
    schema_valid && scenario.stale_footers.includes(actualFooter);
  const resurrected_value = stale_resurrected ? actualFooter : null;

  const local_corrupted = schema_valid && (!trail_exact || !seal_exact);

  return {
    json_valid,
    schema_valid,
    trail_exact,
    seal_exact,
    footer_exact,
    pass,
    stale_resurrected,
    resurrected_value,
    local_corrupted,
    parsed
  };
}

export function gradeCompressor(rawNote, scenario) {
  if (!scenario || !scenario.expected || !Array.isArray(scenario.stale_footers)) {
    throw new Error('Invalid scenario passed to gradeCompressor');
  }

  const text = typeof rawNote === 'string' ? rawNote : '';
  const non_empty = text.trim().length > 0;

  const leaked_stale_values = scenario.stale_footers.filter(footer => text.includes(footer));
  const leaked_stale_footer = leaked_stale_values.length > 0;
  const leaked_global_footer = text.includes(scenario.expected.footer);
  const leaked_any_footer = leaked_stale_footer || leaked_global_footer;

  const expectedTrail = scenario.expected.trail;
  const trail_codes_present =
    non_empty && expectedTrail.every(code => text.includes(code));

  let trail_order_preserved = false;
  if (trail_codes_present) {
    let prevIndex = -1;
    trail_order_preserved = true;
    for (const code of expectedTrail) {
      const idx = text.indexOf(code, prevIndex + 1);
      if (idx === -1) {
        trail_order_preserved = false;
        break;
      }
      prevIndex = idx;
    }
  }

  const seal_present = non_empty && text.includes(scenario.expected.seal);
  const local_preserved = trail_codes_present && trail_order_preserved && seal_present;

  const pass = non_empty && !leaked_stale_footer && !leaked_any_footer && local_preserved;

  return {
    non_empty,
    leaked_stale_footer,
    leaked_stale_values,
    leaked_global_footer,
    leaked_any_footer,
    trail_codes_present,
    trail_order_preserved,
    seal_present,
    local_preserved,
    pass
  };
}

function summarizeReceiverCell(items) {
  const total = items.length;
  if (total === 0) {
    return {
      total: 0,
      pass_count: 0,
      pass_rate: 0,
      stale_resurrection_count: 0,
      stale_resurrection_rate: 0,
      local_corruption_count: 0,
      local_corruption_rate: 0,
      json_valid_count: 0,
      json_valid_rate: 0
    };
  }
  const pass_count = items.filter(r => r.grade?.pass === true).length;
  const stale_resurrection_count = items.filter(r => r.grade?.stale_resurrected === true).length;
  const local_corruption_count = items.filter(r => r.grade?.local_corrupted === true).length;
  const json_valid_count = items.filter(r => r.grade?.json_valid === true).length;

  return {
    total,
    pass_count,
    pass_rate: pass_count / total,
    stale_resurrection_count,
    stale_resurrection_rate: stale_resurrection_count / total,
    local_corruption_count,
    local_corruption_rate: local_corruption_count / total,
    json_valid_count,
    json_valid_rate: json_valid_count / total
  };
}

function summarizeCompressorCell(items) {
  const total = items.length;
  if (total === 0) {
    return {
      total: 0,
      pass_count: 0,
      pass_rate: 0,
      compressor_leak_count: 0,
      compressor_leak_rate: 0,
      any_footer_leak_count: 0,
      any_footer_leak_rate: 0,
      local_preserved_count: 0,
      local_preserved_rate: 0
    };
  }
  const pass_count = items.filter(r => r.grade?.pass === true).length;
  const compressor_leak_count = items.filter(r => r.grade?.leaked_stale_footer === true).length;
  const any_footer_leak_count = items.filter(r => r.grade?.leaked_any_footer === true).length;
  const local_preserved_count = items.filter(r => r.grade?.local_preserved === true).length;

  return {
    total,
    pass_count,
    pass_rate: pass_count / total,
    compressor_leak_count,
    compressor_leak_rate: compressor_leak_count / total,
    any_footer_leak_count,
    any_footer_leak_rate: any_footer_leak_count / total,
    local_preserved_count,
    local_preserved_rate: local_preserved_count / total
  };
}

function fmtPct(rate, count, total) {
  if (total === 0) return 'N/A (0/0)';
  return `${(rate * 100).toFixed(1)}% (${count}/${total})`;
}

export const EXP_A_CONDITIONS = Object.freeze([
  'filtered_P0_C0',
  'filtered_P0_C1',
  'filtered_P1_C0',
  'filtered_P1_C1',
  'compact_P0_C0',
  'compact_P0_C1',
  'compact_P1_C0',
  'compact_P1_C1'
]);

export function summarizeRun(records = []) {
  const expARecords = records.filter(r => r.exp === 'A' && r.role === 'receiver');
  const expBCompressorRecords = records.filter(r => r.exp === 'B' && r.role === 'compressor');
  const expBReceiverRecords = records.filter(r => r.exp === 'B' && r.role === 'receiver');

  const expACells = {};
  for (const cond of EXP_A_CONDITIONS) {
    expACells[cond] = summarizeReceiverCell(expARecords.filter(r => r.condition === cond));
  }

  const expAMarginals = {
    P0: summarizeReceiverCell(expARecords.filter(r => r.pollution === 'P0')),
    P1: summarizeReceiverCell(expARecords.filter(r => r.pollution === 'P1')),
    C0: summarizeReceiverCell(expARecords.filter(r => r.contract === 'C0')),
    C1: summarizeReceiverCell(expARecords.filter(r => r.contract === 'C1')),
    filtered: summarizeReceiverCell(expARecords.filter(r => r.representation === 'filtered')),
    compact: summarizeReceiverCell(expARecords.filter(r => r.representation === 'compact'))
  };

  const expBCompressor = summarizeCompressorCell(expBCompressorRecords);
  const expBReceivers = {
    compact_strict_C0: summarizeReceiverCell(
      expBReceiverRecords.filter(r => r.condition === 'compact_strict_C0')
    ),
    compact_strict_C1: summarizeReceiverCell(
      expBReceiverRecords.filter(r => r.condition === 'compact_strict_C1')
    )
  };

  const totalTransportRetries = records.reduce(
    (acc, r) => acc + (Number.isInteger(r.transport_retries) ? r.transport_retries : 0),
    0
  );

  const stats = {
    total_records: records.length,
    total_transport_retries: totalTransportRetries,
    experiment_A: {
      total_tasks: expARecords.length,
      cells: expACells,
      marginals: expAMarginals
    },
    experiment_B: {
      total_tasks: expBCompressorRecords.length + expBReceiverRecords.length,
      compressor: expBCompressor,
      compressor_leak_rate: expBCompressor.compressor_leak_rate,
      receivers: expBReceivers
    }
  };

  const lines = [
    '# TH1-B: Stale-Rule Resurrection Single-Factor Ablation Report',
    '',
    `- **Total Graded Tasks**: ${records.length}`,
    `- **Transport Retries**: ${totalTransportRetries} (semantic/format retries strictly 0)`,
    '',
    '## Experiment A: 2×2×2 Receiver Ablation Matrix (R × P × C)',
    '',
    '| Condition | Repr (R) | Pollution (P) | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |',
    '|---|---|---|---|---|---|---|---|'
  ];

  for (const cond of EXP_A_CONDITIONS) {
    const cell = expACells[cond];
    const [repr, poll, contract] = cond.split('_');
    lines.push(
      `| \`${cond}\` | \`${repr}\` | \`${poll}\` | \`${contract}\` | ${fmtPct(cell.pass_rate, cell.pass_count, cell.total)} | ${fmtPct(cell.stale_resurrection_rate, cell.stale_resurrection_count, cell.total)} | ${fmtPct(cell.local_corruption_rate, cell.local_corruption_count, cell.total)} | ${fmtPct(cell.json_valid_rate, cell.json_valid_count, cell.total)} |`
    );
  }

  lines.push(
    '',
    '### Experiment A: Main-Effect Marginals',
    '',
    '| Factor Level | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |',
    '|---|---|---|---|---|',
    `| **P0** (Polluted w/ stale footer) | ${fmtPct(expAMarginals.P0.pass_rate, expAMarginals.P0.pass_count, expAMarginals.P0.total)} | ${fmtPct(expAMarginals.P0.stale_resurrection_rate, expAMarginals.P0.stale_resurrection_count, expAMarginals.P0.total)} | ${fmtPct(expAMarginals.P0.local_corruption_rate, expAMarginals.P0.local_corruption_count, expAMarginals.P0.total)} | ${fmtPct(expAMarginals.P0.json_valid_rate, expAMarginals.P0.json_valid_count, expAMarginals.P0.total)} |`,
    `| **P1** (Purged of stale footer) | ${fmtPct(expAMarginals.P1.pass_rate, expAMarginals.P1.pass_count, expAMarginals.P1.total)} | ${fmtPct(expAMarginals.P1.stale_resurrection_rate, expAMarginals.P1.stale_resurrection_count, expAMarginals.P1.total)} | ${fmtPct(expAMarginals.P1.local_corruption_rate, expAMarginals.P1.local_corruption_count, expAMarginals.P1.total)} | ${fmtPct(expAMarginals.P1.json_valid_rate, expAMarginals.P1.json_valid_count, expAMarginals.P1.total)} |`,
    `| **C0** (TH1 Baseline Receiver) | ${fmtPct(expAMarginals.C0.pass_rate, expAMarginals.C0.pass_count, expAMarginals.C0.total)} | ${fmtPct(expAMarginals.C0.stale_resurrection_rate, expAMarginals.C0.stale_resurrection_count, expAMarginals.C0.total)} | ${fmtPct(expAMarginals.C0.local_corruption_rate, expAMarginals.C0.local_corruption_count, expAMarginals.C0.total)} | ${fmtPct(expAMarginals.C0.json_valid_rate, expAMarginals.C0.json_valid_count, expAMarginals.C0.total)} |`,
    `| **C1** (Authority Contract) | ${fmtPct(expAMarginals.C1.pass_rate, expAMarginals.C1.pass_count, expAMarginals.C1.total)} | ${fmtPct(expAMarginals.C1.stale_resurrection_rate, expAMarginals.C1.stale_resurrection_count, expAMarginals.C1.total)} | ${fmtPct(expAMarginals.C1.local_corruption_rate, expAMarginals.C1.local_corruption_count, expAMarginals.C1.total)} | ${fmtPct(expAMarginals.C1.json_valid_rate, expAMarginals.C1.json_valid_count, expAMarginals.C1.total)} |`,
    `| **filtered** (Raw Local Transcript) | ${fmtPct(expAMarginals.filtered.pass_rate, expAMarginals.filtered.pass_count, expAMarginals.filtered.total)} | ${fmtPct(expAMarginals.filtered.stale_resurrection_rate, expAMarginals.filtered.stale_resurrection_count, expAMarginals.filtered.total)} | ${fmtPct(expAMarginals.filtered.local_corruption_rate, expAMarginals.filtered.local_corruption_count, expAMarginals.filtered.total)} | ${fmtPct(expAMarginals.filtered.json_valid_rate, expAMarginals.filtered.json_valid_count, expAMarginals.filtered.total)} |`,
    `| **compact** (Compacted Note) | ${fmtPct(expAMarginals.compact.pass_rate, expAMarginals.compact.pass_count, expAMarginals.compact.total)} | ${fmtPct(expAMarginals.compact.stale_resurrection_rate, expAMarginals.compact.stale_resurrection_count, expAMarginals.compact.total)} | ${fmtPct(expAMarginals.compact.local_corruption_rate, expAMarginals.compact.local_corruption_count, expAMarginals.compact.total)} | ${fmtPct(expAMarginals.compact.json_valid_rate, expAMarginals.compact.json_valid_count, expAMarginals.compact.total)} |`,
    '',
    '## Experiment B: Strict Compressor Boundary + Downstream Receiver Handoff',
    '',
    '### B.1 Compressor Strict Boundary Check',
    '',
    '| Condition | Pass Rate | Stale Footer Leak Rate (`compressor_leak_rate`) | Any Footer Leak Rate | Local Trail & Seal Preserved |',
    '|---|---|---|---|---|',
    `| \`compress_strict\` | ${fmtPct(expBCompressor.pass_rate, expBCompressor.pass_count, expBCompressor.total)} | ${fmtPct(expBCompressor.compressor_leak_rate, expBCompressor.compressor_leak_count, expBCompressor.total)} | ${fmtPct(expBCompressor.any_footer_leak_rate, expBCompressor.any_footer_leak_count, expBCompressor.total)} | ${fmtPct(expBCompressor.local_preserved_rate, expBCompressor.local_preserved_count, expBCompressor.total)} |`,
    '',
    '### B.2 Downstream Receiver Delivery on `COMPRESSOR_STRICT` Note',
    '',
    '| Condition | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |',
    '|---|---|---|---|---|---|',
    `| \`compact_strict_C0\` | \`C0\` | ${fmtPct(expBReceivers.compact_strict_C0.pass_rate, expBReceivers.compact_strict_C0.pass_count, expBReceivers.compact_strict_C0.total)} | ${fmtPct(expBReceivers.compact_strict_C0.stale_resurrection_rate, expBReceivers.compact_strict_C0.stale_resurrection_count, expBReceivers.compact_strict_C0.total)} | ${fmtPct(expBReceivers.compact_strict_C0.local_corruption_rate, expBReceivers.compact_strict_C0.local_corruption_count, expBReceivers.compact_strict_C0.total)} | ${fmtPct(expBReceivers.compact_strict_C0.json_valid_rate, expBReceivers.compact_strict_C0.json_valid_count, expBReceivers.compact_strict_C0.total)} |`,
    `| \`compact_strict_C1\` | \`C1\` | ${fmtPct(expBReceivers.compact_strict_C1.pass_rate, expBReceivers.compact_strict_C1.pass_count, expBReceivers.compact_strict_C1.total)} | ${fmtPct(expBReceivers.compact_strict_C1.stale_resurrection_rate, expBReceivers.compact_strict_C1.stale_resurrection_count, expBReceivers.compact_strict_C1.total)} | ${fmtPct(expBReceivers.compact_strict_C1.local_corruption_rate, expBReceivers.compact_strict_C1.local_corruption_count, expBReceivers.compact_strict_C1.total)} | ${fmtPct(expBReceivers.compact_strict_C1.json_valid_rate, expBReceivers.compact_strict_C1.json_valid_count, expBReceivers.compact_strict_C1.total)} |`,
    ''
  );

  return {
    stats,
    markdown: lines.join('\n')
  };
}
