import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { createCompletionDecoder } from '../gate2/transport.mjs'
import { hash } from '../protocol/contracts.mjs'

export function replayCapturedSink({sourceRoot,sourceRunId,root,runId,limitMs=15000}) {
  const sourcePath=join(sourceRoot,sourceRunId), sourceManifest=JSON.parse(readFileSync(join(sourcePath,'manifest.json'),'utf8'))
  const original=readFileSync(join(sourcePath,'events.jsonl')), originalHash=hash(original)
  const originalState=openRunLedger({root:sourceRoot,runId:sourceRunId,resume:true,freezeHash:sourceManifest.freezeHash,limits:sourceManifest.limits,evidenceKind:sourceManifest.evidenceKind}).snapshot()
  const events=original.toString('utf8').trim().split('\n').map(JSON.parse)
  const options={root,runId,freezeHash:sourceManifest.freezeHash,limits:sourceManifest.limits,evidenceKind:'offline-boundary-test'}
  let ledger=openRunLedger(options), starts=performance.now(), channelCount=0
  const timings=[]
  for(const e of events) {
    const v=e.value,t=performance.now()
    if(e.kind==='reserve')ledger.reserve({coordinate:v.coordinate,requestBytes:Buffer.from(v.request_base64,'base64'),maxCostMicros:v.maxCostMicros,answerHash:v.answer_sha256})
    else if(e.kind==='capture'){ledger.capture({attemptId:v.attemptId,channel:v.channel,bytes:Buffer.from(v.bytes_base64,'base64'),elapsedMs:v.elapsedMs});channelCount++;timings.push(performance.now()-t)}
    else if(e.kind==='settle')ledger.settle(v)
    else throw new Error('unexpected source event')
  }
  const elapsed=performance.now()-starts,stats=ledger.diagnostics()
  const recovered=openRunLedger({...options,resume:true}).snapshot()
  assert.deepEqual(recovered.attempts,originalState.attempts)
  assert.deepEqual(recovered.budget,originalState.budget)
  const derived=readFileSync(join(ledger.path,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(derived.map(e=>({kind:e.kind,value:e.value})),events.map(e=>({kind:e.kind,value:e.value})))
  let completeStreams=0
  for(const a of recovered.attempts) {
    const parser=createCompletionDecoder()
    for(const c of a.chunks.filter(c=>c.channel==='wire'))parser.push(Buffer.from(c.bytes_base64,'base64'))
    const terminal=a.chunks.filter(c=>c.channel==='transport').map(c=>JSON.parse(Buffer.from(c.bytes_base64,'base64'))).find(e=>e.kind==='terminal')
    if(terminal?.result.transport_complete) {
      const p=parser.finish();completeStreams++
      for(const [channel,key]of [['model','content'],['reasoning','reasoning']])assert.equal(p[key],Buffer.concat(a.chunks.filter(c=>c.channel===channel).map(c=>Buffer.from(c.bytes_base64,'base64'))).toString('utf8'))
    } else assert.throws(()=>parser.finish())
  }
  assert.equal(hash(readFileSync(join(sourcePath,'events.jsonl'))),originalHash)
  const percentile=p=>[...timings].sort((a,b)=>a-b)[Math.min(timings.length-1,Math.floor(timings.length*p))]
  const result={version:'gate2-real-fragment-offline-replay-v1',real_model_requests:0,evidence_kind:'offline-boundary-test',
    source_journal_sha256:originalHash,source_events:events.length,capture_events:channelCount,original_fragment_boundaries_preserved:true,
    all_original_event_payloads_equal:true,reopened_state_equal:true,complete_sse_streams_verified:completeStreams,
    original_incomplete_attempt_not_repaired:true,elapsed_ms:elapsed,capture_p50_ms:percentile(.5),capture_p95_ms:percentile(.95),capture_p99_ms:percentile(.99),
    engineering_threshold_ms:limitMs,engineering_threshold_passed:elapsed<limitMs,ledger_diagnostics:stats,
    timing_note:'Unpaced offline replay; original capture timestamps retained as copied evidence, not new arrival measurements'}
  writeFileSync(join(ledger.path,'replay-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',flush:true})
  assert.ok(result.engineering_threshold_passed,JSON.stringify(result))
  return result
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [sourceRoot,sourceRunId,root,runId]=process.argv.slice(2)
  console.log(JSON.stringify(replayCapturedSink({sourceRoot,sourceRunId,root,runId}),null,2))
}
