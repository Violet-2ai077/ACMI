import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash } from '../protocol/contracts.mjs'
import { freezeDevelopment } from '../gate2/freeze-development.mjs'
import { verifyFreezeBundle } from '../gate2/freeze.mjs'
import { buildDevelopmentCorpus } from '../gate2/development-corpus.mjs'
import { developmentPrompts } from '../gate2/prompts.mjs'
import { inspectDsh } from '../gate2/dsh-inspect.mjs'
import { REVISION_LIVE_AUTHORIZATION, REVISION_BASELINE, REVISION_LIVE_ROOT, checkRevisionExecution } from '../gate2/revision-policy.mjs'

const studyPaths = ['public/corpus.json','oracle/corpus.json','plan/schedule.json','prompts/a.txt','prompts/b.txt','prompts/c0.txt','prompts/d.txt']
export function unchangedStudyMaterials(reference, candidate) {
  return studyPaths.map(path => {
    const a = reference.filter(x => x.path === path), b = candidate.filter(x => x.path === path)
    if (a.length !== 1 || b.length !== 1 || a[0].sha256 !== b[0].sha256) throw new Error('study materials changed')
    return { path, sha256: a[0].sha256, unchanged: true }
  })
}

export function buildRevisionRuntime(previous) {
  const runtime = structuredClone(previous)
  runtime.protocol_revision = { version: 'gate2-protocol-revision-v1', diagnostic_policy: 'D-180-LOCAL-v1', inline_profile: 'B-inline-v1-ws1', owner_authorization: REVISION_LIVE_AUTHORIZATION }
  runtime.execution_amendment = { version: 'gate2-revision-live-v1', owner_authorization: REVISION_LIVE_AUTHORIZATION,
    batch_id: 'live-20261115-r4', run_id: 'development', scheduled_calls: 576, retries: 0, resend: false,
    prior_revision_manifest_sha256: REVISION_BASELINE, previous_execution_amendment: runtime.execution_amendment,
    prompt_or_oracle_or_schedule_changes: false, timeout_changes: false, prior_development_outputs_observed: true }
  return runtime
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--freeze') throw new Error('explicit --freeze required')
  if (existsSync(REVISION_LIVE_ROOT)) throw new Error('fresh batch root required')
  const base = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2'
  const previousManifest = join(base, 'live-20261115-r3/development-r3/manifest.json')
  verifyFreezeBundle({ manifestPath: previousManifest, expectedManifestHash: REVISION_BASELINE, checkCorpus: true })
  const previous = JSON.parse(readFileSync(previousManifest, 'utf8'))
  const runtime = buildRevisionRuntime(JSON.parse(readFileSync(join(dirname(previousManifest), 'runtime/config.json'), 'utf8')))
  if (runtime.node_version !== process.version) throw new Error('runtime version changed')
  checkRevisionExecution(runtime, { root: REVISION_LIVE_ROOT, runId: 'development', scheduledCalls: 576 })
  const route = inspectDsh({ packageJson: 'C:/Users/SiChuchen/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json', profilePatch: 'C:/Users/SiChuchen/.dsh/profiles/web/cordis.patch.yml', credentialsFile: 'C:/Users/SiChuchen/.dsh/.credentials.yaml' })
  if (route.binding_sha256 !== runtime.route_provenance.binding_sha256 || route.credential_ref !== runtime.route.credential_ref) throw new Error('DSH route binding changed')
  const data = buildDevelopmentCorpus(readFileSync(new URL('../gate2/development-scenarios.md', import.meta.url), 'utf8'))
  const generated = [['public/corpus.json', data.publicCorpus], ['oracle/corpus.json', data.oracleCorpus], ['plan/schedule.json', data.planManifest]]
    .map(([path, value]) => ({ path, sha256: hash(JSON.stringify(value, null, 2) + '\n') }))
  for (const [arm, prompt] of Object.entries(developmentPrompts())) generated.push({ path: `prompts/${arm.toLowerCase()}.txt`, sha256: hash(prompt) })
  unchangedStudyMaterials(previous.files, generated)
  const acceptancePath = join(base, 'revision-live-r4-preflight/acceptance.log'), acceptance = readFileSync(acceptancePath, 'utf8')
  if (!/\btests 174\b/.test(acceptance) || !/\bpass 174\b/.test(acceptance) || !/\bfail 0\b/.test(acceptance) || !/\bskipped 0\b/.test(acceptance)) throw new Error('launch regression evidence missing')
  const protectedPath = join(base, 'revision-offline-20261115-051046/protected-before.json')
  const protectedFiles = JSON.parse(readFileSync(protectedPath, 'utf8'))
  for (const f of protectedFiles) if (hash(readFileSync(f.path)).toUpperCase() !== f.sha256) throw new Error('protected evidence changed')
  runtime.execution_amendment.launch_regression = { path: acceptancePath, sha256: hash(readFileSync(acceptancePath)), tests_passed: 174 }
  runtime.execution_amendment.protected_baseline = { path: protectedPath, sha256: hash(readFileSync(protectedPath)), files: protectedFiles.length }
  const bundle = freezeDevelopment({ root: REVISION_LIVE_ROOT, packageId: 'development-r4', runtime })
  const current = JSON.parse(readFileSync(bundle.manifestPath, 'utf8'))
  const materials = unchangedStudyMaterials(previous.files, current.files)
  const write = (name, value) => writeFileSync(join(REVISION_LIVE_ROOT, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', flush: true })
  write('unchanged-study-materials.json', materials)
  write('historical-integrity-before.json', { verified: protectedFiles.length, changed: 0, baseline: protectedPath })
  const result = { manifest_path: bundle.manifestPath, manifest_sha256: bundle.expectedManifestHash, pin_path: bundle.pinPath,
    root: REVISION_LIVE_ROOT, run_id: 'development', scheduled_calls: 576, study_materials_unchanged: materials.length,
    authorization: REVISION_LIVE_AUTHORIZATION, frozen_before_new_outputs: true, prior_dev_outputs_observed: true }
  write('freeze-result.json', result)
  process.stdout.write(JSON.stringify(result) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch { process.stderr.write('R4 freeze failed closed; no model request made. Inspect preserved evidence.\n'); process.exitCode = 1 }
}
