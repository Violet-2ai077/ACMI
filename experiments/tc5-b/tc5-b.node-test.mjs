// TC5-B Unit Tests (node --test)
// Zero external dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_C0, SYSTEM_C1 } from './prompts.mjs';
import { PROBES, PROBE_MAP } from './probes.mjs';
import { PUBLIC_CORPUS, ORACLE, SCHEDULE } from './stories.mjs';
import { parseOutput, gradeProbe, gradeStoryTurn, summarizeRun } from './evaluate.mjs';
import { buildAllTasks, validateExperimentIntegrity, parseCliArgs, filterTasks } from './run.mjs';

test('32 probes strictly satisfy 2x2 Recency/Primacy counterbalance and domain distribution', () => {
  assert.equal(PROBES.length, 32);

  const domains = ['warehouse-queries', 'pottery-notices', 'api-rate-limit', 'release-checklist'];
  for (const d of domains) {
    const dProbes = PROBES.filter(p => p.domain === d);
    assert.equal(dProbes.length, 8, `Domain ${d} must have 8 probes`);
    assert.equal(dProbes.filter(p => p.kind === 'ambiguous').length, 4);
    assert.equal(dProbes.filter(p => p.kind === 'unambiguous').length, 4);
  }

  const ambig = PROBES.filter(p => p.kind === 'ambiguous');
  const unambig = PROBES.filter(p => p.kind === 'unambiguous');
  assert.equal(ambig.length, 16);
  assert.equal(unambig.length, 16);

  // Ambiguous: 8 with recent="1", 8 with recent="2"
  assert.equal(ambig.filter(p => p.recent_relevant === '1').length, 8);
  assert.equal(ambig.filter(p => p.recent_relevant === '2').length, 8);
  assert.ok(ambig.every(p => p.expected === 'UNRESOLVED'));

  // Unambiguous: 4 of each (expected, recent_relevant) combination
  for (const exp of ['1', '2']) {
    for (const rec of ['1', '2']) {
      const count = unambig.filter(
        p => p.expected === exp && p.recent_relevant === rec
      ).length;
      assert.equal(count, 4, `Unambiguous (expected=${exp}, recent=${rec}) must have 4 probes`);
    }
  }
});

test('All probe prefixes end with <|task:3|> and ambiguous triggers contain zero exclusive tokens', () => {
  for (const probe of PROBES) {
    assert.equal(probe.prefix_turns.length, 5);
    const lastTurn = probe.prefix_turns[probe.prefix_turns.length - 1];
    const parsedLast = parseOutput(lastTurn.assistant);
    assert.equal(parsedLast.valid, true, `Probe ${probe.id} last prefix turn must have valid marker`);
    assert.equal(parsedLast.marker, '3', `Probe ${probe.id} last prefix turn must end with <|task:3|>`);

    // Check that recent_relevant matches the last candidate turn in prefix (Turn 3)
    const candidateTurns = probe.prefix_turns.filter(t => ['1', '2'].includes(t.marker));
    assert.equal(
      candidateTurns[candidateTurns.length - 1].marker,
      probe.recent_relevant,
      `Probe ${probe.id} recent_relevant must match last candidate turn in prefix`
    );

    if (probe.kind === 'ambiguous') {
      const forbiddenTokens = [
        ...probe.exclusive_tokens.task1,
        ...probe.exclusive_tokens.task2
      ];
      for (const token of forbiddenTokens) {
        assert.ok(
          !probe.trigger_text.includes(token),
          `Ambiguous probe ${probe.id} trigger_text must NOT contain exclusive token "${token}"`
        );
      }
    }
  }
});

test('SYSTEM_C1 is a strict single-factor extension of verbatim TC1-TC5 SYSTEM_C0', () => {
  assert.ok(SYSTEM_C1.startsWith(SYSTEM_C0));
  assert.ok(SYSTEM_C1.length > SYSTEM_C0.length);
  assert.ok(SYSTEM_C1.includes('<|task:UNRESOLVED|>'));
  assert.ok(SYSTEM_C1.includes('Recency'));
  assert.ok(SYSTEM_C1.includes('Primacy'));
});

test('evaluate.mjs tail-marker parser rejects code fences, duplicates, and trailing text', () => {
  // Valid numeric and UNRESOLVED markers
  assert.deepEqual(parseOutput('这是正常回答。<|task:1|>'), {
    valid: true,
    error: null,
    marker: '1',
    answer: '这是正常回答。'
  });
  assert.deepEqual(parseOutput('请问您指哪一个任务？<|task:UNRESOLVED|>\n'), {
    valid: true,
    error: null,
    marker: 'UNRESOLVED',
    answer: '请问您指哪一个任务？'
  });

  // Code-fenced marker or answer ending with code fence must be rejected
  const fenced1 = '```sql\nSELECT 1;\n<|task:1|>\n```';
  assert.equal(parseOutput(fenced1).valid, false);

  const fenced2 = '```sql\nSELECT 1;\n```\n<|task:1|>';
  assert.equal(parseOutput(fenced2).valid, false);
  assert.equal(parseOutput(fenced2).error, 'empty_answer_or_fenced_marker');

  // Duplicate marker
  assert.equal(parseOutput('先说<|task:1|>再说<|task:2|>').valid, false);

  // Leading zero or out-of-range marker
  assert.equal(parseOutput('回答<|task:01|>').valid, false);
  assert.equal(parseOutput('回答<|task:0|>').valid, false);

  // Empty answer body
  assert.equal(parseOutput('   <|task:1|>').valid, false);
});

test('gradeProbe accurately classifies Recency vs Primacy bias and Over-Abstention', () => {
  // Ambiguous probe with recent_relevant="2" (Recency=2, Primacy=1)
  const ambigR2 = PROBE_MAP['api-rate-limit-ambig-r2-a'];
  assert.equal(ambigR2.recent_relevant, '2');
  assert.equal(ambigR2.older_relevant, '1');

  // Case 1: Correct clarification
  const clarifiedGrade = gradeProbe(
    '请问您是指付费商业版（pro_tier）还是免费体验版（free_tier）的限流配置？请指定其中一个。<|task:UNRESOLVED|>',
    ambigR2
  );
  assert.equal(clarifiedGrade.pass, true);
  assert.equal(clarifiedGrade.clarified, true);
  assert.equal(clarifiedGrade.guessed_recent, false);
  assert.equal(clarifiedGrade.guessed_older, false);

  // Case 2: Guessed recent candidate (Task 2)
  const recencyGuess = gradeProbe('{"policy":"free_tier","max_requests":60}<|task:2|>', ambigR2);
  assert.equal(recencyGuess.pass, false);
  assert.equal(recencyGuess.guessed_recent, true);
  assert.equal(recencyGuess.guessed_older, false);
  assert.equal(recencyGuess.guessed_id1, false);
  assert.equal(recencyGuess.guessed_id2, true);

  // Case 3: Guessed older/first-born candidate (Task 1 = Primacy)
  const primacyGuess = gradeProbe('{"policy":"pro_tier","max_requests":1200}<|task:1|>', ambigR2);
  assert.equal(primacyGuess.pass, false);
  assert.equal(primacyGuess.guessed_recent, false);
  assert.equal(primacyGuess.guessed_older, true);
  assert.equal(primacyGuess.guessed_id1, true);
  assert.equal(primacyGuess.guessed_id2, false);

  // Unambiguous probe pointing to older task (expected="1", recent_relevant="2")
  const unambigOlder = PROBE_MAP['api-rate-limit-unambig-e1-r2'];
  assert.equal(unambigOlder.congruent_recency, false);

  const overAbstainGrade = gradeProbe(
    '请问您指的是pro_tier还是free_tier？<|task:UNRESOLVED|>',
    unambigOlder
  );
  assert.equal(overAbstainGrade.pass, false);
  assert.equal(overAbstainGrade.over_abstained, true);

  const validReturnGrade = gradeProbe(
    '已为付费商业版 `pro_tier`（上限 1200 次 / 60 秒）设置 `burst_allowance: 200`。<|task:1|>',
    unambigOlder
  );
  assert.equal(validReturnGrade.pass, true);
  assert.equal(validReturnGrade.over_abstained, false);
  assert.equal(validReturnGrade.wrong_candidate, false);
});

test('88-task matrix integrity and summarizeRun aggregation work end-to-end', () => {
  const allTasks = buildAllTasks();
  const integrity = validateExperimentIntegrity(allTasks);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.total_tasks, 88);
  assert.equal(integrity.exp_a_tasks, 64);
  assert.equal(integrity.exp_b_tasks, 24);
  assert.equal(PUBLIC_CORPUS.length, 2);
  assert.equal(ORACLE.length, 24);
  assert.equal(SCHEDULE.length, 24);

  assert.equal(filterTasks(allTasks, 'A').length, 64);
  assert.equal(filterTasks(allTasks, 'B').length, 24);
  assert.equal(filterTasks(allTasks, 'all').length, 88);

  const cli = parseCliArgs(['--dry-run', '--only=all', '--reasoning-effort=max']);
  assert.deepEqual(cli, {
    dryRun: true,
    only: 'all',
    reasoningEffort: 'max',
    runId: null
  });

  // Synthetic summary check
  const pAmbig = PROBE_MAP['warehouse-queries-ambig-r2-a'];
  const pUnambig = PROBE_MAP['warehouse-queries-unambig-e1-r2'];
  const oTurn6 = ORACLE.find(o => o.story === 'warehouse-queries' && o.turn === 6);

  const summary = summarizeRun([
    {
      exp: 'A',
      contract: 'C0',
      latency_ms: 5000,
      usage: { completion_tokens_details: { reasoning_tokens: 300 } },
      grade: gradeProbe('直接给常温仓ambient_stock排序。<|task:2|>', pAmbig)
    },
    {
      exp: 'A',
      contract: 'C1',
      latency_ms: 4000,
      usage: { completion_tokens_details: { reasoning_tokens: 200 } },
      grade: gradeProbe('请问您是指冷库cold_stock还是常温仓ambient_stock？<|task:UNRESOLVED|>', pAmbig)
    },
    {
      exp: 'A',
      contract: 'C1',
      latency_ms: 4000,
      usage: { completion_tokens_details: { reasoning_tokens: 180 } },
      grade: gradeProbe('SELECT sku, updated_at FROM cold_stock;<|task:1|>', pUnambig)
    },
    {
      exp: 'B',
      contract: 'C1',
      story: 'warehouse-queries',
      turn: 6,
      latency_ms: 4200,
      usage: { completion_tokens_details: { reasoning_tokens: 210 } },
      grade: gradeStoryTurn('请问您指冷库cold_stock还是常温仓ambient_stock？<|task:UNRESOLVED|>', oTurn6)
    }
  ]);

  assert.equal(summary.stats.experiment_A.bias_decoupling.C0.recent_2.guessed_recent_rate, 1);
  assert.equal(summary.stats.experiment_A.bias_decoupling.C1.recent_2.clarify_pass_rate, 1);
  assert.equal(summary.stats.experiment_A.anti_over_abstention.C1.incongruent_older.full_pass_rate, 1);
  assert.equal(summary.stats.experiment_B.ambiguous_clarified_rate, 1);
});
