import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { verifyFreezeBundle } from './freeze.mjs'
import { openGuardedRun } from './send-boundary.mjs'
import { renderOracle } from './development-corpus.mjs'
import { scoreDevelopmentAttempt } from './development-evaluator.mjs'
import { encodeInline } from '../protocol/wire.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'

// Test driver only: oracle access and fabricated responses never belong in a live runner.
export async function verifyOfflinePrefix({bundle,root,runId,count=19}) {
  if(!Number.isInteger(count)||count<1||count>576)throw new Error('invalid verification prefix')
  verifyFreezeBundle({...bundle,checkCorpus:true})
  const oracle=JSON.parse(readFileSync(join(dirname(bundle.manifestPath),'oracle/corpus.json'),'utf8'))
  let nextText='',sent=0,credentials=0
  const options={bundle,root,runId,mode:'offline',credentialProvider:()=>{credentials++;return 'SYNTHETIC_OFFLINE_ONLY'},
    fetchImpl:async()=>{
      sent++
      const body='data: '+JSON.stringify({id:`offline-${sent}`,model:'synthetic-not-a-model',choices:[{index:0,delta:{content:nextText,reasoning_content:'synthetic reasoning'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'
      return new Response(body,{headers:{'content-type':'text/event-stream'}})
    }}
  let run=openGuardedRun(options)
  const maps=new Map(),rows=[]
  for(let i=0;i<count;i++) {
    // Reopen every turn: no in-memory history is allowed to stand in for persistence.
    if(i)run=openGuardedRun({...options,resume:true})
    const c=run.next(),p=run.prepare(c),family=oracle.families.find(f=>f.family_id===c.family_id)
    const g=family.oracle[c.condition][c.turn_id],envelope=renderOracle(family,p.packet)
    if(c.arm==='C0'||c.stage==='answer')nextText=envelope.answer.map(a=>a.text).join('\n')
    else if(c.arm==='B')nextText=encodeInline(envelope)
    else if(c.arm==='D') {
      assert.equal(p.answerText,envelope.answer.map(a=>a.text).join('\n'))
      let offset=0
      nextText=JSON.stringify({answer_ranges:envelope.answer.map(({text,...meta})=>{
        const start=offset;offset+=text.length+1;return {...meta,start,end:offset-1}
      }),work_state:envelope.work_state})
    } else nextText=JSON.stringify(envelope)
    const r=await run.execute(c)
    assert.equal(r.evidence_kind,'offline-boundary-test')
    assert.equal(r.transport.outcome,'complete',JSON.stringify(r))
    assert.equal(r.transport.evidence_complete,true)
    const attempt=run.snapshot().attempts.at(-1)
    const bytes=Buffer.concat(attempt.chunks.filter(x=>x.channel==='model').map(x=>Buffer.from(x.bytes_base64,'base64')))
    assert.equal(bytes.toString(),nextText)
    const row={coordinate:c,session_id:p.packet.session_id,request_sha256:r.request_sha256,transport_verified:true}
    if(c.stage!=='answer') {
      const key=[c.family_id,c.condition,c.arm,c.track].join('/')
      if(!maps.has(key))maps.set(key,{})
      const raw=readRaw(bytes,{arm:c.arm,inputPacket:p.packet,answerText:p.answerText})
      assert.equal(raw.valid,true,JSON.stringify(raw.errors))
      const score=scoreDevelopmentAttempt({inputPacket:p.packet,oracle:g,attempt:c,rawPrediction:raw,identityMap:maps.get(key)})
      assert.equal(score.answer_passed,true)
      if(c.arm!=='C0') {
        assert.equal(score.state.snapshot_exact,true,JSON.stringify(c))
        assert.equal(score.actions_exact,true)
        assert.equal(score.user.fp+score.user.fn+score.assistant.fp+score.assistant.fn,0)
      }
      row.oracle_conformance_verified=true
    } else row.d1_answer_only=true
    rows.push(row)
  }
  assert.equal(sent,count);assert.equal(credentials,count)
  const state=run.snapshot()
  assert.equal(state.budget.usedCalls,count);assert.equal(state.halted,false)
  const report={version:'gate2-offline-prefix-verification-v1',evidence_kind:'offline-boundary-test',
    actual_model_calls:0,synthetic_fetch_calls:sent,oracle_conformance_not_model_performance:true,
    complete_schedule_executed:count===576,freeze_sha256:run.manifest_hash,ledger_path:run.path,
    independent_model_quality_or_semantic_validation:false,rows}
  const reportPath=join(run.path,'offline-verification.json')
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true})
  return {reportPath,report}
}
