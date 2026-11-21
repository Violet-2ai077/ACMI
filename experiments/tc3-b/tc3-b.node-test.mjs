import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTOCOL_VERSION,
  SYSTEM_C0,
  STORY_ID,
  PUBLIC_TURNS,
  ORACLE,
  CONDITIONS
} from './story.mjs';
import {
  FROZEN_PROPER_NOUN_RULES,
  FROZEN_STRIP_EXAMPLES,
  stripExplicitHeaders
} from './stripper.mjs';
import {
  parseOutput,
  inspectClosedFenceDetachedMarker,
  gradeTurn,
  summarizeRun,
  generateMarkdownReport
} from './evaluate.mjs';
import { buildProtocolMessages } from './client.mjs';
import { buildTaskPlan, parseCliArgs } from './run.mjs';

describe('TC3-B Story Corpus & Gap Bucket Structure', () => {
  test('verifies 24 turns, 5 tasks, 5 births, 19 returns, and gap bucket counts', () => {
    assert.equal(STORY_ID, 'overlapping-notices');
    assert.equal(PUBLIC_TURNS.length, 24);
    assert.equal(ORACLE.length, 24);
    assert.equal(CONDITIONS.length, 3);

    const births = ORACLE.filter(o => o.kind === 'birth');
    const returns = ORACLE.filter(o => o.kind === 'return');
    assert.equal(births.length, 5);
    assert.equal(returns.length, 19);

    const birthOrContinue = ORACLE.filter(o => o.gap_bucket === 'birth_or_continue');
    const shortReturn = ORACLE.filter(o => o.gap_bucket === 'short_return');
    const longReturn = ORACLE.filter(o => o.gap_bucket === 'long_return');

    assert.equal(birthOrContinue.length, 5);
    assert.equal(shortReturn.length, 16);
    assert.equal(longReturn.length, 3);

    // Long return nodes: t9 (gap=5), t12 (gap=5), t24 (gap=14)
    assert.deepEqual(
      longReturn.map(o => ({ turn: o.turn, gap: o.gap_turns, expected: o.expected })),
      [
        { turn: 9, gap: 5, expected: '1' },
        { turn: 12, gap: 5, expected: '2' },
        { turn: 24, gap: 14, expected: '1' }
      ]
    );

    const t24 = ORACLE[23];
    assert.equal(t24.turn, 24);
    assert.equal(t24.task_key, 'south-confirmation');
    assert.equal(t24.birth_turn, 1);
    assert.equal(t24.previous_visit_turn, 9);
    assert.equal(t24.gap_turns, 14);
    assert.equal(t24.expected, '1');
  });

  test('verifies SYSTEM_C0 is verbatim original TC1-TC3 prompt', () => {
    assert.ok(SYSTEM_C0.includes('正常、直接地回答用户当前请求，通常不超过200字'));
    assert.ok(SYSTEM_C0.includes('输出正常回答，末尾恰好附一个标记：<|task:N|>'));
    assert.ok(!SYSTEM_C0.includes('补充归属契约'));
  });
});

describe('TC3-B Deterministic Header & Proper-Noun Stripper (stripper.mjs)', () => {
  test('strips leading bracketed headers and replaces all frozen proper nouns while preserving trailing marker and business facts', () => {
    assert.equal(FROZEN_PROPER_NOUN_RULES.length, 6);

    for (const ex of FROZEN_STRIP_EXAMPLES) {
      const actual = stripExplicitHeaders(ex.before);
      assert.equal(actual, ex.after, `Mismatch on turn ${ex.turn}`);

      // Verify zero proper nouns remain in cleaned text
      for (const rule of FROZEN_PROPER_NOUN_RULES) {
        assert.ok(
          !actual.includes(rule.pattern),
          `Proper noun ${rule.pattern} should be stripped in turn ${ex.turn}`
        );
      }

      // Verify cleaned text still passes gradeTurn full_pass (marker + answerChecks intact)
      const oracleTurn = ORACLE[ex.turn - 1];
      const gradeBefore = gradeTurn(ex.before, oracleTurn);
      const gradeAfter = gradeTurn(actual, oracleTurn);
      assert.equal(gradeBefore.full_pass, true);
      assert.equal(gradeAfter.full_pass, true);
      assert.equal(gradeAfter.observed, oracleTurn.expected);
    }
  });

  test('preserves bracketed time/amount emphasis containing digits and handles inline bracket prefixes', () => {
    const raw = '[云溪读书会]：请于【周五18:00】前支付48元报名费，如已转账请忽略。 <|task:4|>';
    const cleaned = stripExplicitHeaders(raw);
    assert.equal(cleaned, '请于【周五18:00】前支付48元报名费，如已转账请忽略。 <|task:4|>');
  });
});

describe('TC3-B Deterministic Evaluator & Closed-Fence Diagnostic', () => {
  test('grades strict valid output and detects closed-fence detached marker strictly as diagnostic', () => {
    const t1Oracle = ORACLE[0];
    const validSample = '您已报名成功！周六14:00在南馆三楼开始，请自带纸质书。\n<|task:1|>';
    const gValid = gradeTurn(validSample, t1Oracle);
    assert.equal(gValid.strict_valid, true);
    assert.equal(gValid.canonical_exact, true);
    assert.equal(gValid.answer_minimal, true);
    assert.equal(gValid.full_pass, true);
    assert.equal(gValid.closed_fence_detached_marker, false);

    // Closed code fence before <|task:1|>: strict_valid MUST be false, closed_fence_detached_marker MUST be true
    const fencedSample = '```text\n您已报名成功！周六14:00在南馆三楼开始，请自带纸质书。\n```\n<|task:1|>';
    const parsedFenced = parseOutput(fencedSample);
    assert.equal(parsedFenced.valid, false);
    assert.equal(parsedFenced.error, 'empty_answer_or_fenced_marker');

    const diag = inspectClosedFenceDetachedMarker(fencedSample);
    assert.equal(diag.closed_fence_detached_marker, true);
    assert.equal(diag.detached_marker, '1');

    const gFenced = gradeTurn(fencedSample, t1Oracle);
    assert.equal(gFenced.strict_valid, false);
    assert.equal(gFenced.canonical_exact, false);
    assert.equal(gFenced.full_pass, false);
    assert.equal(gFenced.closed_fence_detached_marker, true);
    assert.equal(gFenced.detached_marker, '1');
  });

  test('summarizes 72 records across S0, S1, S2 and generates markdown report', () => {
    const plan = buildTaskPlan('all');
    assert.equal(plan.length, 72);

    const mockRecords = [];
    for (const cond of CONDITIONS) {
      for (const o of ORACLE) {
        const sampleReply = `周六14:00南馆三楼纸质书共读袋 周日10:00北馆二楼铅笔借 68收到谢 48周五18:00忽略 P52 B3周一19:00代领\n<|task:${o.expected}|>`;
        const grade = gradeTurn(sampleReply, o);
        mockRecords.push({
          task_id: `${cond.id}_${STORY_ID}_t${String(o.turn).padStart(2, '0')}`,
          condition_id: cond.id,
          condition_short_id: cond.short_id,
          include_reasoning_history: cond.include_reasoning_history,
          strip_headers: cond.strip_headers,
          story_id: STORY_ID,
          turn: o.turn,
          elapsed_ms: 1200,
          transport_retries: 0,
          usage: { reasoning_tokens: 300 },
          grade
        });
      }
    }

    const summary = summarizeRun(mockRecords);
    assert.equal(summary.total_records, 72);
    assert.equal(summary.by_condition.S0_baseline.full_pass_count, 24);
    assert.equal(summary.by_condition.S1_strip_cot.full_pass_count, 24);
    assert.equal(summary.by_condition.S2_strip_cot_and_header.full_pass_count, 24);
    assert.equal(summary.by_condition.S2_strip_cot_and_header.conditional_restoration_correct, 19);
    assert.equal(summary.by_condition_and_bucket.S2_strip_cot_and_header.long_return.total, 3);

    const md = generateMarkdownReport(summary, mockRecords, {
      run_id: 'test-run',
      protocol_version: PROTOCOL_VERSION,
      model: 'deepseek-v4.1-flash',
      reasoning_effort: 'max',
      started_at: '2026-11-22T00:00:00Z',
      completed_at: '2026-11-22T00:01:00Z',
      total_transport_retries: 0
    });
    assert.ok(md.includes('## 1. Overall Condition Comparison'));
    assert.ok(md.includes('## 2. Accuracy & Reasoning Effort Breakdown by Gap Span Bucket'));
    assert.ok(md.includes('## 4. 24-Turn Trajectory Comparison Matrix'));
  });
});

describe('TC3-B Protocol Message Serialization & CLI', () => {
  test('verifies S0 vs S1/S2 assistant message serialization', () => {
    const sampleTurns = [
      { source_id: 'u1', role: 'user', content: 'hello' },
      { source_id: 'a1', role: 'assistant', content: 'world <|task:1|>', reasoning_content: 'thought process' },
      { source_id: 'u2', role: 'user', content: 'next' }
    ];

    const msgsS0 = buildProtocolMessages({
      systemPrompt: SYSTEM_C0,
      turns: sampleTurns,
      includeReasoningHistory: true
    });
    assert.equal(msgsS0[3].reasoning_content, 'thought process');

    const msgsS1Default = buildProtocolMessages({
      systemPrompt: SYSTEM_C0,
      turns: sampleTurns,
      includeReasoningHistory: false
    });
    assert.equal(msgsS1Default[3].reasoning_content, '');

    const msgsS1Omit = buildProtocolMessages({
      systemPrompt: SYSTEM_C0,
      turns: sampleTurns,
      includeReasoningHistory: false,
      omitReasoningKey: true
    });
    assert.equal('reasoning_content' in msgsS1Omit[3], false);
  });

  test('verifies CLI argument parsing', () => {
    const parsed = parseCliArgs(['--dry-run', '--only=S2', '--reasoning-effort=max']);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.only, 'S2');
    assert.equal(parsed.reasoningEffort, 'max');
  });
});
