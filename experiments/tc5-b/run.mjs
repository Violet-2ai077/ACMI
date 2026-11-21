// TC5-B Experiment Runner & Freeze Manifest Generator
// Zero external dependencies.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_C0, SYSTEM_C1, PROMPTS, PROTOCOL_VERSION } from './prompts.mjs';
import { PROBES, PROBE_MAP, buildProbeConversationMessages } from './probes.mjs';
import { PUBLIC_CORPUS, ORACLE, SCHEDULE, TC5_CORPUS } from './stories.mjs';
import { parseOutput, gradeProbe, gradeStoryTurn, summarizeRun } from './evaluate.mjs';
import {
  resolveClientConfig,
  buildTc5ChatRequestBody,
  invokeChatCompletion,
  sha256Hex,
  DEFAULT_REASONING_EFFORT,
  HISTORY_TRANSMISSION_MODE
} from './client.mjs';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(ROOT_DIR, 'frozen-manifest.json');
export const RUNS_DIR = join(ROOT_DIR, 'runs');

const SOURCE_FILES = [
  'prompts.mjs',
  'probes.mjs',
  'stories.mjs',
  'evaluate.mjs',
  'client.mjs',
  'run.mjs',
  'tc5-b.node-test.mjs'
];

export function buildAllTasks() {
  const tasks = [];
  let ordinal = 0;

  const contracts = [
    { key: 'C0', prompt: SYSTEM_C0 },
    { key: 'C1', prompt: SYSTEM_C1 }
  ];

  // Experiment A: 32 probes x 2 contracts (C0, C1) = 64 tasks
  for (const probe of PROBES) {
    const { messages, sourceIds, currentSourceId } = buildProbeConversationMessages(probe);
    for (const contract of contracts) {
      ordinal++;
      tasks.push({
        ordinal,
        task_id: `A-${probe.id}-${contract.key}`,
        exp: 'A',
        probe_id: probe.id,
        domain: probe.domain,
        kind: probe.kind,
        expected: probe.expected,
        recent_relevant: probe.recent_relevant,
        contract: contract.key,
        session_key: `A-${probe.id}-${contract.key}`,
        system_prompt: contract.prompt,
        current_source_id: currentSourceId,
        source_ids: sourceIds,
        conversation_messages: messages
      });
    }
  }

  // Experiment B: 24 closed-loop turns (2 stories x 12 turns) under SYSTEM_C1
  for (const item of SCHEDULE) {
    ordinal++;
    const series = PUBLIC_CORPUS.find(s => s.id === item.story);
    const turnObj = series.turns[item.turn - 1];
    const oracleObj = ORACLE.find(o => o.story === item.story && o.turn === item.turn);
    const placeholderSourceIds = [];
    for (let k = 1; k < item.turn; k++) {
      placeholderSourceIds.push(`u${k}`, `a${k}`);
    }
    placeholderSourceIds.push(`u${item.turn}`);

    tasks.push({
      ordinal,
      task_id: `B-${item.story}-t${String(item.turn).padStart(2, '0')}-C1`,
      exp: 'B',
      story: item.story,
      turn: item.turn,
      kind: oracleObj.kind,
      category: oracleObj.category,
      expected: oracleObj.expected,
      contract: 'C1',
      session_key: `B-${item.story}-C1`,
      system_prompt: SYSTEM_C1,
      current_source_id: turnObj.source_id,
      source_ids: placeholderSourceIds,
      user_text: turnObj.text,
      conversation_messages: [
        {
          source_id: turnObj.source_id,
          role: 'user',
          content: turnObj.text
        }
      ]
    });
  }

  return tasks;
}

export function validateExperimentIntegrity(allTasks = buildAllTasks()) {
  if (PROBES.length !== 32) {
    throw new Error(`Expected 32 probes, got ${PROBES.length}`);
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

  // Validate 2x2 counterbalancing of the 32 probes
  const ambigProbes = PROBES.filter(p => p.kind === 'ambiguous');
  const unambigProbes = PROBES.filter(p => p.kind === 'unambiguous');
  if (ambigProbes.length !== 16 || unambigProbes.length !== 16) {
    throw new Error(
      `Expected 16 ambiguous and 16 unambiguous probes, got ${ambigProbes.length} and ${unambigProbes.length}`
    );
  }

  const ambigR1 = ambigProbes.filter(p => p.recent_relevant === '1').length;
  const ambigR2 = ambigProbes.filter(p => p.recent_relevant === '2').length;
  if (ambigR1 !== 8 || ambigR2 !== 8) {
    throw new Error(`Expected 8 recent=1 and 8 recent=2 ambiguous probes, got ${ambigR1}/${ambigR2}`);
  }

  for (const exp of ['1', '2']) {
    for (const rec of ['1', '2']) {
      const cellCount = unambigProbes.filter(
        p => p.expected === exp && p.recent_relevant === rec
      ).length;
      if (cellCount !== 4) {
        throw new Error(
          `Expected 4 unambiguous probes for (expected=${exp}, recent=${rec}), got ${cellCount}`
        );
      }
    }
  }

  // Validate prefix tail marker <|task:3|> and exclusive token absence on ambiguous triggers
  for (const probe of PROBES) {
    const lastTurn = probe.prefix_turns[probe.prefix_turns.length - 1];
    const parsedLast = parseOutput(lastTurn.assistant);
    if (!parsedLast.valid || parsedLast.marker !== '3') {
      throw new Error(`Probe ${probe.id} prefix must end with valid <|task:3|>`);
    }

    // Verify recent_relevant matches the last candidate turn in prefix_turns
    const candidateTurns = probe.prefix_turns.filter(t => ['1', '2'].includes(t.marker));
    const actualLastCandidate = candidateTurns[candidateTurns.length - 1]?.marker;
    if (actualLastCandidate !== probe.recent_relevant) {
      throw new Error(
        `Probe ${probe.id} recent_relevant=${probe.recent_relevant} does not match last candidate turn (${actualLastCandidate})`
      );
    }

    if (probe.kind === 'ambiguous') {
      const forbidden = [
        ...probe.exclusive_tokens.task1,
        ...probe.exclusive_tokens.task2
      ];
      for (const token of forbidden) {
        if (probe.trigger_text.includes(token)) {
          throw new Error(
            `Ambiguous probe ${probe.id} trigger_text leaked exclusive token "${token}"`
          );
        }
      }
    }
  }

  // Validate Experiment B TC5 24-turn oracle counts
  const storyCounts = { birth: 0, return: 0, continue: 0, ambiguous: 0 };
  for (const o of ORACLE) {
    storyCounts[o.kind]++;
  }
  if (
    JSON.stringify(storyCounts) !==
    JSON.stringify({ birth: 6, return: 12, continue: 2, ambiguous: 4 })
  ) {
    throw new Error(`Experiment B oracle counts mismatch: ${JSON.stringify(storyCounts)}`);
  }

  // Validate request body construction for all 88 tasks
  for (const task of allTasks) {
    const body = buildTc5ChatRequestBody({
      systemPrompt: task.system_prompt,
      currentSourceId: task.current_source_id,
      sourceIds: task.source_ids,
      conversationMessages: task.conversation_messages
    });
    if (!Array.isArray(body.messages) || body.messages.length < 3) {
      throw new Error(`Invalid request messages array for task ${task.task_id}`);
    }
  }

  return {
    probes_count: PROBES.length,
    ambiguous_probes: ambigProbes.length,
    unambiguous_probes: unambigProbes.length,
    stories_count: PUBLIC_CORPUS.length,
    story_turns: ORACLE.length,
    total_tasks: allTasks.length,
    exp_a_tasks: expATasks.length,
    exp_b_tasks: expBTasks.length,
    history_transmission_mode: HISTORY_TRANSMISSION_MODE,
    valid: true
  };
}

export function computeSourceFileHashes() {
  const hashes = {};
  for (const name of SOURCE_FILES) {
    const fullPath = join(ROOT_DIR, name);
    if (existsSync(fullPath)) {
      const normalized = readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
      hashes[name] = sha256Hex(normalized);
    }
  }
  return hashes;
}

export function generateFrozenManifest(allTasks = buildAllTasks()) {
  const integrity = validateExperimentIntegrity(allTasks);
  const fileHashes = computeSourceFileHashes();
  const probesSha256 = sha256Hex(JSON.stringify(PROBES));
  const storiesSha256 = sha256Hex(JSON.stringify(TC5_CORPUS));
  const promptsSha256 = sha256Hex(JSON.stringify(PROMPTS));
  const taskMatrixSha256 = sha256Hex(
    JSON.stringify(
      allTasks.map(t => ({
        ordinal: t.ordinal,
        task_id: t.task_id,
        exp: t.exp,
        contract: t.contract,
        current_source_id: t.current_source_id,
        source_ids: t.source_ids,
        system_prompt_sha256: sha256Hex(t.system_prompt)
      }))
    )
  );

  const manifest = {
    protocol: PROTOCOL_VERSION,
    frozen_at: new Date().toISOString(),
    integrity,
    digests: {
      probes_sha256: probesSha256,
      stories_sha256: storiesSha256,
      prompts_sha256: promptsSha256,
      task_matrix_sha256: taskMatrixSha256,
      files: fileHashes
    }
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
  if (manifest.digests?.probes_sha256 !== sha256Hex(JSON.stringify(PROBES))) {
    throw new Error('frozen_manifest_mismatch: probes.mjs changed since freeze');
  }
  if (manifest.digests?.stories_sha256 !== sha256Hex(JSON.stringify(TC5_CORPUS))) {
    throw new Error('frozen_manifest_mismatch: stories.mjs changed since freeze');
  }
  if (manifest.digests?.prompts_sha256 !== sha256Hex(JSON.stringify(PROMPTS))) {
    throw new Error('frozen_manifest_mismatch: prompts.mjs changed since freeze');
  }
  const currentFiles = computeSourceFileHashes();
  for (const criticalFile of ['prompts.mjs', 'probes.mjs', 'stories.mjs', 'evaluate.mjs']) {
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
    'TC5-B (--dry-run) Validation & Freeze Manifest Report',
    '================================================================================',
    `Protocol          : ${manifest.protocol}`,
    `Endpoint          : ${config.endpoint}`,
    `Model             : ${config.model}`,
    `Reasoning Effort  : ${config.reasoning_effort}`,
    `History Mode      : ${config.history_transmission_mode}`,
    `Credential Source : ${config.credential_source} (available=${config.credential_available})`,
    `Total Blueprint   : ${manifest.integrity.total_tasks} tasks (Exp A: ${manifest.integrity.exp_a_tasks}, Exp B: ${manifest.integrity.exp_b_tasks})`,
    `Selected to Run   : ${selectedTasks.length} tasks (Exp A: ${expACount}, Exp B: ${expBCount})`,
    `Probes SHA-256    : ${manifest.digests.probes_sha256}`,
    `Stories SHA-256   : ${manifest.digests.stories_sha256}`,
    `Prompts SHA-256   : ${manifest.digests.prompts_sha256}`,
    `Matrix SHA-256    : ${manifest.digests.task_matrix_sha256}`,
    '',
    '--- Experiment A: 32 Frozen Prefix Probes (4 Domains x 8 Probes x {C0, C1} = 64 Tasks) ---',
    '  - Ambiguous Probes (16): recent_relevant="1" (8) vs recent_relevant="2" (8), expected="UNRESOLVED"',
    '  - Unambiguous Probes (16): (expected="1",recent="1"): 4, (expected="1",recent="2"): 4, (expected="2",recent="1"): 4, (expected="2",recent="2"): 4',
    '  - Domains: warehouse-queries (8), pottery-notices (8), api-rate-limit (8), release-checklist (8)',
    '',
    '--- Experiment B: Original TC5 2-Story 24-Turn Closed-Loop under SYSTEM_C1 (24 Tasks) ---',
    '  - Stories: pottery-notices (12 turns) + warehouse-queries (12 turns)',
    '  - Turn Breakdown: birth (6), clear-return (8), continue (2), ambiguous (4: t6, t10), clarified-return (4: t7, t11)',
    '================================================================================'
  ];

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
    console.log(formatDryRunReport(manifest, selectedTasks, config));
    return { dryRun: true, manifest, selectedTasks };
  }

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

  const closedLoopHistories = new Map();
  const gradedRecords = [];

  for (const baseTask of selectedTasks) {
    const task = { ...baseTask };

    if (task.exp === 'B') {
      const prior = closedLoopHistories.get(task.story) ?? [];
      const currentMsg = {
        source_id: `u${task.turn}`,
        role: 'user',
        content: task.user_text
      };
      const convMessages = [...prior, currentMsg];
      task.conversation_messages = convMessages;
      task.source_ids = convMessages.map(m => m.source_id);
      task.current_source_id = currentMsg.source_id;
    }

    const rawArtifact = await invokeChatCompletion({
      config,
      task,
      rawDir
    });

    const rawContent = rawArtifact.raw_response.content;
    const rawReasoning = rawArtifact.raw_response.reasoning_content;

    let grade;
    if (task.exp === 'A') {
      const probe = PROBE_MAP[task.probe_id];
      grade = gradeProbe(rawContent, probe);
    } else {
      const oracleTurn = ORACLE.find(o => o.story === task.story && o.turn === task.turn);
      grade = gradeStoryTurn(rawContent, oracleTurn);
      const prior = closedLoopHistories.get(task.story) ?? [];
      closedLoopHistories.set(task.story, [
        ...prior,
        {
          source_id: `u${task.turn}`,
          role: 'user',
          content: task.user_text
        },
        {
          source_id: `a${task.turn}`,
          role: 'assistant',
          content: rawContent,
          reasoning_content: rawReasoning
        }
      ]);
    }

    const record = {
      ordinal: task.ordinal,
      task_id: task.task_id,
      exp: task.exp,
      contract: task.contract,
      ...(task.exp === 'A'
        ? {
            probe_id: task.probe_id,
            domain: task.domain,
            kind: task.kind,
            expected: task.expected,
            recent_relevant: task.recent_relevant
          }
        : {
            story: task.story,
            turn: task.turn,
            kind: task.kind,
            category: task.category,
            expected: task.expected
          }),
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
      `[${String(task.ordinal).padStart(2, '0')}/88] ${task.task_id} -> observed=${grade.observed} (expected=${grade.expected}, pass=${grade.pass}, ${Math.round(rawArtifact.latency_ms)}ms, retries=${rawArtifact.transport_retries})`
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
      history_transmission_mode: config.history_transmission_mode,
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
    console.error(`[TC5-B Error] ${err.message}`);
    process.exitCode = 1;
  }
}
