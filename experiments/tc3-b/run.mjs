#!/usr/bin/env node
// TC3-B Experiment Runner
// Supports:
//   --dry-run
//   --only=S0|S1|S2|all
//   --reasoning-effort=max|high|medium|low|none

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROTOCOL_VERSION,
  SYSTEM_C0,
  STORY_ID,
  ORACLE,
  CONDITIONS
} from './story.mjs';
import { stripExplicitHeaders, FROZEN_PROPER_NOUN_RULES } from './stripper.mjs';
import { gradeTurn, summarizeRun, generateMarkdownReport } from './evaluate.mjs';
import { buildProtocolMessages, callChatCompletion, resolveApiConfig } from './client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FROZEN_FILES = [
  'story.mjs',
  'stripper.mjs',
  'evaluate.mjs',
  'client.mjs',
  'run.mjs',
  'tc3-b.node-test.mjs'
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
    experiment: 'TC3-B',
    title: '24-Turn De-Greenhouse Task Continuity Stress Test (Strip CoT & Strip Explicit Headers)',
    protocol_version: PROTOCOL_VERSION,
    story_id: STORY_ID,
    system_prompt_variant: 'SYSTEM_C0 (Verbatim original TC1-TC3 prompt)',
    frozen_at: new Date().toISOString(),
    conditions_count: CONDITIONS.length,
    turns_per_condition: ORACLE.length,
    total_planned_calls: CONDITIONS.length * ORACLE.length,
    frozen_proper_nouns: FROZEN_PROPER_NOUN_RULES.map(r => r.pattern),
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

  const validOnly = new Set([
    'all',
    'S0',
    'S1',
    'S2',
    'S0_baseline',
    'S1_strip_cot',
    'S2_strip_cot_and_header'
  ]);
  if (!validOnly.has(only)) {
    throw new Error(`Invalid --only=${only}. Expected S0|S1|S2|all.`);
  }

  const validEfforts = new Set(['max', 'high', 'medium', 'low', 'none']);
  if (!validEfforts.has(reasoningEffort)) {
    throw new Error(
      `Invalid --reasoning-effort=${reasoningEffort}. Expected max|high|medium|low|none.`
    );
  }

  return { dryRun, only, reasoningEffort };
}

export function selectConditions(only) {
  if (only === 'all') return CONDITIONS;
  return CONDITIONS.filter(c => c.short_id === only || c.id === only);
}

export function buildTaskPlan(only = 'all') {
  const selected = selectConditions(only);
  const plan = [];
  for (const cond of selected) {
    for (const o of ORACLE) {
      plan.push({
        task_id: `${cond.id}_${STORY_ID}_t${String(o.turn).padStart(2, '0')}`,
        condition_id: cond.id,
        condition_short_id: cond.short_id,
        include_reasoning_history: cond.include_reasoning_history,
        strip_headers: cond.strip_headers,
        story_id: STORY_ID,
        turn: o.turn,
        source_id: o.source_id,
        task_key: o.task_key,
        kind: o.kind,
        gap_turns: o.gap_turns,
        gap_bucket: o.gap_bucket,
        expected: o.expected
      });
    }
  }
  return plan;
}

async function main() {
  const { dryRun, only, reasoningEffort } = parseCliArgs(process.argv.slice(2));
  const selectedConditions = selectConditions(only);
  const plan = buildTaskPlan(only);

  if (dryRun) {
    const { manifestPath, manifest } = writeFrozenManifest();
    const bucketCounts = {
      birth_or_continue: ORACLE.filter(o => o.gap_bucket === 'birth_or_continue').length,
      short_return: ORACLE.filter(o => o.gap_bucket === 'short_return').length,
      long_return: ORACLE.filter(o => o.gap_bucket === 'long_return').length
    };
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          only,
          reasoning_effort: reasoningEffort,
          protocol_version: PROTOCOL_VERSION,
          system_prompt: 'SYSTEM_C0 (verbatim original TC3)',
          total_planned_calls: plan.length,
          conditions: selectedConditions.map(c => ({
            id: c.id,
            include_reasoning_history: c.include_reasoning_history,
            strip_headers: c.strip_headers,
            turns: ORACLE.length
          })),
          gap_bucket_turns_per_condition: bucketCounts,
          long_return_turns: ORACLE.filter(o => o.gap_bucket === 'long_return').map(o => ({
            turn: o.turn,
            task_key: o.task_key,
            previous_visit_turn: o.previous_visit_turn,
            gap_turns: o.gap_turns,
            expected: o.expected
          })),
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

  console.log(`[TC3-B] Starting live run: ${runId}`);
  console.log(`[TC3-B] Endpoint: ${apiConfig.endpoint} | Model: ${apiConfig.model} | Effort: ${reasoningEffort}`);
  console.log(`[TC3-B] Planned API calls: ${plan.length} (${selectedConditions.length} conditions x ${ORACLE.length} turns)`);

  const allRecords = [];
  let totalTransportRetries = 0;
  let callIndex = 0;

  for (const cond of selectedConditions) {
    const historyTurns = [];

    for (const oracleTurn of ORACLE) {
      callIndex++;
      const ordinal = String(callIndex).padStart(3, '0');
      const turnPad = String(oracleTurn.turn).padStart(2, '0');
      const taskId = `${cond.id}_${STORY_ID}_t${turnPad}`;

      historyTurns.push({
        source_id: oracleTurn.source_id,
        role: 'user',
        content: oracleTurn.text
      });

      const protocolBuildArgs = {
        systemPrompt: SYSTEM_C0,
        turns: historyTurns.map(t => ({ ...t })),
        includeReasoningHistory: cond.include_reasoning_history
      };

      const messages = buildProtocolMessages(protocolBuildArgs);

      const apiResult = await callChatCompletion({
        messages,
        protocolBuildArgs,
        sessionKey: `${runId}-${cond.short_id}`,
        reasoningEffort
      });
      totalTransportRetries += apiResult.transport_retries;

      // Grade the model's unstripped raw output on the current turn
      const grade = gradeTurn(apiResult.content, oracleTurn);

      // Prepare the assistant content that will be stored in history for subsequent turns (t+1 .. 24)
      const storedHistoryContent = cond.strip_headers
        ? stripExplicitHeaders(apiResult.content)
        : apiResult.content;

      const rawRecord = {
        task_id: taskId,
        condition_id: cond.id,
        condition_short_id: cond.short_id,
        include_reasoning_history: cond.include_reasoning_history,
        strip_headers: cond.strip_headers,
        story_id: STORY_ID,
        turn: oracleTurn.turn,
        source_id: oracleTurn.source_id,
        oracle: oracleTurn,
        reasoning_effort: reasoningEffort,
        endpoint: apiResult.endpoint,
        model: apiResult.model,
        system_fingerprint: apiResult.system_fingerprint,
        started_at: apiResult.started_at,
        completed_at: apiResult.completed_at,
        elapsed_ms: apiResult.elapsed_ms,
        transport_retries: apiResult.transport_retries,
        wire_assistant_reasoning_mode: apiResult.wire_assistant_reasoning_mode,
        attempt_logs: apiResult.attempt_logs,
        usage: apiResult.usage,
        finish_reason: apiResult.finish_reason,
        raw_content: apiResult.content,
        stored_history_content: storedHistoryContent,
        header_stripped_changed: storedHistoryContent !== apiResult.content,
        raw_reasoning_content: apiResult.reasoning_content,
        grade,
        request_body: apiResult.request_body,
        response_body: apiResult.response_body
      };

      // Immediate synchronous persistence to disk after each single API call
      const rawFilePath = path.join(rawDir, `${ordinal}-${taskId}.json`);
      fs.writeFileSync(rawFilePath, `${JSON.stringify(rawRecord, null, 2)}\n`, 'utf8');

      // Append assistant reply to conversation history according to condition's stripping rule
      historyTurns.push({
        source_id: `a${oracleTurn.turn}`,
        role: 'assistant',
        content: storedHistoryContent,
        ...(cond.include_reasoning_history && typeof apiResult.reasoning_content === 'string'
          ? { reasoning_content: apiResult.reasoning_content }
          : {})
      });

      const recordSummary = {
        task_id: taskId,
        condition_id: cond.id,
        condition_short_id: cond.short_id,
        include_reasoning_history: cond.include_reasoning_history,
        strip_headers: cond.strip_headers,
        story_id: STORY_ID,
        turn: oracleTurn.turn,
        elapsed_ms: apiResult.elapsed_ms,
        transport_retries: apiResult.transport_retries,
        wire_assistant_reasoning_mode: apiResult.wire_assistant_reasoning_mode,
        usage: apiResult.usage,
        header_stripped_changed: storedHistoryContent !== apiResult.content,
        grade,
        raw_file: `raw/${ordinal}-${taskId}.json`
      };
      allRecords.push(recordSummary);

      console.log(
        `[${ordinal}/${String(plan.length).padStart(3, '0')}] ${taskId} (gap=${oracleTurn.gap_turns}, ${oracleTurn.gap_bucket}) -> expected=${grade.expected} observed=${grade.observed} exact=${grade.canonical_exact} ans=${grade.answer_minimal} full=${grade.full_pass} (${apiResult.elapsed_ms}ms, reason_tok=${apiResult.usage.reasoning_tokens ?? 'n/a'})`
      );
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

  console.log(`[TC3-B] Run completed. Summary written to: ${summaryPath}`);
  console.log(`[TC3-B] Report written to: ${runReportPath}`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main().catch(err => {
    console.error('[TC3-B] Fatal error:', err);
    process.exit(1);
  });
}
