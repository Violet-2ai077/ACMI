// TH1-B Experiment Runner & Freeze Manifest Generator
// Zero external dependencies.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, SCENARIO_MAP, buildReceiverUserPrompt } from './scenarios.mjs';
import { RECEIVER_C0, RECEIVER_C1, COMPRESSOR_STRICT, PROMPTS } from './prompts.mjs';
import { gradeReceiver, gradeCompressor, summarizeRun } from './evaluate.mjs';
import {
  resolveClientConfig,
  buildChatRequestBody,
  invokeChatCompletion,
  sha256Hex,
  DEFAULT_REASONING_EFFORT
} from './client.mjs';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(ROOT_DIR, 'frozen-manifest.json');
export const RUNS_DIR = join(ROOT_DIR, 'runs');

const SOURCE_FILES = [
  'scenarios.mjs',
  'prompts.mjs',
  'evaluate.mjs',
  'client.mjs',
  'run.mjs',
  'th1-b.node-test.mjs'
];

export function buildAllTasks() {
  const tasks = [];
  let ordinal = 0;

  // Experiment A: 8 scenarios * 4 packets * 2 contracts = 64 tasks
  const packetKeys = ['filtered_P0', 'filtered_P1', 'compact_P0', 'compact_P1'];
  const contracts = [
    { key: 'C0', prompt: RECEIVER_C0 },
    { key: 'C1', prompt: RECEIVER_C1 }
  ];

  for (const scenario of SCENARIOS) {
    for (const packetKey of packetKeys) {
      const packet = scenario.packets[packetKey];
      const [representation, pollution] = packetKey.split('_');
      for (const contract of contracts) {
        ordinal++;
        const condition = `${packetKey}_${contract.key}`;
        tasks.push({
          ordinal,
          task_id: `A-${scenario.id}-${packetKey}-${contract.key}`,
          exp: 'A',
          scenario_id: scenario.id,
          role: 'receiver',
          representation,
          pollution,
          contract: contract.key,
          condition,
          packet_key: packetKey,
          depends_on: null,
          system_prompt: contract.prompt,
          user_prompt: buildReceiverUserPrompt(packet, scenario.target_job)
        });
      }
    }
  }

  // Experiment B: 8 scenarios * (1 compressor + 2 downstream receivers) = 24 tasks
  for (const scenario of SCENARIOS) {
    ordinal++;
    const compressTaskId = `B-${scenario.id}-compress_strict`;
    tasks.push({
      ordinal,
      task_id: compressTaskId,
      exp: 'B',
      scenario_id: scenario.id,
      role: 'compressor',
      representation: 'filtered_transcript',
      pollution: 'P0',
      contract: 'STRICT',
      condition: 'compress_strict',
      packet_key: 'filtered_P0.transcript',
      depends_on: null,
      system_prompt: COMPRESSOR_STRICT,
      user_prompt: JSON.stringify(scenario.packets.filtered_P0.transcript)
    });

    for (const contract of contracts) {
      ordinal++;
      const placeholderPacket = {
        note: `<DYNAMIC_OUTPUT_FROM:${compressTaskId}>`,
        memory: scenario.memory
      };
      tasks.push({
        ordinal,
        task_id: `B-${scenario.id}-compact_strict-${contract.key}`,
        exp: 'B',
        scenario_id: scenario.id,
        role: 'receiver',
        representation: 'compact_strict',
        pollution: 'dynamic',
        contract: contract.key,
        condition: `compact_strict_${contract.key}`,
        packet_key: 'dynamic_compact_strict',
        depends_on: compressTaskId,
        system_prompt: contract.prompt,
        user_prompt: buildReceiverUserPrompt(placeholderPacket, scenario.target_job)
      });
    }
  }

  return tasks;
}

export function validateExperimentIntegrity(allTasks = buildAllTasks()) {
  if (SCENARIOS.length !== 8) {
    throw new Error(`Expected 8 scenarios, got ${SCENARIOS.length}`);
  }
  if (allTasks.length !== 88) {
    throw new Error(`Expected 88 total tasks, got ${allTasks.length}`);
  }

  const expATasks = allTasks.filter(t => t.exp === 'A');
  const expBTasks = allTasks.filter(t => t.exp === 'B');
  if (expATasks.length !== 64) {
    throw new Error(`Expected 64 Experiment A tasks, got ${expATasks.length}`);
  }
  if (expBTasks.length !== 24) {
    throw new Error(`Expected 24 Experiment B tasks, got ${expBTasks.length}`);
  }

  const uniqueTaskIds = new Set(allTasks.map(t => t.task_id));
  if (uniqueTaskIds.size !== 88) {
    throw new Error(`Task IDs are not unique: ${uniqueTaskIds.size} unique out of 88`);
  }

  for (const s of SCENARIOS) {
    if (!Array.isArray(s.stale_footers) || s.stale_footers.length === 0) {
      throw new Error(`Scenario ${s.id} must define non-empty stale_footers`);
    }
    const expectedLine = `${s.expected.trail[s.expected.trail.length - 1]}/${s.expected.seal}/${s.expected.footer}`;
    if (s.expected.print_line !== expectedLine) {
      throw new Error(`Scenario ${s.id} print_line mismatch: ${s.expected.print_line} !== ${expectedLine}`);
    }

    // Verify P0 contains all stale_footers and P1 contains none
    for (const p0Key of ['filtered_P0', 'compact_P0']) {
      const serialized = JSON.stringify(s.packets[p0Key]);
      for (const stale of s.stale_footers) {
        if (!serialized.includes(stale)) {
          throw new Error(`Scenario ${s.id} ${p0Key} is missing stale footer ${stale}`);
        }
      }
    }
    for (const p1Key of ['filtered_P1', 'compact_P1']) {
      const serialized = JSON.stringify(s.packets[p1Key]);
      for (const stale of s.stale_footers) {
        if (serialized.includes(stale)) {
          throw new Error(`Scenario ${s.id} ${p1Key} leaked stale footer ${stale}`);
        }
      }
    }
  }

  // Validate request body construction for all 88 tasks
  for (const task of allTasks) {
    const reqBody = buildChatRequestBody({
      systemPrompt: task.system_prompt,
      userPrompt: task.user_prompt
    });
    if (!Array.isArray(reqBody.messages) || reqBody.messages.length !== 2) {
      throw new Error(`Invalid request messages shape for task ${task.task_id}`);
    }
  }

  return {
    scenarios_count: SCENARIOS.length,
    total_tasks: allTasks.length,
    exp_a_tasks: expATasks.length,
    exp_b_tasks: expBTasks.length,
    valid: true
  };
}

export function computeSourceFileHashes() {
  const hashes = {};
  for (const name of SOURCE_FILES) {
    const fullPath = join(ROOT_DIR, name);
    if (existsSync(fullPath)) {
      // Normalize CRLF -> LF before hashing for cross-platform determinism
      const normalized = readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
      hashes[name] = sha256Hex(normalized);
    }
  }
  return hashes;
}

export function generateFrozenManifest(allTasks = buildAllTasks()) {
  const integrity = validateExperimentIntegrity(allTasks);
  const fileHashes = computeSourceFileHashes();
  const scenariosSha256 = sha256Hex(JSON.stringify(SCENARIOS));
  const promptsSha256 = sha256Hex(JSON.stringify(PROMPTS));
  const taskMatrixSha256 = sha256Hex(
    JSON.stringify(
      allTasks.map(t => ({
        ordinal: t.ordinal,
        task_id: t.task_id,
        exp: t.exp,
        scenario_id: t.scenario_id,
        role: t.role,
        condition: t.condition,
        depends_on: t.depends_on,
        system_prompt_sha256: sha256Hex(t.system_prompt),
        user_prompt_sha256: sha256Hex(t.user_prompt)
      }))
    )
  );

  const manifest = {
    protocol: 'TH1-B-STALE-RULE-RESURRECTION-ABLATION-v1',
    frozen_at: new Date().toISOString(),
    integrity,
    digests: {
      scenarios_sha256: scenariosSha256,
      prompts_sha256: promptsSha256,
      task_matrix_sha256: taskMatrixSha256,
      files: fileHashes
    },
    scenarios_summary: SCENARIOS.map(s => ({
      id: s.id,
      family: s.family,
      local_turns: s.local_turns,
      memory_source_turn: s.memory_source_turn,
      stale_footers: s.stale_footers,
      expected: s.expected
    }))
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

export function verifyFrozenManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `frozen-manifest.json not found at ${MANIFEST_PATH}. Run with --dry-run first to freeze corpus and evaluator.`
    );
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const currentScenariosHash = sha256Hex(JSON.stringify(SCENARIOS));
  const currentPromptsHash = sha256Hex(JSON.stringify(PROMPTS));
  if (manifest.digests?.scenarios_sha256 !== currentScenariosHash) {
    throw new Error('frozen_manifest_mismatch: scenarios.mjs corpus changed since freeze');
  }
  if (manifest.digests?.prompts_sha256 !== currentPromptsHash) {
    throw new Error('frozen_manifest_mismatch: prompts.mjs changed since freeze');
  }
  const currentFiles = computeSourceFileHashes();
  for (const criticalFile of ['scenarios.mjs', 'prompts.mjs', 'evaluate.mjs']) {
    if (manifest.digests?.files?.[criticalFile] !== currentFiles[criticalFile]) {
      throw new Error(`frozen_manifest_mismatch: ${criticalFile} hash changed since freeze`);
    }
  }
  return manifest;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  let dryRun = false;
  let only = 'all';
  let reasoningEffort = DEFAULT_REASONING_EFFORT;
  let runId = null;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).trim();
    } else if (arg.startsWith('--reasoning-effort=')) {
      reasoningEffort = arg.slice('--reasoning-effort='.length).trim();
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length).trim();
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  if (!['A', 'B', 'all'].includes(only)) {
    throw new Error(`Invalid --only="${only}". Expected A, B, or all.`);
  }
  if (!['max', 'high', 'medium', 'low', 'none'].includes(reasoningEffort)) {
    throw new Error(
      `Invalid --reasoning-effort="${reasoningEffort}". Expected max, high, medium, low, or none.`
    );
  }

  return { dryRun, only, reasoningEffort, runId };
}

export function filterTasks(allTasks, only = 'all') {
  if (only === 'all') return allTasks;
  return allTasks.filter(t => t.exp === only);
}

export function formatDryRunReport(manifest, selectedTasks, config) {
  const expACount = selectedTasks.filter(t => t.exp === 'A').length;
  const expBCount = selectedTasks.filter(t => t.exp === 'B').length;

  const lines = [
    '================================================================================',
    'TH1-B (--dry-run) Validation & Freeze Manifest Report',
    '================================================================================',
    `Protocol          : ${manifest.protocol}`,
    `Endpoint          : ${config.endpoint}`,
    `Model             : ${config.model}`,
    `Reasoning Effort  : ${config.reasoning_effort}`,
    `Credential Source : ${config.credential_source} (available=${config.credential_available})`,
    `Total Blueprint   : ${manifest.integrity.total_tasks} tasks (Exp A: ${manifest.integrity.exp_a_tasks}, Exp B: ${manifest.integrity.exp_b_tasks})`,
    `Selected to Run   : ${selectedTasks.length} tasks (Exp A: ${expACount}, Exp B: ${expBCount})`,
    `Scenarios SHA-256 : ${manifest.digests.scenarios_sha256}`,
    `Prompts SHA-256   : ${manifest.digests.prompts_sha256}`,
    `Matrix SHA-256    : ${manifest.digests.task_matrix_sha256}`,
    '',
    '--- Scenarios Summary (V0–V7) ---',
    '| ID | Family | Local Turns | Memory Source | Stale Footers | Expected Trail | Expected Print Line |',
    '|---|---|---|---|---|---|---|'
  ];

  for (const s of SCENARIOS) {
    lines.push(
      `| ${s.id} | ${s.family} | [${s.local_turns.join(', ')}] | turn ${s.memory_source_turn} | [${s.stale_footers.join(', ')}] | [${s.expected.trail.join(' -> ')}] | ${s.expected.print_line} |`
    );
  }

  lines.push(
    '',
    '--- Task Matrix Breakdown (11 Tasks x 8 Scenarios = 88 Tasks) ---',
    'Experiment A (64 tasks = 8 scenarios x 4 packets x 2 contracts):',
    '  1. filtered_P0_C0  (Filtered transcript w/ stale footer, baseline receiver C0)',
    '  2. filtered_P0_C1  (Filtered transcript w/ stale footer, authority contract C1)',
    '  3. filtered_P1_C0  (Filtered transcript purged of stale footer, baseline receiver C0)',
    '  4. filtered_P1_C1  (Filtered transcript purged of stale footer, authority contract C1)',
    '  5. compact_P0_C0   (Compacted note w/ stale footer, baseline receiver C0)',
    '  6. compact_P0_C1   (Compacted note w/ stale footer, authority contract C1)',
    '  7. compact_P1_C0   (Compacted note purged of stale footer, baseline receiver C0)',
    '  8. compact_P1_C1   (Compacted note purged of stale footer, authority contract C1)',
    'Experiment B (24 tasks = 8 scenarios x [1 compressor + 2 downstream receivers]):',
    '  9. compress_strict   (COMPRESSOR_STRICT on filtered_P0.transcript)',
    ' 10. compact_strict_C0 (Downstream receiver C0 on COMPRESSOR_STRICT output + memory)',
    ' 11. compact_strict_C1 (Downstream receiver C1 on COMPRESSOR_STRICT output + memory)',
    '================================================================================'
  );

  return lines.join('\n');
}

export async function executeRun(cliOptions = parseCliArgs()) {
  const allTasks = buildAllTasks();
  const selectedTasks = filterTasks(allTasks, cliOptions.only);

  if (cliOptions.dryRun) {
    const config = resolveClientConfig({
      reasoningEffort: cliOptions.reasoningEffort,
      requireCredential: false
    });
    const manifest = generateFrozenManifest(allTasks);
    const reportText = formatDryRunReport(manifest, selectedTasks, config);
    console.log(reportText);
    return { dryRun: true, manifest, selectedTasks };
  }

  // Live run requires pre-existing verified frozen-manifest.json and valid credentials
  const manifest = verifyFrozenManifest();
  validateExperimentIntegrity(allTasks);
  const config = resolveClientConfig({
    reasoningEffort: cliOptions.reasoningEffort,
    requireCredential: true
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runId = cliOptions.runId || `${stamp}-${cliOptions.reasoningEffort}-${cliOptions.only}`;
  const runDir = join(RUNS_DIR, runId);
  const rawDir = join(runDir, 'raw');
  mkdirSync(rawDir, { recursive: true });

  const compressorOutputs = new Map();
  const gradedRecords = [];

  for (const baseTask of selectedTasks) {
    const task = { ...baseTask };
    const scenario = SCENARIO_MAP[task.scenario_id];

    // If this is a downstream Experiment B receiver task, inject the actual compressor note
    if (task.depends_on) {
      if (!compressorOutputs.has(task.depends_on)) {
        throw new Error(`Missing upstream compressor output for ${task.depends_on}`);
      }
      const compressedNote = compressorOutputs.get(task.depends_on);
      task.user_prompt = buildReceiverUserPrompt(
        { note: compressedNote, memory: scenario.memory },
        scenario.target_job
      );
    }

    const rawArtifact = await invokeChatCompletion({
      config,
      task,
      rawDir
    });

    const rawContent = rawArtifact.raw_response.content;
    let grade;
    if (task.role === 'compressor') {
      compressorOutputs.set(task.task_id, rawContent);
      grade = gradeCompressor(rawContent, scenario);
    } else {
      grade = gradeReceiver(rawContent, scenario);
    }

    const record = {
      ordinal: task.ordinal,
      task_id: task.task_id,
      exp: task.exp,
      scenario_id: task.scenario_id,
      family: scenario.family,
      role: task.role,
      representation: task.representation,
      pollution: task.pollution,
      contract: task.contract,
      condition: task.condition,
      depends_on: task.depends_on,
      transport_retries: rawArtifact.transport_retries,
      latency_ms: rawArtifact.latency_ms,
      model: rawArtifact.raw_response.model,
      system_fingerprint: rawArtifact.raw_response.system_fingerprint,
      usage: rawArtifact.raw_response.usage,
      raw_content: rawContent,
      grade
    };

    gradedRecords.push(record);
    console.log(
      `[${String(task.ordinal).padStart(2, '0')}/88] ${task.task_id} -> pass=${grade.pass} (${Math.round(rawArtifact.latency_ms)}ms, retries=${rawArtifact.transport_retries})`
    );
  }

  const { stats, markdown } = summarizeRun(gradedRecords);
  const summaryPayload = {
    run_id: runId,
    completed_at: new Date().toISOString(),
    config: {
      endpoint: config.endpoint,
      model: config.model,
      reasoning_effort: config.reasoning_effort,
      only: cliOptions.only
    },
    frozen_manifest_digests: manifest.digests,
    stats,
    records: gradedRecords
  };

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summaryPayload, null, 2) + '\n', 'utf8');
  writeFileSync(join(runDir, 'REPORT.md'), markdown, 'utf8');

  return { dryRun: false, runId, runDir, summaryPayload };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await executeRun(parseCliArgs());
  } catch (err) {
    console.error(`[TH1-B Error] ${err.message}`);
    process.exitCode = 1;
  }
}
