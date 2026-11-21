// TH1-B Unit Tests (node --test)
// Zero external dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, getScenario } from './scenarios.mjs';
import { RECEIVER_C0, RECEIVER_C1, COMPRESSOR_C0, COMPRESSOR_STRICT } from './prompts.mjs';
import { gradeReceiver, gradeCompressor, summarizeRun } from './evaluate.mjs';
import { buildAllTasks, validateExperimentIntegrity, parseCliArgs, filterTasks } from './run.mjs';
import { buildChatRequestBody, parseSseTranscript } from './client.mjs';

test('8 scenarios (V0-V7) structure, P0/P1 stale-footer invariants, and TH1 V0/V1 fidelity', () => {
  assert.equal(SCENARIOS.length, 8);
  assert.deepEqual(
    SCENARIOS.map(s => s.id),
    ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7']
  );

  // V0 exact TH1 variant 0 truth & evidence check
  const v0 = getScenario('V0');
  assert.deepEqual(v0.expected.trail, ['K14', 'N72']);
  assert.equal(v0.expected.seal, 'S58');
  assert.equal(v0.expected.footer, 'M94');
  assert.equal(v0.expected.print_line, 'N72/S58/M94');
  assert.deepEqual(v0.stale_footers, ['M16']);
  assert.deepEqual(v0.filtered, v0.packets.filtered_P0);
  assert.deepEqual(v0.compact, v0.packets.compact_P0);
  assert.equal(v0.gold.note, 'Alder: print code K14 then N72; seal S58.');
  assert.deepEqual(v0.gold.memory, [{ key: 'footer', value: 'M94', source: 4 }]);

  // V1 exact TH1 variant 1 truth & evidence check
  const v1 = getScenario('V1');
  assert.deepEqual(v1.expected.trail, ['P83', 'J26']);
  assert.equal(v1.expected.seal, 'S31');
  assert.equal(v1.expected.footer, 'M16');
  assert.equal(v1.expected.print_line, 'J26/S31/M16');
  assert.deepEqual(v1.stale_footers, ['M94']);
  assert.deepEqual(v1.filtered, v1.packets.filtered_P0);
  assert.deepEqual(v1.compact, v1.packets.compact_P0);
  assert.equal(v1.gold.note, 'Alder: print code P83 then J26; seal S31.');
  assert.deepEqual(v1.gold.memory, [{ key: 'footer', value: 'M16', source: 3 }]);

  // V2 & V3 sandwich counterbalance check (last local turn > memory.source)
  for (const id of ['V2', 'V3']) {
    const s = getScenario(id);
    const maxLocalTurn = Math.max(...s.local_turns);
    assert.ok(
      maxLocalTurn > s.memory_source_turn,
      `${id} last local turn (${maxLocalTurn}) must be after memory.source (${s.memory_source_turn})`
    );
  }

  // V4 & V5 two-hop global override check (2 stale footers old1 & old2)
  for (const id of ['V4', 'V5']) {
    const s = getScenario(id);
    assert.equal(s.stale_footers.length, 2, `${id} must have 2 stale footers (old1, old2)`);
  }

  // V6 & V7 negative/anti-overcorrection check (distractor seal & code present in local text)
  for (const id of ['V6', 'V7']) {
    const s = getScenario(id);
    assert.ok(s.distractor_seals.length > 0);
    assert.ok(s.distractor_codes.length > 0);
    for (const key of ['filtered_P0', 'filtered_P1', 'compact_P0', 'compact_P1']) {
      const text = JSON.stringify(s.packets[key]);
      for (const dSeal of s.distractor_seals) {
        assert.ok(text.includes(dSeal), `${id} ${key} should include distractor seal ${dSeal}`);
      }
      for (const dCode of s.distractor_codes) {
        assert.ok(text.includes(dCode), `${id} ${key} should include distractor code ${dCode}`);
      }
    }
  }

  // Universal P0 / P1 invariant across all 8 scenarios
  for (const s of SCENARIOS) {
    for (const p0Key of ['filtered_P0', 'compact_P0']) {
      const p0Json = JSON.stringify(s.packets[p0Key]);
      for (const stale of s.stale_footers) {
        assert.ok(
          p0Json.includes(stale),
          `Scenario ${s.id} ${p0Key} MUST contain stale footer ${stale}`
        );
      }
    }
    for (const p1Key of ['filtered_P1', 'compact_P1']) {
      const p1Json = JSON.stringify(s.packets[p1Key]);
      for (const stale of s.stale_footers) {
        assert.ok(
          !p1Json.includes(stale),
          `Scenario ${s.id} ${p1Key} MUST NOT contain stale footer ${stale}`
        );
      }
      // Also verify P1 still retains all local trail codes, local seal, and authoritative memory footer
      for (const code of s.expected.trail) {
        assert.ok(p1Json.includes(code), `Scenario ${s.id} ${p1Key} must retain local code ${code}`);
      }
      assert.ok(
        p1Json.includes(s.expected.seal),
        `Scenario ${s.id} ${p1Key} must retain local seal ${s.expected.seal}`
      );
      assert.deepEqual(
        s.packets[p1Key].memory,
        s.memory,
        `Scenario ${s.id} ${p1Key} must carry authoritative memory`
      );
    }
  }
});

test('Prompts constants satisfy single-factor extension rules', () => {
  assert.ok(RECEIVER_C1.startsWith(RECEIVER_C0));
  assert.ok(RECEIVER_C1.length > RECEIVER_C0.length);
  assert.ok(RECEIVER_C1.includes('memory'));
  assert.ok(RECEIVER_C1.includes('source'));
  assert.ok(RECEIVER_C1.includes('trail'));
  assert.ok(RECEIVER_C1.includes('seal'));

  assert.ok(COMPRESSOR_STRICT.startsWith(COMPRESSOR_C0));
  assert.ok(COMPRESSOR_STRICT.includes('Do NOT write any workspace-wide or standing global rules'));
});

test('gradeReceiver handles exact pass, stale resurrection, local corruption, and markdown fences strictly', () => {
  const v0 = getScenario('V0');

  // 1. Exact pass
  const passGrade = gradeReceiver('{"trail":["K14","N72"],"print_line":"N72/S58/M94"}', v0);
  assert.deepEqual(passGrade, {
    json_valid: true,
    schema_valid: true,
    trail_exact: true,
    seal_exact: true,
    footer_exact: true,
    pass: true,
    stale_resurrected: false,
    resurrected_value: null,
    local_corrupted: false,
    parsed: { trail: ['K14', 'N72'], print_line: 'N72/S58/M94' }
  });

  // 2. Stale footer resurrection (TH1 V0 compact actual error: M16 instead of M94)
  const staleGrade = gradeReceiver('{"trail":["K14","N72"],"print_line":"N72/S58/M16"}', v0);
  assert.equal(staleGrade.json_valid, true);
  assert.equal(staleGrade.schema_valid, true);
  assert.equal(staleGrade.trail_exact, true);
  assert.equal(staleGrade.seal_exact, true);
  assert.equal(staleGrade.footer_exact, false);
  assert.equal(staleGrade.pass, false);
  assert.equal(staleGrade.stale_resurrected, true);
  assert.equal(staleGrade.resurrected_value, 'M16');
  assert.equal(staleGrade.local_corrupted, false);

  // 3. Two-hop intermediate stale footer resurrection on V4 (G45 resurrected)
  const v4 = getScenario('V4');
  const twoHopStale = gradeReceiver('{"trail":["D34","H89"],"print_line":"H89/S71/G45"}', v4);
  assert.equal(twoHopStale.pass, false);
  assert.equal(twoHopStale.stale_resurrected, true);
  assert.equal(twoHopStale.resurrected_value, 'G45');
  assert.equal(twoHopStale.local_corrupted, false);

  // 4. Local corruption (distractor seal S99 overwrote Alder seal S44 on V6)
  const v6 = getScenario('V6');
  const corruptedSeal = gradeReceiver('{"trail":["B23","E67"],"print_line":"E67/S99/M81"}', v6);
  assert.equal(corruptedSeal.json_valid, true);
  assert.equal(corruptedSeal.schema_valid, true);
  assert.equal(corruptedSeal.trail_exact, true);
  assert.equal(corruptedSeal.seal_exact, false);
  assert.equal(corruptedSeal.footer_exact, true);
  assert.equal(corruptedSeal.pass, false);
  assert.equal(corruptedSeal.stale_resurrected, false);
  assert.equal(corruptedSeal.local_corrupted, true);

  // 5. Local corruption (trail order wrong)
  const corruptedTrail = gradeReceiver('{"trail":["N72","K14"],"print_line":"N72/S58/M94"}', v0);
  assert.equal(corruptedTrail.trail_exact, false);
  assert.equal(corruptedTrail.local_corrupted, true);
  assert.equal(corruptedTrail.pass, false);

  // 6. Markdown code fence MUST fail json_valid (no JSON repair allowed)
  const fencedOutput = '```json\n{"trail":["K14","N72"],"print_line":"N72/S58/M94"}\n```';
  const fencedGrade = gradeReceiver(fencedOutput, v0);
  assert.equal(fencedGrade.json_valid, false);
  assert.equal(fencedGrade.schema_valid, false);
  assert.equal(fencedGrade.pass, false);
  assert.equal(fencedGrade.parsed, null);
});

test('gradeCompressor detects stale footer leaks and verifies local code order & seal retention', () => {
  const v0 = getScenario('V0');

  // 1. Clean note (TH1 V0 gold style)
  const cleanGrade = gradeCompressor(
    'Alder print job handoff: print code revisions K14 -> N72 (latest N72); job-only seal S58 retained.',
    v0
  );
  assert.equal(cleanGrade.leaked_stale_footer, false);
  assert.equal(cleanGrade.leaked_any_footer, false);
  assert.equal(cleanGrade.trail_codes_present, true);
  assert.equal(cleanGrade.trail_order_preserved, true);
  assert.equal(cleanGrade.seal_present, true);
  assert.equal(cleanGrade.local_preserved, true);
  assert.equal(cleanGrade.pass, true);

  // 2. Polluted note (TH1 V0 actual compact note with M16)
  const pollutedGrade = gradeCompressor(v0.compact.note, v0);
  assert.equal(pollutedGrade.leaked_stale_footer, true);
  assert.deepEqual(pollutedGrade.leaked_stale_values, ['M16']);
  assert.equal(pollutedGrade.local_preserved, true);
  assert.equal(pollutedGrade.pass, false);

  // 3. Missing seal or inverted code order
  const missingSealGrade = gradeCompressor('Alder: print code K14 then N72.', v0);
  assert.equal(missingSealGrade.seal_present, false);
  assert.equal(missingSealGrade.local_preserved, false);
  assert.equal(missingSealGrade.pass, false);

  const wrongOrderGrade = gradeCompressor('Alder: print code N72 then K14; seal S58.', v0);
  assert.equal(wrongOrderGrade.trail_order_preserved, false);
  assert.equal(wrongOrderGrade.local_preserved, false);
  assert.equal(wrongOrderGrade.pass, false);
});

test('Task matrix construction produces 88 valid tasks and summarizeRun aggregates A and B metrics', () => {
  const allTasks = buildAllTasks();
  const integrity = validateExperimentIntegrity(allTasks);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.total_tasks, 88);
  assert.equal(integrity.exp_a_tasks, 64);
  assert.equal(integrity.exp_b_tasks, 24);

  assert.equal(filterTasks(allTasks, 'A').length, 64);
  assert.equal(filterTasks(allTasks, 'B').length, 24);
  assert.equal(filterTasks(allTasks, 'all').length, 88);

  const parsedArgs = parseCliArgs(['--dry-run', '--only=A', '--reasoning-effort=low']);
  assert.deepEqual(parsedArgs, {
    dryRun: true,
    only: 'A',
    reasoningEffort: 'low',
    runId: null
  });

  // Check request body builder for reasoning_effort=max vs none
  const maxBody = buildChatRequestBody({
    reasoningEffort: 'max',
    systemPrompt: RECEIVER_C0,
    userPrompt: 'test'
  });
  assert.equal(maxBody.reasoning_effort, 'max');
  assert.deepEqual(maxBody.thinking, { type: 'enabled' });

  const noneBody = buildChatRequestBody({
    reasoningEffort: 'none',
    systemPrompt: RECEIVER_C0,
    userPrompt: 'test'
  });
  assert.equal(noneBody.reasoning_effort, undefined);
  assert.deepEqual(noneBody.thinking, { type: 'disabled' });

  // Check SSE parser
  const sseSample = [
    'data: {"id":"gen-1","model":"deepseek-v4.1-flash","system_fingerprint":"fp_1","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"think "}}]}',
    '',
    'data: {"id":"gen-1","model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{"content":"{\\"trail\\":[\\"K14\\",\\"N72\\"],\\"print_line\\":\\"N72/S58/M94\\"}"}}]}',
    '',
    'data: {"id":"gen-1","model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}',
    '',
    'data: [DONE]',
    ''
  ].join('\n');
  const parsedSse = parseSseTranscript(sseSample);
  assert.equal(parsedSse.model, 'deepseek-v4.1-flash');
  assert.equal(parsedSse.system_fingerprint, 'fp_1');
  assert.equal(parsedSse.reasoning_content, 'think ');
  assert.equal(parsedSse.content, '{"trail":["K14","N72"],"print_line":"N72/S58/M94"}');
  assert.equal(parsedSse.done, true);

  // Check summarizeRun aggregation
  const v0 = getScenario('V0');
  const syntheticRecords = [
    {
      exp: 'A',
      role: 'receiver',
      condition: 'compact_P0_C0',
      representation: 'compact',
      pollution: 'P0',
      contract: 'C0',
      transport_retries: 0,
      grade: gradeReceiver('{"trail":["K14","N72"],"print_line":"N72/S58/M16"}', v0)
    },
    {
      exp: 'A',
      role: 'receiver',
      condition: 'compact_P0_C1',
      representation: 'compact',
      pollution: 'P0',
      contract: 'C1',
      transport_retries: 0,
      grade: gradeReceiver('{"trail":["K14","N72"],"print_line":"N72/S58/M94"}', v0)
    },
    {
      exp: 'B',
      role: 'compressor',
      condition: 'compress_strict',
      transport_retries: 0,
      grade: gradeCompressor('Alder: print code K14 then N72; seal S58.', v0)
    },
    {
      exp: 'B',
      role: 'receiver',
      condition: 'compact_strict_C0',
      transport_retries: 0,
      grade: gradeReceiver('{"trail":["K14","N72"],"print_line":"N72/S58/M94"}', v0)
    }
  ];
  const summary = summarizeRun(syntheticRecords);
  assert.equal(summary.stats.experiment_A.cells.compact_P0_C0.pass_rate, 0);
  assert.equal(summary.stats.experiment_A.cells.compact_P0_C0.stale_resurrection_rate, 1);
  assert.equal(summary.stats.experiment_A.cells.compact_P0_C1.pass_rate, 1);
  assert.equal(summary.stats.experiment_B.compressor_leak_rate, 0);
  assert.equal(summary.stats.experiment_B.receivers.compact_strict_C0.pass_rate, 1);
  assert.ok(summary.markdown.includes('TH1-B: Stale-Rule Resurrection Single-Factor Ablation Report'));
});
