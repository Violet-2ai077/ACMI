import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configs, runScenario } from './prototype-engine.mjs';
import { evaluatedScenarios } from './prototype-fixtures.mjs';

const evaluatedSplits = ['development', 'validation'];
const isExisting = (routing) => ['continue', 'switch'].includes(routing);
const isCommitment = (routing) => ['continue', 'switch', 'create'].includes(routing);
const ratio = (n, d) => ({ n, d, rate: d ? n / d : null });
const sameProposal = (expected, actual) => (!expected && !actual) ||
  Boolean(expected && actual && expected.kind === actual.kind && expected.taskId === actual.taskId);

export function scoreRows(rows) {
  const matches = (predicate) => rows.filter(({ expected, observed }) => predicate(expected, observed)).length;
  const routeCorrect = (expected, observed) => expected.routing === observed.routing && expected.taskId === observed.taskId;
  const positive = matches((e) => e.needsAnalysis);
  const analyzed = matches((_, o) => o.analyzed);
  const covered = matches((_, o) => isCommitment(o.routing));
  const existing = matches((e) => isExisting(e.routing));
  const available = matches((e) => isCommitment(e.routing));
  const abstained = matches((_, o) => o.routing === 'uncertain');
  const expectedUncertain = matches((e) => e.routing === 'uncertain');
  const expectedNoTask = matches((e) => e.routing === 'no_task');
  const proposed = matches((_, o) => o.proposal !== null);
  const expectedProposal = matches((e) => e.proposal !== null);
  const checks = matches((e) => Boolean(e.stateCheck));
  const supported = matches((e, o) => Boolean(e.stateCheck && o.state.lastSeq !== null));
  const hidden = matches((e) => Boolean(e.unavailableTaskId));
  const nonReplay = rows.filter(({ observed }) => !observed.state.replay);
  return {
    turns: rows.length,
    trigger: {
      recall: ratio(matches((e, o) => e.needsAnalysis && o.analyzed), positive),
      precision: ratio(matches((e, o) => e.needsAnalysis && o.analyzed), analyzed),
      analysisRate: ratio(analyzed, rows.length),
    },
    routing: {
      exactRouteAndTask: ratio(matches(routeCorrect), rows.length),
      turnActExact: ratio(matches((e, o) => e.turnAct === o.turnAct), rows.length),
      workIntentExact: ratio(matches((e, o) => e.intent === o.workIntent), rows.length),
      commitmentCoverage: ratio(covered, rows.length),
      correctAmongCommitments: ratio(matches((e, o) => isCommitment(o.routing) && routeCorrect(e, o)), covered),
      resolvableCommitmentRecall: ratio(matches((e, o) => isCommitment(e.routing) && routeCorrect(e, o)), available),
      abstentionRate: ratio(abstained, rows.length),
      abstentionPrecision: ratio(matches((e, o) => e.routing === 'uncertain' && o.routing === 'uncertain'), abstained),
      abstentionRecall: ratio(matches((e, o) => e.routing === 'uncertain' && o.routing === 'uncertain'), expectedUncertain),
      abstainedOnResolvable: matches((e, o) => isCommitment(e.routing) && o.routing === 'uncertain'),
      noTaskRecall: ratio(matches((e, o) => e.routing === 'no_task' && o.routing === 'no_task'), expectedNoTask),
      falseMerge: matches((e, o) => o.taskId !== null && e.taskId !== o.taskId),
      falseSplit: ratio(matches((e, o) => isExisting(e.routing) && !isExisting(o.routing)), existing),
      unavailableTargetSafeAbstention: ratio(matches((e, o) => e.unavailableTaskId && o.routing === 'uncertain'), hidden),
    },
    state: {
      checks, supported,
      passed: matches((e, o) => Boolean(e.stateCheck && o.state.lastSeq === e.stateCheck.lastSeq &&
        o.state.invalidations.includes(e.stateCheck.invalidation))),
      checksUnsupported: checks - supported,
      bindingPreserved: ratio(nonReplay.filter(({ input, observed }) => input.binding === observed.state.binding).length, nonReplay.length),
    },
    proposals: {
      proposed, expected: expectedProposal,
      kindAndTaskPrecision: ratio(matches((e, o) => o.proposal && sameProposal(e.proposal, o.proposal)), proposed),
      kindAndTaskRecall: ratio(matches((e, o) => e.proposal && sameProposal(e.proposal, o.proposal)), expectedProposal),
      rejectedByGuard: matches((_, o) => o.guard.disposition === 'rejected'),
      correctlyRejectedWrong: matches((e, o) => o.guard.disposition === 'rejected' && !sameProposal(e.proposal, o.proposal)),
      wrongPastGuard: matches((e, o) => o.guard.disposition === 'host_review_only' && !sameProposal(e.proposal, o.proposal)),
      executions: matches((_, o) => o.guard.executed),
    },
    work: Object.fromEntries(['triggerChars', 'analysisChars', 'candidateComparisons', 'stages'].map((key) => [key,
      rows.reduce((sum, { observed }) => sum + observed.cost[key], 0),
    ])),
  };
}

function timing(config, scenarios) {
  const batch = () => { for (const { events } of scenarios) runScenario({ events }, config); };
  for (let i = 0; i < 8; i++) batch();
  const turns = scenarios.reduce((sum, { events }) => sum + events.length, 0);
  const samples = Array.from({ length: 64 }, () => {
    const start = performance.now();
    batch();
    return (performance.now() - start) / turns;
  }).sort((a, b) => a - b);
  const quantile = (q) => Number(samples[Math.ceil(q * samples.length) - 1].toFixed(6));
  return { warmups: 8, batches: samples.length, turnsPerBatch: turns, p50MsPerTurn: quantile(0.5), p95MsPerTurn: quantile(0.95) };
}

function fraction(value) {
  return value.d ? `${value.n}/${value.d}` : 'n/a';
}

const comparison = (configurations) => [
  '# Offline prototype comparison',
  '',
  'New synthetic, AI-provisional development and validation fixtures only. No historical or reserved holdout scored. Zero Provider requests.',
  'The flat reference is newly written, not the historical Phase 0.9.1 classifier. Full per-turn decisions and denominators are in `results.json`.',
  '',
  ...evaluatedSplits.flatMap((split) => [
    `## ${split}`,
    '',
    '| Configuration | Route + ID | Covered | Resolvable recall | Abstain | Merge | Split | Trigger recall | Proposal P/R | Guard rejected/wrong past | Candidates | Local p50/p95 ms/turn |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(configurations).map(([name, result]) => {
      const { routing: r, trigger: t, proposals: p, work, timing: local } = result.splits[split];
      return `| ${name} | ${fraction(r.exactRouteAndTask)} | ${fraction(r.commitmentCoverage)} | ${fraction(r.resolvableCommitmentRecall)} | ${fraction(r.abstentionRate)} | ${r.falseMerge} | ${fraction(r.falseSplit)} | ${fraction(t.recall)} | ${fraction(p.kindAndTaskPrecision)}; ${fraction(p.kindAndTaskRecall)} | ${p.rejectedByGuard}/${p.wrongPastGuard} | ${work.candidateComparisons} | ${local.p50MsPerTurn}/${local.p95MsPerTurn} |`;
    }),
    '',
  ]),
  'Guard rejections are counted independently and never repaired into correct semantic decisions. `host_review_only` means inspectable, not semantically correct or executable.',
  'Here false merges are wrong existing IDs including out-of-scope decisions; false splits are existing-target turns incorrectly emitted as create, no-task or uncertain. These are turn-level proxies, not cluster rates.',
  '',
].join('\n');

const limitations = [
  '# Prototype limitations',
  '',
  '- Small constructed exercise suites with AI-provisional expected outcomes, not representative prevalence, qualification evidence, human gold, or real-model performance.',
  '- The observation adapter is assumed trustworthy. Typed facts, graph/candidate revisions and host binding snapshots are pre-supplied. Candidate retrieval is only ranking inside the supplied window, not retrieval recall over a real task store.',
  '- The bounded lexical policy intentionally leaves negation, contrast, weak cues and indirect references unresolved or wrong. Manual lexical masking handles common quoted commands, not arbitrary language or malicious payloads.',
  '- Recent identity pointers are speculative derived state. They are workspace/session-local and checked against the current revision and candidate window; no durable memory, provenance graph, replay recovery, or cross-session coreference is implemented.',
  '- The test compares local deterministic work proxies and warmed batch wall-clock durations normalized by turns. Neither estimates Provider calls, tokens, remote latency or throughput. No graph, binding, result acceptance, join or lifecycle operation is executed.',
  '- Proposal precision/recall measures kind and task ID only; objective text quality is not evaluated. The guard cannot validate pragmatic intent or independently authenticate host input.',
  '',
].join('\n');

export async function runPrototype(outputDirectory) {
  const scenarios = evaluatedScenarios;
  if (scenarios.some(({ split }) => !evaluatedSplits.includes(split))) throw new Error('Only development and validation may be evaluated');
  await mkdir(outputDirectory);
  const scenariosJson = JSON.stringify({ schemaVersion: 'acmi-prototype-scenarios-v1',
    dataUse: 'development_and_validation_only', humanReviewStatus: 'pending', scenarios }, null, 2) + '\n';
  const results = {
    schemaVersion: 'acmi-prototype-results-v1', providerRequests: 0, historicalHoldoutScored: false,
    reservedHoldoutScored: false, humanReviewStatus: 'pending',
    scenariosSha256: createHash('sha256').update(scenariosJson).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configurations: {},
  };
  for (const [config, options] of Object.entries(configs)) {
    const traces = Object.fromEntries(scenarios.map(({ id, events }) => [id, runScenario({ events }, config)]));
    const splits = Object.fromEntries(evaluatedSplits.map((split) => {
      const selected = scenarios.filter((scenario) => scenario.split === split);
      const rows = selected.flatMap(({ id, events, expected }) => traces[id].map((observed, index) => ({
        input: events[index], expected: expected[index], observed,
      })));
      return [split, { scenarios: selected.length, ...scoreRows(rows), timing: timing(config, selected) }];
    }));
    results.configurations[config] = { options, splits, traces };
  }
  await writeFile(join(outputDirectory, 'scenarios.json'), scenariosJson, 'utf8');
  await writeFile(join(outputDirectory, 'results.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');
  await writeFile(join(outputDirectory, 'comparison.md'), comparison(results.configurations), 'utf8');
  await writeFile(join(outputDirectory, 'limitations.md'), limitations, 'utf8');
  return results;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/phase-0.9.2/prototype.mjs <output-directory>');
    process.exitCode = 1;
  } else {
    await runPrototype(resolve(process.argv[2]));
  }
}
