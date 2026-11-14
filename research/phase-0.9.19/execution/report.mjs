import { readFileSync,writeFileSync } from 'node:fs'
import { dirname,join,resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyFreezeBundle,readVerifiedExecutionInputs } from '../gate2/freeze.mjs'
import { verifyFrozenSources } from '../gate2/freeze-development.mjs'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { createPlan } from '../gate2/plan.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { readGate2Raw } from '../gate2/inline-profile.mjs'
import { checkedRevision } from '../gate2/revision-policy.mjs'
import { aggregate } from '../evaluator/score.mjs'
import { scoreDevelopmentAttempt } from '../gate2/development-evaluator.mjs'
import { hash } from '../protocol/contracts.mjs'
import { routingHeadersFor } from '../gate2/routing.mjs'

const bytes=(a,channel)=>Buffer.concat(a.chunks.filter(c=>c.channel===channel).map(c=>Buffer.from(c.bytes_base64,'base64')))
const events=a=>a.chunks.filter(c=>c.channel==='transport').map(c=>JSON.parse(Buffer.from(c.bytes_base64,'base64')))
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null

export function importRun({bundle,root,runId}) {
  const freeze=verifyFreezeBundle({...bundle,checkCorpus:true});verifyFrozenSources(freeze)
  const inputs=readVerifiedExecutionInputs(freeze), plan=createPlan(JSON.parse(inputs.find(x=>x.role==='plan').bytes))
  const runtime=JSON.parse(inputs.find(x=>x.role==='runtime').bytes)
  const revision=checkedRevision(runtime.protocol_revision)
  const manifest=JSON.parse(readFileSync(join(root,runId,'manifest.json'),'utf8'))
  const state=openRunLedger({root,runId,resume:true,freezeHash:freeze.manifest_hash,limits:manifest.limits,evidenceKind:manifest.evidenceKind,revision}).snapshot()
  const oracleBytes=readFileSync(join(dirname(bundle.manifestPath),'oracle/corpus.json'))
  const frozenManifest=JSON.parse(readFileSync(bundle.manifestPath,'utf8'))
  if(hash(oracleBytes)!==frozenManifest.files.find(x=>x.role==='oracle').sha256)throw new Error('oracle changed after verification')
  const oracle=JSON.parse(oracleBytes),maps=new Map(),rows=[]
  const schedule=plan.blocks.flatMap(b=>b.calls.map(c=>({family_id:b.family_id,condition:b.condition,arm:b.arm,track:b.track,turn_id:c.turn_id,stage:c.stage})))
  for(const [index,a] of state.attempts.entries()) {
    const c=a.coordinate
    if(JSON.stringify(c)!==JSON.stringify(schedule[index]))throw new Error('journal not in frozen schedule')
    const ev=events(a),pre=ev.find(e=>e.kind==='pre_send'),terminal=ev.find(e=>e.kind==='terminal'),t=terminal?.result
    if(!pre||pre.freeze_hash!==freeze.manifest_hash||JSON.stringify(pre.coordinate)!==JSON.stringify(c))throw new Error('pre-send provenance missing')
    const p=pre.input_packet,g=oracle.families.find(f=>f.family_id===c.family_id).oracle[c.condition][c.turn_id]
    if(runtime.routing_policy) {
      const expected=routingHeadersFor({policy:runtime.routing_policy,runId,freezeHash:freeze.manifest_hash,coordinate:c,sessionId:p.session_id})
      const sent=ev.find(e=>e.kind==='request')
      if(hash(expected)!==pre.headers_sha256||hash(pre.headers)!==pre.headers_sha256||sent&&(hash(sent.headers)!==pre.headers_sha256||sent.headers_sha256!==pre.headers_sha256))throw new Error('routing header provenance mismatch')
    }
    const r={coordinate:c,difficulty:p.difficulty,transport:t?{outcome:t.outcome,error_code:t.error_code,http_status:t.http_status,attempted:t.attempted,
      evidence_complete:t.evidence_complete,usage:t.usage,latency:t.latency,response_model:t.response_model}:null,
      settlement:a.settlement,score:null,scoring_defect:null}
    if(revision) {
      r.protocol_revision=revision
      r.inline_profile=c.arm==='B'?(revision.inline_profile??'B-inline-v1-strict'):null
      r.dispatch_status=t?.attempted===true?'confirmed':t?.attempted===false?'not-dispatched':ev.some(e=>e.kind==='request')?'unknown':'not-dispatched'
      r.latency_observation=a.settlement?.outcome==='diagnostic_censored'?'deadline-censored':t?.outcome==='complete'&&t.evidence_complete?'completed':'failed-or-unobserved'
      if(r.transport)r.transport.termination=t.termination??null
    }
    if(c.stage!=='answer'&&a.settlement?.outcome==='success'&&t?.outcome==='complete'&&t.evidence_complete) {
      const first=c.arm==='D'?state.attempts.find(x=>x.coordinate.family_id===c.family_id&&x.coordinate.condition===c.condition&&x.coordinate.arm==='D'&&x.coordinate.turn_id===c.turn_id&&x.coordinate.stage==='answer'):null
      const raw=readGate2Raw(bytes(a,'model'),{arm:c.arm,inputPacket:p,answerText:first?bytes(first,'model').toString('utf8'):undefined,inlineProfile:revision?.inline_profile??undefined})
      if(c.arm==='B'&&revision?.inline_profile)r.legacy_strict_v1_conformant=readRaw(bytes(a,'model'),{arm:'B',inputPacket:p}).valid
      r.marker_schema_valid=c.arm==='C0'?null:raw.valid
      r.parser_errors=raw.errors
      const key=[c.family_id,c.condition,c.arm,c.track].join('/')
      if(!maps.has(key))maps.set(key,{})
      try {
        r.score=scoreDevelopmentAttempt({inputPacket:p,oracle:g,rawPrediction:raw,identityMap:maps.get(key),
          attempt:{...c,finish_reason:t.finish_reason,usage:t.usage,clocks:t.latency,transport_kind:manifest.evidenceKind==='development-model-run'?'live':'synthetic',streaming_complete:t.transport_complete}})
      } catch { r.scoring_defect='frozen_evaluator_rejected_prediction';r.score=null }
    }
    rows.push(r)
  }
  const groups=[]
  for(const condition of ['C1','C2','C3'])for(const arm of ['A','B','C0','D'])for(const track of (arm==='C0'?['CLOSED-LOOP']:arm==='D'?['FROZEN-REPLAY']:['CLOSED-LOOP','FROZEN-REPLAY']))for(const difficulty of ['simple','medium','hard']) {
    const selected=rows.filter(r=>r.coordinate.condition===condition&&r.coordinate.arm===arm&&r.coordinate.track===track&&r.difficulty===difficulty)
    const scored=selected.filter(r=>r.score),times=selected.filter(r=>r.transport?.latency&&(!revision||r.latency_observation==='completed')).map(r=>r.transport.latency.total_ms)
    const metric=arm!=='C0'&&scored.length?aggregate(scored.map(r=>r.score),{condition,arm,track,split:'dev'}):null
    if(metric){delete metric.rows;metric.uncertainty={cluster_interval:null,reason:'Exploratory development with one story per category; no confirmatory risk bound'}}
    groups.push({condition,arm,track,difficulty,generations:selected.length,scored_turns:scored.length,
      transport_completed:selected.filter(r=>r.transport?.outcome==='complete'&&r.transport.evidence_complete).length,
      scoring_defects:selected.filter(r=>r.scoring_defect).length,metrics:metric,
      answer_lexical_pass_rate:mean(scored.map(r=>Number(r.score.answer_passed))),
      latency_total_mean_ms:mean(times),usage_observations:selected.filter(r=>r.transport?.usage).length,
      token_overhead:null,token_overhead_reason:'Not computed without a completed matched baseline analysis',
      no_observations:selected.length===0})
  }
  const diagnosticGroups=[]
  if(revision) {
    const publicCorpus=JSON.parse(inputs.find(x=>x.role==='public').bytes)
    const difficultyOf=c=>publicCorpus.families.find(f=>f.family_id===c.family_id).turns.find(t=>t.turn_id===c.turn_id).difficulty
    for(const condition of ['C1','C2','C3'])for(const difficulty of ['simple','medium','hard']) {
      const planned=schedule.filter(c=>c.arm==='D'&&c.condition===condition&&difficultyOf(c)===difficulty)
      const selected=rows.filter(r=>r.coordinate.arm==='D'&&r.coordinate.condition===condition&&r.difficulty===difficulty)
      const stageStats=stage=>{
        const subset=selected.filter(r=>r.coordinate.stage===stage),dispatched=subset.filter(r=>r.dispatch_status==='confirmed'),unknown=subset.filter(r=>r.dispatch_status==='unknown'),completed=dispatched.filter(r=>r.transport.outcome==='complete'&&r.transport.evidence_complete)
        const censored=dispatched.filter(r=>r.settlement?.outcome==='diagnostic_censored'),valid=completed.filter(r=>r.marker_schema_valid===true)
        const count=planned.filter(c=>c.stage===stage).length
        return {planned:count,reserved:subset.length,dispatched:dispatched.length,completed:completed.length,deadline_censored:censored.length,
          other_failures:dispatched.filter(r=>r.settlement&&r.settlement.outcome!=='success'&&r.settlement.outcome!=='diagnostic_censored').length,
          unattempted:count-dispatched.length-unknown.length,dispatch_unknown:unknown.length,not_reserved:count-subset.length,
          reserved_without_dispatch:subset.filter(r=>r.dispatch_status==='not-dispatched').length,
          unsettled:subset.filter(r=>!r.settlement).length,denominator_complete:unknown.length===0,
          completion_rate:!unknown.length&&dispatched.length?completed.length/dispatched.length:null,
          marker_available:stage==='marker'?valid.length:null,marker_availability_rate:stage==='marker'&&!unknown.length&&dispatched.length?valid.length/dispatched.length:null,
          semantic_scored:subset.filter(r=>r.score).length,completed_latency_mean_ms:mean(completed.map(r=>r.transport.latency.total_ms)),
          censored_latency_ms:censored.map(r=>r.transport.latency.total_ms),usage_observations:dispatched.filter(r=>r.transport.usage).length}
      }
      diagnosticGroups.push({condition,difficulty,planned_pairs:planned.filter(c=>c.stage==='answer').length,D1:stageStats('answer'),D2:stageStats('marker'),included_in_go:false})
    }
  }
  return {version:revision?'gate2-live-import-v2':'gate2-live-import-v1',evidence_kind:manifest.evidenceKind,freeze_sha256:freeze.manifest_hash,journal_head:state.digest,
    ...(revision?{protocol_revision:revision,diagnostic_groups:diagnosticGroups,latency_mean_scope:'completed-generations-only',
      schedule_exhausted:rows.length===plan.counts.total&&rows.every(r=>['success','diagnostic_censored'].includes(r.settlement?.outcome))}:{}),
    journal_events:state.seq,reserved_generations:rows.length,scheduled_generations:plan.counts.total,halted:state.halted,
    complete_schedule:rows.length===plan.counts.total&&rows.every(r=>r.settlement?.outcome==='success'),
    model_weight_identity_verified:false,actual_cost:null,decision:'EXPLORATORY_NOT_GO',
    transport_failure_is_not_model_capability_failure:true,groups,rows}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [pinPath,root,runId,output,...extra]=process.argv.slice(2)
    if(!output||extra.length)throw new Error('arguments')
    const pin=JSON.parse(readFileSync(pinPath,'utf8'))
    const report=importRun({bundle:{manifestPath:pin.manifest_path,expectedManifestHash:pin.manifest_sha256},root,runId})
    writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true})
    process.stdout.write(JSON.stringify({output,reserved_generations:report.reserved_generations,complete_schedule:report.complete_schedule,halted:report.halted,decision:report.decision})+'\n')
  } catch { process.stderr.write('Deterministic import failed; original evidence retained.\n');process.exitCode=1 }
}
