import { verifyFreezeBundle, readVerifiedExecutionInputs } from './freeze.mjs'
import { verifyFrozenSources } from './freeze-development.mjs'
import { createPlan } from './plan.mjs'
import { buildInput } from '../context/build.mjs'
import { compileRequest } from './request.mjs'
import { serializeCompletion, performCompletion } from './transport.mjs'
import { readGate2Raw } from './inline-profile.mjs'
import { performDeadlineCompletion } from './deadline-transport.mjs'
import { checkedRevision, auditDiagnosticCensor, checkRevisionExecution } from './revision-policy.mjs'
import { openRunLedger } from './run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
import { routingHeadersFor } from './routing.mjs'
import { BINARY_STORAGE } from './transaction-frame.mjs'

const positive=v=>Number.isSafeInteger(v)&&v>0
const coordinateKeys=['family_id','condition','arm','track','turn_id','stage']
const equalCoordinate=(a,b)=>a&&b&&Object.keys(a).length===6&&coordinateKeys.every(k=>a[k]===b[k])
const collect=(attempt,channel)=>Buffer.concat(attempt.chunks.filter(c=>c.channel===channel).map(c=>Buffer.from(c.bytes_base64,'base64')))

export function openGuardedRun({bundle,root,runId,resume=false,mode='offline',fetchImpl,credentialProvider,clock,offlineStorageProtocol}) {
  if(offlineStorageProtocol!==undefined&&(mode!=='offline'||!['raw-first-transaction-v1',BINARY_STORAGE].includes(offlineStorageProtocol)))throw new Error('offline storage protocol cannot be used live')
  const binary=offlineStorageProtocol===BINARY_STORAGE
  const pin={manifestPath:bundle?.manifestPath,expectedManifestHash:bundle?.expectedManifestHash,checkCorpus:true}
  if(!['offline','live'].includes(mode)||typeof credentialProvider!=='function'||(mode==='offline'?typeof fetchImpl!=='function':fetchImpl!==undefined))throw new Error('invalid live/offline transport configuration')
  if(mode==='live'&&clock!==undefined)throw new Error('live clock injection prohibited')
  const verify=()=>{
    const report=verifyFreezeBundle(pin)
    if(!report.corpus_preflight_passed||!report.full_package_review_binding_verified||report.review_mode!=='owner-delegated-model-review')throw new Error('full reviewed corpus freeze required')
    if(mode==='live'&&report.purpose!=='development')throw new Error('live purpose must be development')
    verifyFrozenSources(report)
    return report
  }
  const report=verify(),inputs=readVerifiedExecutionInputs(report)
  const json=role=>JSON.parse(inputs.find(f=>f.role===role).bytes.toString('utf8'))
  const runtime=json('runtime'),publicCorpus=json('public'),plan=createPlan(json('plan'))
  const revision=checkedRevision(runtime.protocol_revision)
  if(offlineStorageProtocol&&revision?.diagnostic_policy!=='D-180-LOCAL-v1')throw new Error('offline storage requires deadline transport')
  if(revision&&mode==='live')checkRevisionExecution(runtime,{root,runId,scheduledCalls:plan.counts.total})
  if(revision?.diagnostic_policy&&(runtime.timeout_ms!==180000||runtime.max_output_tokens!==16384||runtime.max_input_bytes!==131072||runtime.max_response_bytes!==1048576))throw new Error('revision deadline/resource bounds changed')
  const parse=(bytes,options)=>readGate2Raw(bytes,{...options,inlineProfile:revision?.inline_profile??undefined})
  if(mode==='live'&&!runtime.routing_policy)throw new Error('live routing policy required')
  if(runtime.version!=='gate2-runtime-v1'||runtime.node_version!==process.version||runtime.model_identity_kind!=='mutable-service-alias'||runtime.spending_policy?.mode!=='uncapped'||runtime.spending_policy.scheduled_calls!==plan.counts.total||
    !['max_output_tokens','max_input_bytes','max_response_bytes','timeout_ms'].every(k=>positive(runtime[k]))||runtime.timeout_ms>2_147_483_647||runtime.max_input_bytes>1_048_576||runtime.max_response_bytes>4_194_304||typeof runtime.spending_policy.authorization_ref!=='string')throw new Error('invalid frozen runtime')
  const prompts=Object.fromEntries(['A','B','C0','D'].map(arm=>{
    const file=inputs.find(f=>f.path===`prompts/${arm.toLowerCase()}.txt`)
    if(!file)throw new Error('missing frozen prompt')
    return [arm,file.bytes.toString('utf8')]
  }))
  const schedule=plan.blocks.flatMap(block=>block.calls.map(call=>({family_id:block.family_id,condition:block.condition,arm:block.arm,track:block.track,turn_id:call.turn_id,stage:call.stage})))
  const ledger=openRunLedger({root,runId,resume,freezeHash:report.manifest_hash,
    revision,storageProtocol:offlineStorageProtocol,
    evidenceKind:mode==='offline'?'offline-boundary-test':'development-model-run',
    limits:{mode:'uncapped',maxCalls:null,maxCostMicros:null,currency:runtime.currency,scheduledCalls:plan.counts.total,authorizationRef:runtime.spending_policy.authorization_ref}})
  const audit=()=>binary?ledger.auditSummary():ledger.snapshot()
  function eligible(coordinate) {
    const state=audit()
    if(state.halted)throw new Error('run halted; no retry')
    if(state.attempts.some(a=>!a.settlement))throw new Error('interrupted/in-flight reservation; no resend')
    const expected=schedule[state.attempts.length]
    if(!equalCoordinate(coordinate,expected))throw new Error('coordinate is not the next frozen scheduled generation')
    return state
  }
  function prepare(coordinate) {
    let state=eligible(coordinate)
    verify()
    if(binary) {
      const needed=state.attempts.filter(a=>(coordinate.track==='CLOSED-LOOP'&&a.coordinate.family_id===coordinate.family_id&&a.coordinate.condition===coordinate.condition&&a.coordinate.arm===coordinate.arm&&a.coordinate.track==='CLOSED-LOOP')||
        (coordinate.arm==='D'&&coordinate.stage==='marker'&&equalCoordinate(a.coordinate,{...coordinate,stage:'answer'}))).map(a=>a.attemptId)
      if(needed.length) {
        const originals=new Map(ledger.readAuditedAttempt(state,needed).map(a=>[a.attemptId,a]))
        state={...state,attempts:state.attempts.map(a=>originals.get(a.attemptId)??a)}
      }
    }
    const s=publicCorpus.families.find(f=>f.family_id===coordinate.family_id)
    if(!s)throw new Error('unknown frozen family')
    let history
    if(coordinate.track==='FROZEN-REPLAY') history=structuredClone(s.reference_history[coordinate.condition])
    else {
      history=[]
      for(const a of state.attempts.filter(a=>a.coordinate.family_id===coordinate.family_id&&a.coordinate.condition===coordinate.condition&&a.coordinate.arm===coordinate.arm&&a.coordinate.track==='CLOSED-LOOP')) {
        if(a.settlement?.outcome!=='success')throw new Error('unsuccessful history')
        const p=buildInput(s,history,{condition:coordinate.condition,arm:coordinate.arm,turnId:a.coordinate.turn_id})
        const bytes=collect(a,'model'), parsed=parse(bytes,{arm:coordinate.arm,inputPacket:p})
        history.push({turn_id:a.coordinate.turn_id,source_id:`a${a.coordinate.turn_id.slice(1)}`,role:'assistant',content:bytes.toString('utf8'),
          reasoning_content:collect(a,'reasoning').toString('utf8'),metadata_valid:parsed.valid,
          ...(parsed.valid&&parsed.workState?{projection:parsed.workState}:{})})
      }
    }
    const packet=buildInput(s,history,{condition:coordinate.condition,arm:coordinate.arm,turnId:coordinate.turn_id})
    packet.prompt_version=`gate2-development-r1/${hash(prompts[coordinate.arm])}`
    let answerText
    if(coordinate.arm==='D'&&coordinate.stage==='marker') {
      const first=state.attempts.find(a=>equalCoordinate(a.coordinate,{...coordinate,stage:'answer'}))
      if(!first||first.settlement?.outcome!=='success')throw new Error('D1 original answer missing')
      answerText=collect(first,'model').toString('utf8')
    }
    const compiled=compileRequest(packet,{prompts,...(coordinate.arm==='D'?{stage:coordinate.stage,answerText}:{})})
    const assistantReasoning=Object.fromEntries(packet.messages.filter(m=>m.role==='assistant').map(m=>{
      const original=history.find(h=>h.source_id===m.source_id)
      if(typeof original?.reasoning_content!=='string')throw new Error('original reasoning missing')
      return [m.source_id,original.reasoning_content]
    }))
    const routingHeaders=runtime.routing_policy?routingHeadersFor({policy:runtime.routing_policy,runId,freezeHash:report.manifest_hash,coordinate,sessionId:packet.session_id}):undefined
    const request=serializeCompletion(compiled,{route:runtime.route,maxOutputTokens:runtime.max_output_tokens,assistantReasoning,routingHeaders})
    if(request.bytes.length>runtime.max_input_bytes)throw new Error('frozen input byte bound exceeded; do not truncate')
    return {packet,compiled,request,assistantReasoning,answerText}
  }
  async function execute(coordinate,{signal}={}) {
    const began=performance.now(), stages={version:'wire-accounting-v1',pre_send_validation_ms:0,result_file_completed_ms:null}
    coordinate=structuredClone(coordinate)
    if(signal?.aborted)throw new Error('cancelled before reservation')
    const prepared=prepare(coordinate)
    stages.prepare_ms=performance.now()-began
    let stageStart=performance.now()
    const attemptId=ledger.reserve({coordinate,requestBytes:prepared.request.bytes,maxCostMicros:null,answerHash:prepared.compiled.answer_hash})
    stages.reserve_ms=performance.now()-stageStart
    let boundaryFailure=null
    stageStart=performance.now()
    ledger.capture({attemptId,channel:'transport',bytes:JSON.stringify({kind:'pre_send',created_at_utc:new Date().toISOString(),freeze_hash:report.manifest_hash,compiled_hash:prepared.compiled.request_hash,input_packet:prepared.packet,coordinate,
      ...(prepared.request.headers?{headers:prepared.request.headers,headers_sha256:prepared.request.headers_sha256}:{})}),elapsedMs:0})
    stages.pre_send_record_ms=performance.now()-stageStart
    let credential
    stageStart=performance.now()
    try { credential=await credentialProvider({reference:runtime.route.credential_ref??null,provider:runtime.route.provider,model_alias:runtime.route.model_alias}) }
    catch { ledger.settle({attemptId,outcome:'error',actualCostMicros:null});throw new Error('credential unavailable; reserved attempt cannot be retried') }
    if(typeof credential!=='string'||!credential.length||/[\r\n]/.test(credential)) { ledger.settle({attemptId,outcome:'error',actualCostMicros:null});throw new Error('credential unavailable; reserved attempt cannot be retried') }
    stages.credential_resolution_ms=performance.now()-stageStart
    const captureValue=event=>{
      const channel={wire:'wire',content:'model',reasoning:'reasoning'}[event.kind]
      const value=channel?event.bytes:Buffer.from(JSON.stringify(event.kind==='request'?{kind:event.kind,endpoint:event.endpoint,sha256:event.sha256,elapsed_ms:event.elapsed_ms,
        ...(event.headers?{headers:event.headers,headers_sha256:event.headers_sha256}:{})}:event.kind==='terminal'?{...event,boundary_failure:boundaryFailure}:event))
      return {attemptId,channel:channel??'transport',bytes:value,elapsedMs:event.elapsed_ms}
    }
    const record=event=>{
      if(event.kind==='request') {
        const validationStart=performance.now()
        try {
          verify()
          const current=audit(), a=current.attempts.find(a=>a.attemptId===attemptId)
          if(current.halted||a?.settlement||a?.request_sha256!==event.sha256||hash(event.bytes)!==a.request_sha256)throw new Error('reservation changed')
          if(prepared.request.headers) {
            const archived=a.chunks.filter(c=>c.channel==='transport').map(c=>JSON.parse(Buffer.from(c.bytes_base64,'base64'))).find(e=>e.kind==='pre_send')
            if(event.headers_sha256!==prepared.request.headers_sha256||hash(event.headers)!==archived?.headers_sha256||hash(archived.headers)!==event.headers_sha256)throw new Error('routing headers changed')
          }
        } catch { boundaryFailure='pre_send_freeze_or_reservation_rejected';throw new Error('pre-send validation failed') }
        finally { stages.pre_send_validation_ms+=performance.now()-validationStart }
      }
      ledger.capture(captureValue(event))
    }
    const perform=revision?.diagnostic_policy?performDeadlineCompletion:performCompletion
    const transport=await perform({request:prepared.request,credential,fetchImpl:mode==='live'?globalThis.fetch:fetchImpl,record,
      ...(offlineStorageProtocol?{recordBatch:events=>ledger.captureBatch(events.map(captureValue)),accounting:true}:{}),
      timeoutMs:runtime.timeout_ms,maxResponseBytes:runtime.max_response_bytes,signal,...(clock?{clock}:{})})
    credential=undefined
    stageStart=performance.now()
    let outcome=transport.outcome==='complete'&&transport.evidence_complete?'success':'error'
    if(outcome==='error'&&revision?.diagnostic_policy) {
      // Audit the on-disk facts, not the in-memory timeout flag. Verification
      // failures propagate without a settlement and therefore prohibit resend.
      verify()
      const state=audit(),attempt=state.attempts.find(a=>a.attemptId===attemptId)
      try { auditDiagnosticCensor(attempt,{revision,limits:{mode:runtime.spending_policy.mode},freezeHash:report.manifest_hash}); outcome='diagnostic_censored' }
      catch { outcome='error' }
    }
    stages.termination_audit_ms=performance.now()-stageStart
    stageStart=performance.now()
    ledger.settle({attemptId,outcome,actualCostMicros:null})
    stages.settlement_ms=performance.now()-stageStart
    stageStart=performance.now()
    const settled=audit()
    stages.final_audit_ms=performance.now()-stageStart
    stages.attempt_wall_ms=performance.now()-began
    return {attempt_id:attemptId,coordinate:structuredClone(coordinate),request_sha256:prepared.request.sha256,boundary_failure:boundaryFailure,transport,
      ...(offlineStorageProtocol?{offline_evidence_accounting:{...stages,ledger_cumulative:ledger.diagnostics(),
        timing_scope:'Native monotonic wall time through durable settlement/final audit; excludes caller result-file write. Nested callback/ledger timings must not be added.'}}:{}),
      ...(revision?{settlement_outcome:outcome,run_disposition:settled.halted?'halt':'continue_next_scheduled_coordinate',protocol_revision:revision}:{}),
      evidence_kind:mode==='offline'?'offline-boundary-test':'development-model-run',model_identity_verified:false}
  }
  return Object.freeze({path:ledger.path,manifest_hash:report.manifest_hash,prepare,execute,
    next:()=>structuredClone(schedule[audit().attempts.length]??null),snapshot:()=>ledger.snapshot()})
}
