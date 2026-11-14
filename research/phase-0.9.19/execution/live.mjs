import { readFileSync,writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { openGuardedRun } from '../gate2/send-boundary.mjs'
import { inspectDsh } from '../gate2/dsh-inspect.mjs'
import { verifyFreezeBundle,readVerifiedExecutionInputs } from '../gate2/freeze.mjs'
import { hash } from '../protocol/contracts.mjs'

export function resolveCredential({reference,credentialsFile,parseDocument,read=readFileSync,env=process.env}) {
  try {
    if(typeof reference!=='string'||! /^[A-Z_][A-Z0-9_]*$/.test(reference))throw new Error()
    let managed
    try {
      const doc=parseDocument(read(credentialsFile,'utf8'),{logLevel:'silent',prettyErrors:false,uniqueKeys:true})
      if(doc.errors.length||doc.get('version')!==1)throw new Error()
      managed=doc.getIn(['refs',reference])
      if(managed!==undefined&&(typeof managed!=='string'||!managed.length))throw new Error()
    } catch(e) { if(e.code!=='ENOENT')throw new Error() }
    const value=managed??env[reference]
    if(typeof value!=='string'||!value.length||/[\r\n]/.test(value))throw new Error()
    return value
  } catch { throw new Error('credential resolution failed') }
}

export async function executeSchedule(run,onResult=()=>{}) {
  let censored=false
  for(let c=run.next();c;c=run.next()) {
    const r=await run.execute(c)
    onResult(r)
    if(r.run_disposition!==undefined) {
      if(r.run_disposition!=='continue_next_scheduled_coordinate')return 'halted'
      if(r.settlement_outcome==='diagnostic_censored')censored=true
      else if(r.settlement_outcome!=='success'||r.transport.outcome!=='complete'||!r.transport.evidence_complete)return 'halted'
    } else if(r.transport.outcome!=='complete'||!r.transport.evidence_complete)return 'halted'
  }
  return censored?'completed_with_diagnostic_censoring':'completed'
}

async function main() {
  const [flag,pinPath,root,runId,...extra]=process.argv.slice(2)
  if(flag!=='--execute'||!pinPath||!root||!runId||extra.length)throw new Error('arguments')
  const pin=JSON.parse(readFileSync(pinPath,'utf8'))
  const bundle={manifestPath:pin.manifest_path,expectedManifestHash:pin.manifest_sha256}
  const freeze=verifyFreezeBundle({...bundle,checkCorpus:true})
  const runtime=JSON.parse(readVerifiedExecutionInputs(freeze).find(f=>f.role==='runtime').bytes)
  const paths={packageJson:'C:/Users/SiChuchen/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json',
    profilePatch:'C:/Users/SiChuchen/.dsh/profiles/web/cordis.patch.yml',credentialsFile:'C:/Users/SiChuchen/.dsh/.credentials.yaml'}
  const require=createRequire(paths.packageJson),{parseDocument}=require('yaml')
  const credentialProvider=({reference})=>{
    const current=inspectDsh(paths)
    if(current.binding_sha256!==runtime.route_provenance.binding_sha256||reference!==current.credential_ref)throw new Error('route provenance changed')
    return resolveCredential({reference,credentialsFile:paths.credentialsFile,parseDocument})
  }
  const run=openGuardedRun({bundle,root,runId,mode:'live',credentialProvider})
  const write=(name,value)=>writeFileSync(join(run.path,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',flush:true})
  const source=readFileSync(new URL('./live.mjs',import.meta.url))
  writeFileSync(join(run.path,'execution-driver.mjs'),source,{flag:'wx',flush:true})
  write('execution-pin.json',{version:'gate2-execution-pin-v1',created_at_utc:new Date().toISOString(),
    source_sha256:hash(source),freeze_sha256:freeze.manifest_hash,node_version:process.version,
    owner_authorization:runtime.execution_amendment?.owner_authorization??'owner-conversation-2026-11-14-controlled-development-start',
    actual_network:'native-fetch',retries:0,oracle_content_forwarded:false,oracle_integrity_checked_by_guard:true,scheduled_calls:runtime.spending_policy.scheduled_calls})
  let count=0
  const status=await executeSchedule(run,r=>{
    count++
    const t=r.transport
    const summary={sequence:count,coordinate:r.coordinate,attempt_id:r.attempt_id,request_sha256:r.request_sha256,
      outcome:t.outcome,attempted:t.attempted,http_status:t.http_status,error_code:t.error_code,
      evidence_complete:t.evidence_complete,usage:t.usage,latency:t.latency,response_model:t.response_model,
      boundary_failure:r.boundary_failure,created_at_utc:new Date().toISOString()}
    if(r.protocol_revision)Object.assign(summary,{protocol_revision:r.protocol_revision,settlement_outcome:r.settlement_outcome,run_disposition:r.run_disposition,termination:t.termination})
    write(`result-${String(count).padStart(4,'0')}.json`,summary)
    process.stdout.write(JSON.stringify(summary)+'\n')
  })
  write('execution-end.json',{status,attempts:count,created_at_utc:new Date().toISOString(),next:run.next(),no_retry:true})
  if(!['completed','completed_with_diagnostic_censoring'].includes(status))process.exitCode=2
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{process.stderr.write('Execution stopped; inspect reserved ledger. No automatic retry and no secret details emitted.\n');process.exitCode=1})
}
