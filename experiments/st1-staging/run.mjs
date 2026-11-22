#!/usr/bin/env node
// ST1 Experiment Runner (run.mjs)
// Supports:
//   --dry-run
//   --only=A|B|all
//   --reasoning-effort=max|high|medium|low|none

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  WORKER_C1_PROMPT,
  buildStagingUserMessage,
  buildWorkerUserMessage
} from './prompts.mjs';
import {
  parseStrictJson,
  gradeStagingOp,
  gradeWorkerDelivery,
  summarizeRun,
  generateMarkdownReport
} from './evaluate.mjs';
import { callChatCompletion, resolveApiConfig } from './client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FROZEN_FILES = [
  'ledger.mjs',
  'scenarios.mjs',
  'prompts.mjs',
  'evaluate.mjs',
  'client.mjs',
  'run.mjs',
  'st1-staging.node-test.mjs'
];

export function computeFileSha256(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function buildManifestObject() {
  const files = {};
  for (const rel of FROZEN_FILES) {
    const full = path.join(__dirname, rel);
    if (fs.existsSync(full)) {
      files[rel] = computeFileSha256(full);
    }
  }
  return {
    experiment: 'ST1',
    title:
      'Asynchronous Staging State Operator Extraction, Host Deterministic Folding & Cross-Worker Tombstone Anti-Regression',
    protocol_version: PROTOCOL_VERSION,
    frozen_at: new Date().toISOString(),
    counts: {
      scenarios: SCENARIOS.length,
      part_a1_steps: SCENARIOS.length * 4,
      part_a2_traps: BOUNDARY_TRAPS.length,
      part_b_handoffs: SCENARIOS.length * PART_B_ARMS.length,
      total_planned_calls:
        SCENARIOS.length * 4 + BOUNDARY_TRAPS.length + SCENARIOS.length * PART_B_ARMS.length
    },
    files
  };
}

export function writeFrozenManifest() {
  const manifestPath = path.join(__dirname, 'frozen-manifest.json');
  const manifest = buildManifestObject();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifestPath, manifest };
}

export function verifyFrozenManifest() {
  const manifestPath = path.join(__dirname, 'frozen-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `frozen-manifest.json not found at ${manifestPath}. Run with --dry-run first to freeze corpus and evaluator.`
    );
  }
  const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const mismatches = [];
  for (const [rel, expectedHash] of Object.entries(existing.files || {})) {
    const full = path.join(__dirname, rel);
    if (!fs.existsSync(full)) {
      mismatches.push(`${rel}: missing file`);
      continue;
    }
    const actualHash = computeFileSha256(full);
    if (actualHash !== expectedHash) {
      mismatches.push(`${rel}: expected ${expectedHash}, got ${actualHash}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Frozen manifest integrity check failed:\n  ${mismatches.join('\n  ')}`
    );
  }
  return existing;
}

export function parseCliArgs(argv) {
  let dryRun = false;
  let only = 'all';
  let reasoningEffort = 'max';

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).trim();
    } else if (arg.startsWith('--reasoning-effort=')) {
      reasoningEffort = arg.slice('--reasoning-effort='.length).trim();
    }
  }

  const validOnly = new Set(['all', 'A', 'B', 'A1', 'A2']);
  if (!validOnly.has(only)) {
    throw new Error(`Invalid --only=${only}. Expected A|B|A1|A2|all.`);
  }

  const validEfforts = new Set(['max', 'high', 'medium', 'low', 'none']);
  if (!validEfforts.has(reasoningEffort)) {
    throw new Error(
      `Invalid --reasoning-effort=${reasoningEffort}. Expected max|high|medium|low|none.`
    );
  }

  return { dryRun, only, reasoningEffort };
}

export function buildTaskPlan(only = 'all') {
  const plan = [];

  if (only === 'all' || only === 'A' || only === 'A1') {
    for (const sc of SCENARIOS) {
      for (const s of sc.steps) {
        plan.push({
          task_id: `A1_${sc.id}_step${s.step}_${s.kind}`,
          part: 'A1',
          scenario_id: sc.id,
          step: s.step,
          step_kind: s.kind
        });
      }
    }
  }

  if (only === 'all' || only === 'A' || only === 'A2') {
    for (const trap of BOUNDARY_TRAPS) {
      plan.push({
        task_id: `A2_${trap.id}`,
        part: 'A2',
        trap_id: trap.id,
        trap_category: trap.category
      });
    }
  }

  if (only === 'all' || only === 'B') {
    for (const sc of SCENARIOS) {
      for (const arm of PART_B_ARMS) {
        plan.push({
          task_id: `B_${sc.id}_${arm.id}`,
          part: 'B',
          scenario_id: sc.id,
          arm_id: arm.id,
          contract: arm.contract
        });
      }
    }
  }

  return plan;
}

function hydrateLedgerFromSnapshot(snapshot) {
  const activeCount = Array.isArray(snapshot.active) ? snapshot.active.length : 0;
  const tombCount = Array.isArray(snapshot.tombstones) ? snapshot.tombstones.length : 0;
  const qCount = Array.isArray(snapshot.open_questions) ? snapshot.open_questions.length : 0;
  return {
    revision: snapshot.revision ?? 0,
    next_decision_num: activeCount + tombCount + 1,
    next_question_num: qCount + 1,
    active: (snapshot.active || []).map(x => ({ ...x })),
    tombstones: (snapshot.tombstones || []).map(x => ({ ...x })),
    open_questions: (snapshot.open_questions || []).map(x => ({ ...x }))
  };
}

async function main() {
  const { dryRun, only, reasoningEffort } = parseCliArgs(process.argv.slice(2));
  const plan = buildTaskPlan(only);

  if (dryRun) {
    const { manifestPath, manifest } = writeFrozenManifest();
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          only,
          reasoning_effort: reasoningEffort,
          protocol_version: PROTOCOL_VERSION,
          total_planned_calls: plan.length,
          breakdown: {
            part_a1_evolution_steps: plan.filter(p => p.part === 'A1').length,
            part_a2_boundary_traps: plan.filter(p => p.part === 'A2').length,
            part_b_worker_handoffs: plan.filter(p => p.part === 'B').length
          },
          scenarios: SCENARIOS.map(s => ({
            id: s.id,
            domain: s.domain,
            key: s.decision_key,
            evolution: `${s.opt_a} --(${s.falsify_a_code})--> ${s.opt_b} --(${s.falsify_b_code})--> ${s.opt_c}`,
            question_key: s.question_key,
            local_distractor_key: s.local_distractor_key
          })),
          trap_categories: {
            equal_authority_conflict: BOUNDARY_TRAPS.filter(
              t => t.category === 'equal_authority_conflict'
            ).length,
            local_scope_leak_trap: BOUNDARY_TRAPS.filter(
              t => t.category === 'local_scope_leak_trap'
            ).length,
            unauthorized_resurrection_trap: BOUNDARY_TRAPS.filter(
              t => t.category === 'unauthorized_resurrection_trap'
            ).length
          },
          part_b_arms: PART_B_ARMS.map(a => a.id),
          manifest_path: manifestPath,
          manifest_files: manifest.files
        },
        null,
        2
      )
    );
    return;
  }

  const frozenManifest = verifyFrozenManifest();
  const apiConfig = resolveApiConfig();
  const startedAt = new Date().toISOString();
  const safeTs = startedAt.replace(/[:.]/g, '-');
  const runId = `${safeTs}-${reasoningEffort}-${only}`;
  const runDir = path.join(__dirname, 'runs', runId);
  const rawDir = path.join(runDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  console.log(`[ST1] Starting live run: ${runId}`);
  console.log(
    `[ST1] Endpoint: ${apiConfig.endpoint} | Model: ${apiConfig.model} | Effort: ${reasoningEffort}`
  );
  console.log(`[ST1] Planned API calls: ${plan.length}`);

  const allRecords = [];
  let totalTransportRetries = 0;
  let callIndex = 0;

  // Map storing actual live-staged & Host-folded final ledgers from Part A1 for each scenario
  const stagedFinalLedgers = new Map();

  // Execute Part A1 (6 scenarios × 4 steps = 24 calls)
  if (only === 'all' || only === 'A' || only === 'A1') {
    for (const sc of SCENARIOS) {
      let liveLedger = createEmptyLedger();

      for (const s of sc.steps) {
        callIndex++;
        const ordinal = String(callIndex).padStart(2, '0');
        const taskId = `A1_${sc.id}_step${s.step}_${s.kind}`;

        const headBefore = projectReadOnlyLedger(liveLedger, { includeTombstones: true });
        const userMessage = buildStagingUserMessage({
          scenarioId: sc.id,
          stepLabel: `step_${s.step}_${s.kind}`,
          headSnapshot: headBefore,
          dialogue: s.dialogue
        });

        const messages = [
          { role: 'system', content: STAGING_EXTRACTOR_PROMPT },
          { role: 'user', content: userMessage }
        ];

        const apiResult = await callChatCompletion({
          messages,
          sessionKey: `${runId}-${taskId}`,
          reasoningEffort
        });
        totalTransportRetries += apiResult.transport_retries;

        const parsed = parseStrictJson(apiResult.content);
        const extractedOps =
          parsed.valid && Array.isArray(parsed.value?.ops) ? parsed.value.ops : [];

        const foldResult = foldLedger(liveLedger, extractedOps, {
          source_step: `${sc.id}_step_${s.step}`
        });
        liveLedger = foldResult.ledger;
        const headAfter = projectReadOnlyLedger(liveLedger, { includeTombstones: true });

        const grade = gradeStagingOp(apiResult.content, s.expected_spec, foldResult);

        const rawRecord = {
          task_id: taskId,
          part: 'A1',
          scenario_id: sc.id,
          step: s.step,
          step_kind: s.kind,
          expected_spec: s.expected_spec,
          head_before: headBefore,
          head_after: headAfter,
          extracted_ops: extractedOps,
          fold_accepted_ops: foldResult.accepted_ops,
          fold_rejected_ops: foldResult.rejected_ops,
          grade,
          reasoning_effort: reasoningEffort,
          endpoint: apiResult.endpoint,
          model: apiResult.model,
          system_fingerprint: apiResult.system_fingerprint,
          started_at: apiResult.started_at,
          completed_at: apiResult.completed_at,
          elapsed_ms: apiResult.elapsed_ms,
          transport_retries: apiResult.transport_retries,
          attempt_logs: apiResult.attempt_logs,
          usage: apiResult.usage,
          finish_reason: apiResult.finish_reason,
          raw_content: apiResult.content,
          raw_reasoning_content: apiResult.reasoning_content,
          request_headers: apiResult.request_headers,
          request_body: apiResult.request_body,
          response_body: apiResult.response_body
        };

        const rawFilePath = path.join(rawDir, `${ordinal}-${taskId}.json`);
        fs.writeFileSync(rawFilePath, `${JSON.stringify(rawRecord, null, 2)}\n`, 'utf8');

        allRecords.push({
          task_id: taskId,
          part: 'A1',
          scenario_id: sc.id,
          step: s.step,
          step_kind: s.kind,
          elapsed_ms: apiResult.elapsed_ms,
          transport_retries: apiResult.transport_retries,
          usage: apiResult.usage,
          grade,
          raw_file: `raw/${ordinal}-${taskId}.json`
        });

        console.log(
          `[${ordinal}/${String(plan.length).padStart(2, '0')}] ${taskId} -> ops=[${grade.observed_op_types.join(',')}] pass=${grade.full_pass} false_write=${grade.false_write} rejected=${grade.host_rejected_ops} (${apiResult.elapsed_ms}ms, reason_tok=${apiResult.usage.reasoning_tokens ?? 'n/a'})`
        );
      }

      stagedFinalLedgers.set(sc.id, liveLedger);
    }
  }

  // Execute Part A2 (12 frozen boundary trap probes)
  if (only === 'all' || only === 'A' || only === 'A2') {
    for (const trap of BOUNDARY_TRAPS) {
      callIndex++;
      const ordinal = String(callIndex).padStart(2, '0');
      const taskId = `A2_${trap.id}`;

      const userMessage = buildStagingUserMessage({
        scenarioId: trap.id,
        stepLabel: trap.category,
        headSnapshot: trap.head_snapshot,
        dialogue: trap.dialogue
      });

      const messages = [
        { role: 'system', content: STAGING_EXTRACTOR_PROMPT },
        { role: 'user', content: userMessage }
      ];

      const apiResult = await callChatCompletion({
        messages,
        sessionKey: `${runId}-${taskId}`,
        reasoningEffort
      });
      totalTransportRetries += apiResult.transport_retries;

      const parsed = parseStrictJson(apiResult.content);
      const extractedOps =
        parsed.valid && Array.isArray(parsed.value?.ops) ? parsed.value.ops : [];

      const baseLedger = hydrateLedgerFromSnapshot(trap.head_snapshot);
      const foldResult = foldLedger(baseLedger, extractedOps, {
        source_step: trap.id
      });

      const grade = gradeStagingOp(apiResult.content, trap.expected_spec, foldResult);

      const rawRecord = {
        task_id: taskId,
        part: 'A2',
        trap_id: trap.id,
        trap_category: trap.category,
        expected_spec: trap.expected_spec,
        head_before: trap.head_snapshot,
        head_after: projectReadOnlyLedger(foldResult.ledger, { includeTombstones: true }),
        extracted_ops: extractedOps,
        fold_accepted_ops: foldResult.accepted_ops,
        fold_rejected_ops: foldResult.rejected_ops,
        grade,
        reasoning_effort: reasoningEffort,
        endpoint: apiResult.endpoint,
        model: apiResult.model,
        system_fingerprint: apiResult.system_fingerprint,
        started_at: apiResult.started_at,
        completed_at: apiResult.completed_at,
        elapsed_ms: apiResult.elapsed_ms,
        transport_retries: apiResult.transport_retries,
        attempt_logs: apiResult.attempt_logs,
        usage: apiResult.usage,
        finish_reason: apiResult.finish_reason,
        raw_content: apiResult.content,
        raw_reasoning_content: apiResult.reasoning_content,
        request_headers: apiResult.request_headers,
        request_body: apiResult.request_body,
        response_body: apiResult.response_body
      };

      const rawFilePath = path.join(rawDir, `${ordinal}-${taskId}.json`);
      fs.writeFileSync(rawFilePath, `${JSON.stringify(rawRecord, null, 2)}\n`, 'utf8');

      allRecords.push({
        task_id: taskId,
        part: 'A2',
        trap_id: trap.id,
        trap_category: trap.category,
        elapsed_ms: apiResult.elapsed_ms,
        transport_retries: apiResult.transport_retries,
        usage: apiResult.usage,
        grade,
        raw_file: `raw/${ordinal}-${taskId}.json`
      });

      console.log(
        `[${ordinal}/${String(plan.length).padStart(2, '0')}] ${taskId} (${trap.category}) -> ops=[${grade.observed_op_types.join(',')}] pass=${grade.full_pass} false_write=${grade.false_write} (${apiResult.elapsed_ms}ms, reason_tok=${apiResult.usage.reasoning_tokens ?? 'n/a'})`
      );
    }
  }

  // Execute Part B (6 scenarios × 4 Arms = 24 handoff tasks)
  if (only === 'all' || only === 'B') {
    for (const sc of SCENARIOS) {
      const actualStagedLedger = stagedFinalLedgers.get(sc.id) ?? sc.gold_final_ledger;
      const stagedSource = stagedFinalLedgers.has(sc.id)
        ? 'live_part_a1_folded_ledger'
        : 'fallback_gold_ledger';

      for (const arm of PART_B_ARMS) {
        callIndex++;
        const ordinal = String(callIndex).padStart(2, '0');
        const taskId = `B_${sc.id}_${arm.id}`;

        let systemPrompt = arm.contract === 'C0' ? WORKER_C0_PROMPT : WORKER_C1_PROMPT;
        let contextPayload;

        if (arm.input_mode === 'raw_noisy') {
          contextPayload = {
            workspace_raw_transcript: sc.noisy_transcript
          };
        } else if (arm.input_mode === 'ledger_gold') {
          contextPayload = {
            workspace_ledger: sc.gold_final_head
          };
        } else if (arm.input_mode === 'ledger_staged') {
          contextPayload = {
            workspace_ledger: projectReadOnlyLedger(actualStagedLedger, {
              includeTombstones: true
            })
          };
        } else if (arm.input_mode === 'ledger_staged_no_tombstone') {
          contextPayload = {
            workspace_ledger: projectReadOnlyLedger(actualStagedLedger, {
              includeTombstones: false
            })
          };
        }

        const userMessage = buildWorkerUserMessage({
          scenarioId: sc.id,
          armId: arm.id,
          contextPayload,
          question: sc.worker_b_prompt
        });

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ];

        const apiResult = await callChatCompletion({
          messages,
          sessionKey: `${runId}-${taskId}`,
          reasoningEffort
        });
        totalTransportRetries += apiResult.transport_retries;

        const grade = gradeWorkerDelivery(apiResult.content, sc);

        const rawRecord = {
          task_id: taskId,
          part: 'B',
          scenario_id: sc.id,
          arm_id: arm.id,
          contract: arm.contract,
          staged_ledger_source: stagedSource,
          expected_active_option: sc.opt_c,
          falsify_a_code: sc.falsify_a_code,
          context_payload: contextPayload,
          grade,
          reasoning_effort: reasoningEffort,
          endpoint: apiResult.endpoint,
          model: apiResult.model,
          system_fingerprint: apiResult.system_fingerprint,
          started_at: apiResult.started_at,
          completed_at: apiResult.completed_at,
          elapsed_ms: apiResult.elapsed_ms,
          transport_retries: apiResult.transport_retries,
          attempt_logs: apiResult.attempt_logs,
          usage: apiResult.usage,
          finish_reason: apiResult.finish_reason,
          raw_content: apiResult.content,
          raw_reasoning_content: apiResult.reasoning_content,
          request_headers: apiResult.request_headers,
          request_body: apiResult.request_body,
          response_body: apiResult.response_body
        };

        const rawFilePath = path.join(rawDir, `${ordinal}-${taskId}.json`);
        fs.writeFileSync(rawFilePath, `${JSON.stringify(rawRecord, null, 2)}\n`, 'utf8');

        allRecords.push({
          task_id: taskId,
          part: 'B',
          scenario_id: sc.id,
          arm_id: arm.id,
          contract: arm.contract,
          expected_active_option: sc.opt_c,
          falsify_a_code: sc.falsify_a_code,
          elapsed_ms: apiResult.elapsed_ms,
          transport_retries: apiResult.transport_retries,
          usage: apiResult.usage,
          grade,
          raw_file: `raw/${ordinal}-${taskId}.json`
        });

        console.log(
          `[${ordinal}/${String(plan.length).padStart(2, '0')}] ${taskId} -> active=${grade.observed_active_option}/${sc.opt_c} rej=${grade.rejected_regression} evid=${grade.tombstone_evidence_cited} blk=${grade.open_blockers_exact} pass=${grade.full_pass} (${apiResult.elapsed_ms}ms, reason_tok=${apiResult.usage.reasoning_tokens ?? 'n/a'})`
        );
      }
    }
  }

  const completedAt = new Date().toISOString();
  const summary = summarizeRun(allRecords);
  const meta = {
    run_id: runId,
    protocol_version: PROTOCOL_VERSION,
    model: apiConfig.model,
    reasoning_effort: reasoningEffort,
    only,
    started_at: startedAt,
    completed_at: completedAt,
    total_transport_retries: totalTransportRetries,
    frozen_manifest: frozenManifest
  };

  const fullSummaryObj = {
    meta,
    summary,
    records: allRecords
  };

  const summaryPath = path.join(runDir, 'summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(fullSummaryObj, null, 2)}\n`, 'utf8');

  const reportMd = generateMarkdownReport(summary, allRecords, meta);
  const runReportPath = path.join(runDir, 'REPORT.md');
  fs.writeFileSync(runReportPath, `${reportMd}\n`, 'utf8');

  if (only === 'all' && reasoningEffort === 'max') {
    const topReportPath = path.join(__dirname, 'REPORT.md');
    fs.writeFileSync(topReportPath, `${reportMd}\n`, 'utf8');
  }

  console.log(`[ST1] Run completed. Summary written to: ${summaryPath}`);
  console.log(`[ST1] Report written to: ${runReportPath}`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main().catch(err => {
    console.error('[ST1] Fatal error:', err);
    process.exit(1);
  });
}
