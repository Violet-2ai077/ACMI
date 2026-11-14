import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hash, VERSION } from '../protocol/contracts.mjs'
import { buildDevelopmentCorpus, NARRATIVE_SHA256 } from './development-corpus.mjs'
import { developmentPrompts } from './prompts.mjs'
import { validateCorpus } from './corpus.mjs'
import { verifyFreezeBundle, verifiedDependencyDigests } from './freeze.mjs'
import { GATE2_EVIDENCE_ROOT } from './run-ledger.mjs'

const sourceRoot=resolve(fileURLToPath(new URL('..',import.meta.url)))
export function dependencyPaths() {
  return ['protocol/contracts.mjs','protocol/wire.mjs','context/build.mjs','evaluator/read-raw.mjs','evaluator/score.mjs',
    'execution/live.mjs','execution/report.mjs','execution/freeze-r4.mjs',
    ...readdirSync(join(sourceRoot,'tests')).filter(n=>/^gate2-.*(?:revision|censored-ledger).*\.node-test\.mjs$/.test(n)).map(n=>'tests/'+n),
    ...readdirSync(join(sourceRoot,'gate2')).filter(n=>n.endsWith('.mjs')).map(n=>'gate2/'+n)].sort()
}
export function verifyFrozenSources(report) {
  const entries=verifiedDependencyDigests(report).filter(f=>f.path.endsWith('.mjs'))
  const expected=dependencyPaths()
  if(JSON.stringify(entries.map(e=>e.path).sort())!==JSON.stringify(expected.map(p=>'evaluator/'+p).sort()))throw new Error('frozen dependency closure mismatch')
  for(const file of expected) if(hash(readFileSync(join(sourceRoot,file)))!==entries.find(e=>e.path==='evaluator/'+file).sha256)throw new Error('executing source differs from freeze')
  return true
}

export function freezeDevelopment({root,packageId,runtime,purpose='development'}) {
  if(!/^[a-z0-9][a-z0-9-]{1,80}$/.test(packageId)||!['development','synthetic-test'].includes(purpose))throw new Error('invalid package identity')
  root=resolve(root);const rel=relative(GATE2_EVIDENCE_ROOT,root)
  if(rel.startsWith('..')||isAbsolute(rel))throw new Error('outside Gate 2 evidence root')
  for(let p=root;;p=dirname(p)){if(lstatSync(p,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('linked package root');if(dirname(p)===p)break}
  if(!runtime||runtime.version!=='gate2-runtime-v1'||typeof runtime.model_snapshot!=='string'||runtime.spending_policy?.mode!=='uncapped')throw new Error('runtime declaration required')
  const narrative=readFileSync(join(sourceRoot,'gate2/development-scenarios.md'),'utf8')
  const data=buildDevelopmentCorpus(narrative), preflight=validateCorpus(data)
  if(!preflight.structural_valid||!preflight.state_opportunity_coverage_complete)throw new Error('development corpus preflight failed')
  const dir=join(root,packageId), files=[]
  mkdirSync(root,{recursive:true});mkdirSync(dir)
  const add=(path,role,value)=>{
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')
    mkdirSync(dirname(join(dir,path)),{recursive:true});writeFileSync(join(dir,path),bytes,{flag:'wx',flush:true})
    const entry={path,role,bytes:bytes.length,sha256:hash(bytes)};files.push(entry);return entry
  }
  add('public/corpus.json','public',data.publicCorpus)
  add('oracle/corpus.json','oracle',data.oracleCorpus)
  add('plan/schedule.json','plan',data.planManifest)
  const prompts=developmentPrompts()
  for(const [arm,prompt]of Object.entries(prompts))add(`prompts/${arm.toLowerCase()}.txt`,'prompt',prompt)
  add('runtime/config.json','runtime',runtime)
  for(const path of dependencyPaths())add('evaluator/'+path,'evaluator',readFileSync(join(sourceRoot,path)))
  if(runtime.protocol_revision)add('evaluator/protocol-revision-approval.md','evaluator',readFileSync(join(sourceRoot,'gate2/protocol-revision-proposal-2026-11-15.md')))
  if(runtime.execution_amendment?.version==='gate2-revision-live-v1')add('evaluator/revision-live-authorization.md','evaluator',readFileSync(join(sourceRoot,'execution/r4-authorization.md')))
  add('evaluator/source-narrative.md','evaluator',narrative)
  add('evaluator/review-audit.json','evaluator',{
    version:'gate2-semantic-review-record-v1',reviewer:'codex-assistant',authority:'owner-delegated-model-review',
    judgment_kind:'author-declared-semantic-review-not-independent-human-certification',decision:'approved',
    narrative_sha256:NARRATIVE_SHA256,conditions:['C1','C2','C3'],condition_turns:144,
    corrections_before_freeze:['unique evidence span for repeated integer-cents/contrast phrases','partially executed aggregate work is running','untouched catalog tasks not activated','initial C3 identity absent, not recovered'],
    boundaries:['C3 birth mapping is not invisible UUID recovery','known task with insufficient completion evidence is not unknown task','full-unit and partial-scope UNRESOLVED are separate','parent acceptance is not inherited from branch completion','reported/planned work is not accepted completion'],
    limitations:['same assistant authored and reviewed','lexical answer predicates are diagnostics, not complete answer semantics','state exact match uses literal evidence refs; alternative equivalent refs may be penalized','one independent story per category; no population-risk claim','SM5 gaps are logical turns, not wall-clock time'],
    cases:data.oracleCorpus.families.flatMap(f=>Object.entries(f.oracle).flatMap(([condition,turns])=>Object.entries(turns).map(([turn_id,g])=>({family_id:f.family_id,condition,turn_id,oracle_sha256:hash(g),decision:'approved',negative_case_count:g.negative_cases.length,has_unresolved:g.decisions.some(d=>d.unresolved!==null)})))),
    structural_preflight:preflight
  })
  const authority=add('authorizations/owner.json','authorization',{version:'gate2-owner-authorization-v1',authorization_ref:'owner-2026-11-14-model-review',
    source:'owner-conversation-2026-11-14',scope:'development-ground-truth',reviewer:'codex-assistant',authority:'owner-delegated-model-review',output_scoring:'deterministic-only'})
  add('reviews/record.json','review',{version:'gate2-review-binding-v3',mode:'owner-delegated-model-review',author:'codex-assistant',reviewer:'codex-assistant',decision:'approved',
    authorization:{path:authority.path,sha256:authority.sha256},reviewed:files.filter(f=>f.role!=='authorization').map(({path,sha256})=>({path,sha256}))})
  const manifest={version:'gate2-freeze-v2',split:'dev',purpose,generator_version:'development-corpus-r1',protocol_version:VERSION,model_snapshot:runtime.model_snapshot,files}
  const raw=JSON.stringify(manifest,null,2)+'\n', manifestPath=join(dir,'manifest.json'), expectedManifestHash=hash(raw)
  writeFileSync(manifestPath,raw,{flag:'wx',flush:true})
  const pinPath=join(root,packageId+'.pin.json')
  writeFileSync(pinPath,JSON.stringify({manifest_path:manifestPath,manifest_sha256:expectedManifestHash,created_at_utc:new Date().toISOString(),created_before_live_model_outputs:true,
    live_output_scope:'this-manifest-revision',prior_revisions_may_have_live_outputs:true,third_party_timestamp_verified:false},null,2)+'\n',{flag:'wx',flush:true})
  const report=verifyFreezeBundle({manifestPath,expectedManifestHash,checkCorpus:true})
  verifyFrozenSources(report)
  return {manifestPath,expectedManifestHash,pinPath,report}
}
