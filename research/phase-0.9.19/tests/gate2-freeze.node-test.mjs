import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, linkSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hash, VERSION } from '../protocol/contracts.mjs'
import { CATEGORIES } from '../gate2/plan.mjs'
import { verifyFreezeBundle, readVerifiedPublicInputs } from '../gate2/freeze.mjs'
import { makeCorpusFixture, makeSupportedCorpusFixture } from './support/corpus-fixture.mjs'

const root = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2')
mkdirSync(root, { recursive: true })
const evidence = mkdtempSync(join(root, 'freeze-tests-'))
console.log('FREEZE_EVIDENCE ' + evidence)
function fixture() {
  const dir = mkdtempSync(join(evidence, 'package-'))
  const plan = { split: 'dev', seed: 'frozen-seed', families: CATEGORIES.map((category, i) => ({
    id: `f${i}`, category, recovery: ['none', 'same-session', 'handoff'][i % 3],
    turns: Array.from({ length: 8 }, (_, j) => ({ id: `t${j + 1}`, difficulty: j < 2 ? 'simple' : j < 4 ? 'medium' : 'hard' })), probes: ['t2', 't8']
  })) }
  const files = []
  function add(path, role, value) {
    const raw = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), raw)
    const entry = { path, role, bytes: raw.length, sha256: hash(raw) }; files.push(entry); return entry
  }
  add('public/input.json', 'public', { engineering_test: true, text: 'original\r\n😀' })
  add('oracle/labels.json', 'oracle', { engineering_test: true, canary: 'ORACLE_ONLY_CANARY' })
  add('prompts/test.txt', 'prompt', 'TEST ONLY; not a research prompt')
  add('plan/schedule.json', 'plan', plan)
  add('runtime/config.json', 'runtime', { model_snapshot: 'synthetic-test-model' })
  add('evaluator/test.mjs', 'evaluator', 'throw new Error("MUST_NOT_EXECUTE")')
  const review = { version: 'gate2-review-binding-v1', author: 'synthetic-author', reviewer: 'synthetic-reviewer', decision: 'approved',
    reviewed: files.filter(f => ['public', 'oracle', 'plan'].includes(f.role)).map(({ path, sha256 }) => ({ path, sha256 })) }
  add('reviews/record.json', 'review', review)
  const manifest = { version: 'gate2-freeze-v1', split: 'dev', purpose: 'synthetic-test', generator_version: 'test-only-v1', protocol_version: VERSION, model_snapshot: 'synthetic-test-model', files }
  const manifestPath = join(dir, 'manifest.json')
  function pin() { const raw = JSON.stringify(manifest); writeFileSync(manifestPath, raw); return { manifestPath, expectedManifestHash: hash(raw) } }
  function rewrite(path, value) {
    const raw = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)); writeFileSync(join(dir, path), raw)
    Object.assign(files.find(f => f.path === path), { bytes: raw.length, sha256: hash(raw) })
  }
  return { dir, manifest, review, plan, pin, rewrite, add, options: pin() }
}

function delegatedFixture() {
  const f = fixture()
  f.manifest.version = 'gate2-freeze-v2'
  const a = f.add('authorizations/owner.json', 'authorization', {
    version: 'gate2-owner-authorization-v1', authorization_ref: 'synthetic-delegation',
    source: 'synthetic-owner-direction', scope: 'development-ground-truth',
    reviewer: 'synthetic-assistant', authority: 'owner-delegated-model-review', output_scoring: 'deterministic-only'
  })
  Object.assign(f.review, { version: 'gate2-review-binding-v2', mode: 'owner-delegated-model-review',
    author: 'synthetic-assistant', reviewer: 'synthetic-assistant', authorization: { path: a.path, sha256: a.sha256 } })
  f.rewrite('reviews/record.json', f.review)
  return f
}

test('Gate 2 explicit delegated review admits self-review without claiming human independence', () => {
  const f = delegatedFixture(), r = verifyFreezeBundle(f.pin())
  assert.equal(r.review_mode, 'owner-delegated-model-review')
  assert.equal(r.authorization_binding_verified, true)
  assert.equal(r.owner_authorization_authenticity_verified, false)
  assert.equal(r.review_independence_verified, false)
  assert.equal(r.human_authenticity_verified, false)
  assert.equal(r.live_execution_ready, false)
  assert.equal(readVerifiedPublicInputs(r).some(x => x.path.startsWith('authorizations/')), false)
})

test('Gate 2 delegated review cannot bypass exact authority, scope, scoring or corpus bindings', () => {
  for (const mutate of [
    f => { f.review.authorization.sha256 = '0'.repeat(64); f.rewrite('reviews/record.json', f.review) },
    f => { f.manifest.files = f.manifest.files.filter(x => x.role !== 'authorization') },
    f => { f.manifest.version = 'gate2-freeze-v1' },
    f => { f.review.mode = 'independent-human'; f.rewrite('reviews/record.json', f.review) },
    f => { f.review.reviewed.pop(); f.rewrite('reviews/record.json', f.review) },
    f => { const a = JSON.parse(readFileSync(join(f.dir, 'authorizations/owner.json'))); a.output_scoring = 'llm-judge'; f.rewrite('authorizations/owner.json', a); f.review.authorization.sha256 = f.manifest.files.at(-1).sha256; f.rewrite('reviews/record.json', f.review) },
    f => { const a = JSON.parse(readFileSync(join(f.dir, 'authorizations/owner.json'))); a.reviewer = 'someone-else'; f.rewrite('authorizations/owner.json', a); f.review.authorization.sha256 = f.manifest.files.at(-1).sha256; f.rewrite('reviews/record.json', f.review) }
  ]) {
    const f = delegatedFixture(); mutate(f)
    assert.throws(() => verifyFreezeBundle(f.pin()), /role|review|authorization|manifest/)
  }
})

test('Gate 2 freeze verifies actual bytes and review binding without claiming research readiness', () => {
  const f = fixture(), r = verifyFreezeBundle(f.options)
  assert.equal(r.artifact_hashes_verified, true)
  assert.equal(r.review_binding_verified, true)
  assert.equal(r.physical_partition_verified, true)
  assert.equal(r.semantic_isolation_verified, false)
  assert.equal(r.human_authenticity_verified, false)
  assert.equal(r.live_execution_ready, false)
  assert.equal(r.purpose, 'synthetic-test')
  assert.equal(r.planned_calls, 576)
  assert.equal(r.manifest_hash, f.options.expectedManifestHash)
  assert.equal(JSON.stringify(r).includes('ORACLE_ONLY_CANARY'), false)
  assert.equal(JSON.stringify(r), JSON.stringify(verifyFreezeBundle(f.options)))
})

test('Gate 2 verified public export returns pinned copies, never oracle or later disk contents', () => {
  const f = fixture(), r = verifyFreezeBundle(f.options)
  const original = readFileSync(join(f.dir, 'public/input.json'))
  writeFileSync(join(f.dir, 'public/input.json'), 'post-verification mutation')
  const first = readVerifiedPublicInputs(r)
  assert.equal(first.length, 1)
  assert.deepEqual(first[0].bytes, original)
  assert.equal(first[0].sha256, hash(original))
  first[0].bytes.fill(0)
  assert.deepEqual(readVerifiedPublicInputs(r)[0].bytes, original)
  assert.throws(() => readVerifiedPublicInputs(JSON.parse(JSON.stringify(r))), /verification handle/)
})

test('Gate 2 stale manifest pin and changed artifact bytes fail before exporting data', () => {
  const f = fixture()
  assert.throws(() => verifyFreezeBundle({ ...f.options, expectedManifestHash: 'b'.repeat(64) }), /manifest digest/)
  assert.throws(() => verifyFreezeBundle({ manifestPath: f.options.manifestPath }), /expected manifest/)
  writeFileSync(join(f.dir, 'oracle/labels.json'), 'changed bytes')
  assert.throws(() => verifyFreezeBundle(f.options), /artifact bytes|artifact digest/)
})

test('Gate 2 review must bind the exact current corpus and probes, not an older approved version', () => {
  const f = fixture()
  f.rewrite('public/input.json', { changed: true }); assert.throws(() => verifyFreezeBundle(f.pin()), /review binding/)
  const g = fixture(); g.review.reviewer = g.review.author; g.rewrite('reviews/record.json', g.review)
  assert.throws(() => verifyFreezeBundle(g.pin()), /review identity/)
  const h = fixture(); h.review.reviewed.pop(); h.rewrite('reviews/record.json', h.review)
  assert.throws(() => verifyFreezeBundle(h.pin()), /review binding/)
  const k = fixture(); k.review.decision = 'pending'; k.rewrite('reviews/record.json', k.review)
  assert.throws(() => verifyFreezeBundle(k.pin()), /review decision/)
})

test('Gate 2 manifest rejects missing roles, validation splits, duplicate paths and physical role confusion', () => {
  for (const mutate of [f => { f.manifest.files = f.manifest.files.filter(x => x.role !== 'oracle') },
    f => { f.manifest.split = 'validation' }, f => { f.manifest.files.push(f.manifest.files[0]) },
    f => { f.manifest.files[0].role = 'oracle' }, f => { f.manifest.files[0].path = '../outside.json' },
    f => { f.manifest.files[0].path = 'public/input.json:stream' }, f => { f.manifest.files[0].path = 'public/con.json' }]) {
    const f = fixture(); mutate(f); assert.throws(() => verifyFreezeBundle(f.pin()), /manifest|path|partition|role/)
  }
})

test('Gate 2 rejects symlink and hardlink aliases rather than treating them as isolated files', () => {
  const f = fixture(), link = join(f.dir, 'public', 'linked')
  symlinkSync(join(f.dir, 'oracle'), link, 'junction')
  f.manifest.files[0].path = 'public/linked/labels.json'
  assert.throws(() => verifyFreezeBundle(f.pin()), /linked/)
  const g = fixture(); linkSync(join(g.dir, 'public/input.json'), join(g.dir, 'public/alias.json'))
  assert.throws(() => verifyFreezeBundle(g.options), /linked/)
})

test('Gate 2 runtime model, schedule and strict JSON are checked without executing artifacts', () => {
  const f = fixture(); f.rewrite('runtime/config.json', { model_snapshot: 'different' })
  assert.throws(() => verifyFreezeBundle(f.pin()), /model/)
  const g = fixture(); g.plan.families.pop(); g.rewrite('plan/schedule.json', g.plan)
  assert.throws(() => verifyFreezeBundle(g.pin()), /manifest/)
  const h = fixture(); h.rewrite('runtime/config.json', '{"model_snapshot":"bad","model_snapshot":"synthetic-test-model"}')
  assert.throws(() => verifyFreezeBundle(h.pin()), /duplicate JSON/)
})

test('Gate 2 read-only freeze CLI requires an external pin and rejects live flags', () => {
  const f = fixture(), cli = fileURLToPath(new URL('../gate2/cli.mjs', import.meta.url))
  const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  const ok = run(['verify-freeze', f.options.manifestPath, f.options.expectedManifestHash])
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(JSON.parse(ok.stdout).artifact_hashes_verified, true)
  assert.equal(run(['verify-freeze', f.options.manifestPath]).status, 1)
  assert.equal(run(['verify-freeze', f.options.manifestPath, f.options.expectedManifestHash, '--live']).status, 1)
})

test('Gate 2 external digest accepts standard uppercase SHA-256 output without weakening the pin', () => {
  const f = fixture(), r = verifyFreezeBundle({ ...f.options, expectedManifestHash: f.options.expectedManifestHash.toUpperCase() })
  assert.equal(r.manifest_hash, f.options.expectedManifestHash)
})

test('Gate 2 rejects duplicate keys in public JSON even when its bytes and review hashes agree', () => {
  const f = fixture(); f.rewrite('public/input.json', '{"text":"first","text":"second"}')
  f.review.reviewed = f.manifest.files.filter(x => ['public', 'oracle', 'plan'].includes(x.role)).map(({ path, sha256 }) => ({ path, sha256 }))
  f.rewrite('reviews/record.json', f.review)
  assert.throws(() => verifyFreezeBundle(f.pin()), /duplicate JSON/)
})

test('Gate 2 package byte limits, outside roots and public-oracle copies fail before export', () => {
  const f = fixture(); f.manifest.files[0].bytes = 4_194_305
  assert.throws(() => verifyFreezeBundle(f.pin()), /manifest artifact|byte limit/)
  assert.throws(() => verifyFreezeBundle({ manifestPath: resolve(root, '../gate-1/manifest.json'), expectedManifestHash: 'a'.repeat(64) }), /outside Gate 2/)
  const g = fixture(); g.rewrite('public/input.json', readFileSync(join(g.dir, 'oracle/labels.json'), 'utf8'))
  assert.throws(() => verifyFreezeBundle(g.pin()), /partition/)
})

test('Gate 2 frozen corpus preflight consumes only pinned bytes and exposes missing state support', () => {
  const f = fixture(), c = makeCorpusFixture()
  f.rewrite('public/input.json', c.publicCorpus); f.rewrite('oracle/labels.json', c.oracleCorpus); f.rewrite('plan/schedule.json', c.planManifest)
  f.review.reviewed = f.manifest.files.filter(x => ['public', 'oracle', 'plan'].includes(x.role)).map(({ path, sha256 }) => ({ path, sha256 }))
  f.rewrite('reviews/record.json', f.review)
  const options = f.pin(), r = verifyFreezeBundle({ ...options, checkCorpus: true })
  assert.equal(r.artifact_hashes_verified, true)
  assert.equal(r.corpus_structure_verified, true)
  assert.equal(r.corpus_preflight_passed, false)
  assert.equal(r.corpus_report.missing_coverage.length, 36)
  assert.equal(JSON.stringify(r).includes('Repair gateway'), false)
  assert.equal(readVerifiedPublicInputs(r).length, 1)
  const cli = fileURLToPath(new URL('../gate2/cli.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [cli, 'verify-corpus', options.manifestPath, options.expectedManifestHash], { encoding: 'utf8' })
  assert.equal(result.status, 2, result.stderr)
  assert.equal(JSON.parse(result.stdout).corpus_report.structural_valid, true)
  f.rewrite('oracle/labels.json', { changed_after_pin: true })
  assert.throws(() => verifyFreezeBundle({ ...options, checkCorpus: true }), /artifact bytes|artifact digest/)
})

test('Gate 2 incomplete corpus wrappers cannot borrow integrity success as corpus success', () => {
  const f = fixture(), r = verifyFreezeBundle({ ...f.options, checkCorpus: true })
  assert.equal(r.artifact_hashes_verified, true)
  assert.equal(r.corpus_structure_verified, false)
  assert.equal(r.corpus_preflight_passed, false)
})

test('Gate 2 corpus CLI can pass mechanical checks while leaving semantic and live gates closed', () => {
  const f = fixture(), c = makeSupportedCorpusFixture()
  f.rewrite('public/input.json', c.publicCorpus); f.rewrite('oracle/labels.json', c.oracleCorpus); f.rewrite('plan/schedule.json', c.planManifest)
  f.review.reviewed = f.manifest.files.filter(x => ['public', 'oracle', 'plan'].includes(x.role)).map(({ path, sha256 }) => ({ path, sha256 }))
  f.rewrite('reviews/record.json', f.review)
  const options = f.pin(), cli = fileURLToPath(new URL('../gate2/cli.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [cli, 'verify-corpus', options.manifestPath, options.expectedManifestHash], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const result = JSON.parse(r.stdout)
  assert.equal(result.corpus_preflight_passed, true)
  assert.equal(result.corpus_report.semantic_truth_verified, false)
  assert.equal(result.live_execution_ready, false)
  assert.equal(result.corpus_completeness_verified, false)
})
