import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyLedger,
  foldLedger,
  projectReadOnlyLedger
} from './ledger.mjs';
import {
  PROTOCOL_VERSION,
  SCENARIOS,
  BOUNDARY_TRAPS,
  PART_B_ARMS
} from './scenarios.mjs';
import {
  STAGING_EXTRACTOR_PROMPT,
  WORKER_C0_PROMPT,
  WORKER_C1_PROMPT
} from './prompts.mjs';
import {
  parseStrictJson,
  gradeStagingOp,
  gradeWorkerDelivery,
  summarizeRun,
  generateMarkdownReport
} from './evaluate.mjs';
import { buildTaskPlan, parseCliArgs } from './run.mjs';

describe('ST1 Host Deterministic Folding Engine (ledger.mjs)', () => {
  test('allocates D1/D2/D3 and Q1 handles and folds ASSERT -> SUPERSEDE -> OPEN_QUESTION -> RESOLVE_QUESTION', () => {
    const l0 = createEmptyLedger();
    assert.equal(l0.revision, 0);

    // Step 1: ASSERT D1
    const f1 = foldLedger(
      l0,
      [
        {
          op: 'ASSERT',
          scope: 'global',
          key: 'cache_strategy',
          option_code: 'local_lru',
          summary: 'Use local_lru'
        }
      ],
      { source_step: 'step_1' }
    );
    assert.equal(f1.rejected_count, 0);
    assert.equal(f1.ledger.revision, 1);
    assert.equal(f1.ledger.active.length, 1);
    assert.equal(f1.ledger.active[0].id, 'D1');
    assert.equal(f1.ledger.active[0].option_code, 'local_lru');

    // Step 2: SUPERSEDE D1 -> D2 + OPEN_QUESTION Q1
    const f2 = foldLedger(
      f1.ledger,
      [
        {
          op: 'SUPERSEDE',
          target_id: 'D1',
          option_code: 'redis_ttl',
          summary: 'Switch to redis_ttl',
          reason: 'stale_read_14pct falsified local_lru'
        },
        {
          op: 'OPEN_QUESTION',
          key: 'etag_invalidation_window',
          summary: 'Grace window duration'
        }
      ],
      { source_step: 'step_2' }
    );
    assert.equal(f2.rejected_count, 0);
    assert.equal(f2.ledger.revision, 3);
    assert.equal(f2.ledger.active.length, 1);
    assert.equal(f2.ledger.active[0].id, 'D2');
    assert.equal(f2.ledger.active[0].option_code, 'redis_ttl');
    assert.equal(f2.ledger.tombstones.length, 1);
    assert.equal(f2.ledger.tombstones[0].id, 'D1');
    assert.equal(f2.ledger.tombstones[0].superseded_by, 'D2');
    assert.equal(f2.ledger.open_questions.length, 1);
    assert.equal(f2.ledger.open_questions[0].id, 'Q1');
    assert.equal(f2.ledger.open_questions[0].status, 'open');

    // Step 3: NO_OP
    const f3 = foldLedger(f2.ledger, [], { source_step: 'step_3' });
    assert.equal(f3.rejected_count, 0);
    assert.equal(f3.ledger.revision, 3);

    // Step 4: SUPERSEDE D2 -> D3 + RESOLVE_QUESTION Q1
    const f4 = foldLedger(
      f3.ledger,
      [
        {
          op: 'SUPERSEDE',
          target_id: 'D2',
          option_code: 'versioned_etag',
          summary: 'Upgrade to versioned_etag',
          reason: 'p99_840ms falsified redis_ttl'
        },
        {
          op: 'RESOLVE_QUESTION',
          target_id: 'Q1',
          resolution: 'Use 200ms replay buffer'
        }
      ],
      { source_step: 'step_4' }
    );
    assert.equal(f4.rejected_count, 0);
    assert.equal(f4.ledger.revision, 5);
    assert.equal(f4.ledger.active.length, 1);
    assert.equal(f4.ledger.active[0].id, 'D3');
    assert.equal(f4.ledger.active[0].option_code, 'versioned_etag');
    assert.equal(f4.ledger.tombstones.length, 2);
    assert.equal(f4.ledger.open_questions[0].status, 'resolved');

    // Verify projectReadOnlyLedger with and without tombstones
    const withTomb = projectReadOnlyLedger(f4.ledger, { includeTombstones: true });
    assert.equal(withTomb.tombstones.length, 2);
    const noTomb = projectReadOnlyLedger(f4.ledger, { includeTombstones: false });
    assert.equal('tombstones' in noTomb, false);
    assert.equal(noTomb.active[0].option_code, 'versioned_etag');
  });

  test('rejects illegal transitions: model-invented id, non-global ASSERT, duplicate active key, superseding tombstoned/missing ID, resolving closed/missing Q', () => {
    const l0 = createEmptyLedger();
    const f1 = foldLedger(l0, [
      {
        op: 'ASSERT',
        scope: 'global',
        key: 'cache_strategy',
        option_code: 'local_lru',
        summary: 'Initial'
      }
    ]);
    const f2 = foldLedger(f1.ledger, [
      {
        op: 'SUPERSEDE',
        target_id: 'D1',
        option_code: 'redis_ttl',
        summary: 'Next',
        reason: 'stale_read_14pct'
      },
      {
        op: 'OPEN_QUESTION',
        key: 'q_key',
        summary: 'Question'
      }
    ]);
    const f3 = foldLedger(f2.ledger, [
      {
        op: 'RESOLVE_QUESTION',
        target_id: 'Q1',
        resolution: 'Done'
      }
    ]);

    const illegalOps = [
      // 1. Model-invented ID
      {
        op: 'ASSERT',
        id: 'D99',
        scope: 'global',
        key: 'new_key',
        option_code: 'opt',
        summary: 'Invented ID'
      },
      // 2. Non-global scope ASSERT
      {
        op: 'ASSERT',
        scope: 'local',
        key: 'local_debug',
        option_code: '9229',
        summary: 'Local param'
      },
      // 3. Duplicate active key ASSERT
      {
        op: 'ASSERT',
        scope: 'global',
        key: 'cache_strategy',
        option_code: 'other',
        summary: 'Duplicate key'
      },
      // 4. Supersede already tombstoned D1
      {
        op: 'SUPERSEDE',
        target_id: 'D1',
        option_code: 'opt_x',
        summary: 'Resurrect tombstone',
        reason: 'bad'
      },
      // 5. Supersede non-existent D99
      {
        op: 'SUPERSEDE',
        target_id: 'D99',
        option_code: 'opt_y',
        summary: 'Missing target',
        reason: 'bad'
      },
      // 6. Resolve already resolved Q1
      {
        op: 'RESOLVE_QUESTION',
        target_id: 'Q1',
        resolution: 'Double resolve'
      },
      // 7. Resolve non-existent Q99
      {
        op: 'RESOLVE_QUESTION',
        target_id: 'Q99',
        resolution: 'Missing Q'
      }
    ];

    const fIllegal = foldLedger(f3.ledger, illegalOps);
    assert.equal(fIllegal.accepted_ops.length, 0);
    assert.equal(fIllegal.rejected_count, 7);
    assert.equal(fIllegal.ledger.revision, f3.ledger.revision);
  });
});

describe('ST1 60-Task Matrix & Gold Scenario Integrity', () => {
  test('verifies 6 scenarios (24 A1 steps), 12 A2 traps, and 24 Part B handoffs = 60 tasks', () => {
    assert.equal(SCENARIOS.length, 6);
    assert.equal(BOUNDARY_TRAPS.length, 12);
    assert.equal(PART_B_ARMS.length, 4);

    const allPlan = buildTaskPlan('all');
    assert.equal(allPlan.length, 60);
    assert.equal(allPlan.filter(p => p.part === 'A1').length, 24);
    assert.equal(allPlan.filter(p => p.part === 'A2').length, 12);
    assert.equal(allPlan.filter(p => p.part === 'B').length, 24);

    // Every gold step in SCENARIOS must pass gradeStagingOp with full_pass === true
    for (const sc of SCENARIOS) {
      let ledger = createEmptyLedger();
      for (const s of sc.steps) {
        const rawJson = JSON.stringify({ ops: s.gold_ops });
        const foldRes = foldLedger(ledger, s.gold_ops, {
          source_step: `${sc.id}_step_${s.step}`
        });
        ledger = foldRes.ledger;
        const grade = gradeStagingOp(rawJson, s.expected_spec, foldRes);
        assert.equal(
          grade.full_pass,
          true,
          `Gold step failed on ${sc.id} step ${s.step}: ${JSON.stringify(grade)}`
        );
      }
      assert.equal(ledger.active.length, 1);
      assert.equal(ledger.active[0].id, 'D3');
      assert.equal(ledger.active[0].option_code, sc.opt_c);
      assert.equal(ledger.tombstones.length, 2);
      assert.equal(ledger.open_questions.length, 1);
      assert.equal(ledger.open_questions[0].status, 'resolved');

      // Verify zero internal handles (D1/D2/D3/Q1) leak in dialogue text
      for (const s of sc.steps) {
        assert.equal(
          /\b(?:D[1-9]|Q[1-9])\b/.test(s.dialogue),
          false,
          `Handle leak in ${sc.id} step ${s.step}: ${s.dialogue}`
        );
      }

      // Verify apple-to-apple raw_noisy_C0 transcript is strictly Step 1-4 verbatim dialogue
      const expectedTranscript = sc.steps
        .map(s => `[Step ${s.step}]\n${s.dialogue}`)
        .join('\n\n');
      assert.equal(sc.noisy_transcript, expectedTranscript);
    }

    for (const trap of BOUNDARY_TRAPS) {
      assert.equal(
        /\b(?:D[1-9]|Q[1-9])\b/.test(trap.dialogue),
        false,
        `Handle leak in trap ${trap.id}: ${trap.dialogue}`
      );
    }
  });

  test('verifies prompts single-factor extension and CLI args', () => {
    assert.ok(STAGING_EXTRACTOR_PROMPT.includes('{"ops":[...]}'));
    assert.ok(WORKER_C1_PROMPT.startsWith(WORKER_C0_PROMPT));
    assert.ok(WORKER_C1_PROMPT.includes('RECEIVER_C1 Authority Contract'));

    const cli = parseCliArgs(['--dry-run', '--only=all', '--reasoning-effort=max']);
    assert.equal(cli.dryRun, true);
    assert.equal(cli.only, 'all');
    assert.equal(cli.reasoningEffort, 'max');
  });
});

describe('ST1 Deterministic Evaluators (evaluate.mjs)', () => {
  test('rejects markdown code fences and detects false writes on NO_OP, local distractor, and equal-authority traps', () => {
    const fenced = '```json\n{"ops":[]}\n```';
    assert.equal(parseStrictJson(fenced).valid, false);
    assert.equal(parseStrictJson(fenced).error, 'markdown_fence_forbidden');

    // Step 3 NO_OP trap false write detection
    const s1Step3 = SCENARIOS[0].steps[2];
    const badNoopGrade = gradeStagingOp(
      JSON.stringify({
        ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'local_lru',
            summary: 'Revert',
            reason: 'intern suggestion'
          }
        ]
      }),
      s1Step3.expected_spec
    );
    assert.equal(badNoopGrade.false_write, true);
    assert.equal(badNoopGrade.full_pass, false);

    // Step 1 local distractor leak detection
    const s1Step1 = SCENARIOS[0].steps[0];
    const leakGrade = gradeStagingOp(
      JSON.stringify({
        ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'cache_strategy',
            option_code: 'local_lru',
            summary: 'Global cache'
          },
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'local_debug_port_9229',
            option_code: '9229',
            summary: 'Leaked local debug port'
          }
        ]
      }),
      s1Step1.expected_spec
    );
    assert.equal(leakGrade.false_write, true);
    assert.equal(leakGrade.full_pass, false);

    // Equal authority conflict false write if model emits ASSERT
    const eqTrap = BOUNDARY_TRAPS[0];
    const eqBadGrade = gradeStagingOp(
      JSON.stringify({
        ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'rpc_protocol',
            option_code: 'grpc_protobuf',
            summary: 'Picked side A'
          }
        ]
      }),
      eqTrap.expected_spec
    );
    assert.equal(eqBadGrade.false_write, true);
    assert.equal(eqBadGrade.full_pass, false);

    const eqGoodGrade = gradeStagingOp(
      JSON.stringify({
        ops: [
          {
            op: 'OPEN_QUESTION',
            key: 'rpc_protocol',
            summary: 'Co-leads dispute grpc_protobuf vs json_http2'
          }
        ]
      }),
      eqTrap.expected_spec
    );
    assert.equal(eqGoodGrade.false_write, false);
    assert.equal(eqGoodGrade.full_pass, true);
  });

  test('grades Worker B handoff delivery across positive and negative boundaries', () => {
    const sc = SCENARIOS[0]; // S1_cache_eviction: opt_c = versioned_etag, falsify_a = stale_read_14pct

    const passRaw = JSON.stringify({
      active_option: 'versioned_etag',
      reject_reproposal: true,
      rejection_evidence: '多副本压测出现 stale_read_14pct（跨节点脏读率 14.2%）证伪 local_lru',
      open_blockers: []
    });
    const gPass = gradeWorkerDelivery(passRaw, sc);
    assert.equal(gPass.full_pass, true);

    // Missing tombstone evidence (as expected in ledger_staged_no_tombstone_C1)
    const noTombRaw = JSON.stringify({
      active_option: 'versioned_etag',
      reject_reproposal: true,
      rejection_evidence: 'UNKNOWN',
      open_blockers: []
    });
    const gNoTomb = gradeWorkerDelivery(noTombRaw, sc);
    assert.equal(gNoTomb.active_option_exact, true);
    assert.equal(gNoTomb.rejected_regression, true);
    assert.equal(gNoTomb.tombstone_evidence_cited, false);
    assert.equal(gNoTomb.open_blockers_exact, true);
    assert.equal(gNoTomb.full_pass, false);

    // Regression to OPT_A and hallucinated open blocker (typical of raw_noisy_C0)
    const regRaw = JSON.stringify({
      active_option: 'local_lru',
      reject_reproposal: false,
      rejection_evidence: 'UNKNOWN',
      open_blockers: ['etag_invalidation_window']
    });
    const gReg = gradeWorkerDelivery(regRaw, sc);
    assert.equal(gReg.active_option_exact, false);
    assert.equal(gReg.rejected_regression, false);
    assert.equal(gReg.open_blockers_exact, false);
    assert.equal(gReg.full_pass, false);

    // Verify summarizeRun and generateMarkdownReport
    const summary = summarizeRun([
      {
        task_id: 'B_S1_ledger_staged_C1',
        part: 'B',
        scenario_id: sc.id,
        arm_id: 'ledger_staged_C1',
        expected_active_option: sc.opt_c,
        falsify_a_code: sc.falsify_a_code,
        elapsed_ms: 2500,
        usage: { reasoning_tokens: 180 },
        grade: gPass
      }
    ]);
    const report = generateMarkdownReport(summary, [], {
      run_id: 'test-run',
      protocol_version: PROTOCOL_VERSION,
      model: 'deepseek-v4.1-flash',
      reasoning_effort: 'max',
      started_at: '2026-11-22T00:00:00Z',
      completed_at: '2026-11-22T00:01:00Z',
      total_transport_retries: 0
    });
    assert.ok(report.includes('# ST1 Report:'));
  });
});
