import { lstatSync, readFileSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname, join } from 'node:path'
import { hash, VERSION } from '../protocol/contracts.mjs'
import { createPlan } from './plan.mjs'
import { validateCorpus } from './corpus.mjs'

const ROOT = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2')
const PARTITIONS = { public: 'public', oracle: 'oracle', prompt: 'prompts', plan: 'plan', runtime: 'runtime', evaluator: 'evaluator', review: 'reviews', authorization: 'authorizations' }
const verified = new WeakMap()
const digest = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)
const text = x => typeof x === 'string' && x.trim().length > 0
const keys = (o, names) => o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...names].sort())

function strictJson(raw) {
  let source, value
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); value = JSON.parse(source) } catch { throw new Error('invalid JSON artifact') }
  const stack = []
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g
  for (const match of source.matchAll(tokens)) {
    const token = match[0], top = stack.at(-1)
    if (token === '{' || token === '[') {
      stack.push({ object: token === '{', key: token === '{', keys: new Set() })
      if (stack.length > 48) throw new Error('JSON depth limit')
    } else if (token === '}' || token === ']') stack.pop()
    else if (token === ',') { if (top?.object) top.key = true }
    else if (token[0] === '"' && top?.object && top.key) {
      const key = JSON.parse(token)
      if (top.keys.has(key)) throw new Error('duplicate JSON key')
      top.keys.add(key); top.key = false
    } else if (/^[\d-]/.test(token) && !Number.isFinite(Number(token))) throw new Error('nonfinite JSON number')
  }
  return value
}

function safeRead(path, limit) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('artifact path outside Gate 2')
  for (let p = path; ; p = dirname(p)) {
    if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('linked artifact path')
    if (dirname(p) === p) break
  }
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (!stat || !stat.isFile()) throw new Error('missing or nonregular artifact')
  if (stat.nlink !== 1) throw new Error('hardlinked artifact path')
  if (stat.size < 1 || stat.size > limit) throw new Error('artifact byte limit')
  const bytes = readFileSync(path)
  if (bytes.length < 1 || bytes.length > limit) throw new Error('artifact byte limit')
  return bytes
}

function relativePath(path, role) {
  if (typeof path !== 'string' || path.length > 220 || !Object.hasOwn(PARTITIONS, role)) throw new Error('manifest path/role')
  const parts = path.split('/')
  if (parts.length < 2 || parts[0] !== PARTITIONS[role] || parts.some(p => !/^[a-z0-9][a-z0-9._-]*$/.test(p) || p.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/.test(p))) throw new Error('unsafe artifact path or role partition')
}

export function verifyFreezeBundle({ manifestPath, expectedManifestHash, checkCorpus = false }) {
  if (typeof checkCorpus !== 'boolean') throw new Error('invalid corpus check option')
  if (typeof expectedManifestHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedManifestHash)) throw new Error('expected manifest digest required')
  expectedManifestHash = expectedManifestHash.toLowerCase()
  const path = resolve(manifestPath), base = dirname(path)
  const rawManifest = safeRead(path, 1_048_576)
  if (hash(rawManifest) !== expectedManifestHash) throw new Error('manifest digest mismatch')
  const m = strictJson(rawManifest)
  if (!keys(m, ['version', 'split', 'purpose', 'generator_version', 'protocol_version', 'model_snapshot', 'files']) || !['gate2-freeze-v1', 'gate2-freeze-v2'].includes(m.version) || m.split !== 'dev' || !['synthetic-test', 'development'].includes(m.purpose) || !text(m.generator_version) || m.protocol_version !== VERSION || !text(m.model_snapshot) || !Array.isArray(m.files) || m.files.length > 256) throw new Error('invalid freeze manifest')
  const delegated = m.version === 'gate2-freeze-v2'
  const paths = new Set(), counts = Object.fromEntries(Object.keys(PARTITIONS).map(k => [k, 0]))
  let total = 0
  for (const f of m.files) {
    if (!keys(f, ['path', 'role', 'bytes', 'sha256']) || !Number.isSafeInteger(f.bytes) || f.bytes < 1 || f.bytes > 4_194_304 || !digest(f.sha256)) throw new Error('invalid manifest artifact')
    relativePath(f.path, f.role)
    if (paths.has(f.path)) throw new Error('duplicate manifest path')
    paths.add(f.path); counts[f.role]++; total += f.bytes
  }
  if (total > 33_554_432) throw new Error('package byte limit')
  for (const [role, count] of Object.entries(counts)) {
    const invalid = role === 'authorization' ? count !== (delegated ? 1 : 0) : ['plan', 'runtime', 'review'].includes(role) ? count !== 1 : count < 1
    if (invalid) throw new Error('missing or duplicate manifest role')
  }
  const contents = new Map()
  for (const f of m.files) {
    const bytes = safeRead(join(base, f.path), 4_194_304)
    if (bytes.length !== f.bytes) throw new Error('artifact bytes mismatch')
    if (hash(bytes) !== f.sha256) throw new Error('artifact digest mismatch')
    if (f.path.endsWith('.json')) strictJson(bytes)
    contents.set(f.path, bytes)
  }
  const oracleDigests = new Set(m.files.filter(f => f.role === 'oracle').map(f => f.sha256))
  if (m.files.some(f => f.role === 'public' && oracleDigests.has(f.sha256))) throw new Error('public/oracle identical-content partition')
  const parseRole = role => strictJson(contents.get(m.files.find(f => f.role === role).path))
  const planManifest = parseRole('plan'), plan = createPlan(planManifest)
  const runtime = parseRole('runtime')
  if (!runtime || runtime.model_snapshot !== m.model_snapshot) throw new Error('runtime model mismatch')
  const review = parseRole('review')
  const reviewKeys = ['version', 'author', 'reviewer', 'decision', 'reviewed', ...(delegated ? ['mode', 'authorization'] : [])]
  if (!keys(review, reviewKeys) || !(delegated ? ['gate2-review-binding-v2','gate2-review-binding-v3'].includes(review.version) : review.version === 'gate2-review-binding-v1')) throw new Error('review binding shape')
  if (!text(review.author) || !text(review.reviewer) || (!delegated && review.author.trim().toLowerCase() === review.reviewer.trim().toLowerCase())) throw new Error('review identity declarations')
  if (delegated) {
    const artifact = m.files.find(f => f.role === 'authorization'), a = parseRole('authorization')
    if (review.mode !== 'owner-delegated-model-review' || !keys(review.authorization, ['path', 'sha256']) || review.authorization.path !== artifact.path || review.authorization.sha256 !== artifact.sha256) throw new Error('review authorization binding')
    if (!keys(a, ['version', 'authorization_ref', 'source', 'scope', 'reviewer', 'authority', 'output_scoring']) || a.version !== 'gate2-owner-authorization-v1' || !text(a.authorization_ref) || !text(a.source) || a.scope !== 'development-ground-truth' || a.reviewer !== review.reviewer || a.authority !== review.mode || a.output_scoring !== 'deterministic-only') throw new Error('invalid review authorization')
  }
  if (review.decision !== 'approved') throw new Error('review decision not approved')
  const fullReview = review.version === 'gate2-review-binding-v3'
  const expected = m.files.filter(f => (fullReview ? ['public','oracle','plan','prompt','runtime','evaluator'] : ['public','oracle','plan']).includes(f.role))
  if (!Array.isArray(review.reviewed) || review.reviewed.length !== expected.length || new Set(review.reviewed.map(r => r?.path)).size !== expected.length || review.reviewed.some(r => !keys(r, ['path', 'sha256']) || !expected.some(f => f.path === r.path && f.sha256 === r.sha256))) throw new Error('stale or incomplete review binding')
  const mergeCorpus = (role, version) => {
    const parts = m.files.filter(f => f.role === role).map(f => strictJson(contents.get(f.path)))
    if (!parts.every(p => p?.version === version && p.split === 'dev' && Array.isArray(p.families))) return null
    return { version, split: 'dev', families: parts.flatMap(p => p.families) }
  }
  const corpus = checkCorpus ? validateCorpus({ planManifest,
    publicCorpus: mergeCorpus('public', 'gate2-public-corpus-v1'), oracleCorpus: mergeCorpus('oracle', 'gate2-oracle-corpus-v1') }) : null
  const report = Object.freeze({ version: delegated ? 'gate2-freeze-report-v2' : 'gate2-freeze-report-v1', purpose: m.purpose, split: m.split,
    manifest_hash: expectedManifestHash, artifact_hashes_verified: true, physical_partition_verified: true,
    review_binding_verified: true, human_authenticity_verified: false, semantic_isolation_verified: false,
    review_mode: delegated ? 'owner-delegated-model-review' : 'distinct-reviewers-declared',
    authorization_binding_verified: delegated, owner_authorization_authenticity_verified: false,
    review_independence_verified: false,
    full_package_review_binding_verified: fullReview,
    evaluator_dependency_closure_verified: false, corpus_completeness_verified: false, live_execution_ready: false,
    corpus_structure_verified: corpus?.structural_valid ?? false,
    corpus_preflight_passed: !!(corpus?.structural_valid && corpus.state_opportunity_coverage_complete), corpus_report: corpus,
    planned_calls: plan.counts.total, artifact_count: m.files.length, artifact_bytes: total,
    role_counts: Object.freeze(counts), public_paths: Object.freeze(m.files.filter(f => f.role === 'public').map(f => f.path)) })
  verified.set(report, m.files.map(f => ({ path: f.path, role: f.role, sha256: f.sha256, bytes: contents.get(f.path) })))
  return report
}

export function readVerifiedPublicInputs(report) {
  const inputs = verified.get(report)
  if (!inputs) throw new Error('genuine verification handle required')
  return inputs.filter(f=>f.role==='public').map(({role,...f}) => ({ ...f, bytes: Buffer.from(f.bytes) }))
}

export function readVerifiedExecutionInputs(report) {
  const inputs=verified.get(report)
  if(!inputs)throw new Error('genuine verification handle required')
  return inputs.filter(f=>['public','prompt','runtime','plan'].includes(f.role)).map(f=>({...f,bytes:Buffer.from(f.bytes)}))
}

export function verifiedDependencyDigests(report) {
  const inputs=verified.get(report)
  if(!inputs)throw new Error('genuine verification handle required')
  return inputs.filter(f=>f.role==='evaluator').map(f=>({path:f.path,sha256:f.sha256}))
}
