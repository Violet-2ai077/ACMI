import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { openRunLedger } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'

const [sourceRoot,root,runId]=process.argv.slice(2)
const source=readFileSync(join(sourceRoot,'development/events.jsonl'))
const events=source.toString().trim().split('\n').map(JSON.parse)
const id=events.filter(e=>e.kind==='reserve')[1].value.attemptId
const chunks=events.filter(e=>e.kind==='capture'&&e.value.attemptId===id&&['wire','model','reasoning'].includes(e.value.channel)).map(e=>e.value)
const options={root,runId,freezeHash:'a'.repeat(64),evidenceKind:'offline-boundary-test',limits:{mode:'uncapped',maxCalls:null,maxCostMicros:null,currency:'USD',scheduledCalls:1,authorizationRef:'owner-2026-11-15-offline-replay'}}
const l=openRunLedger(options),attemptId=l.reserve({coordinate:{family_id:'synthetic-amplified-real-fragments',condition:'C1',arm:'A',track:'CLOSED-LOOP',turn_id:'t1',stage:'single'},requestBytes:'offline stress; no HTTP request',maxCostMicros:null})
const repetitions=8,blocks=[];let sequence=0
for(let r=0;r<repetitions;r++) {
  const start=performance.now()
  for(const c of chunks)l.capture({attemptId,channel:c.channel,bytes:Buffer.from(c.bytes_base64,'base64'),elapsedMs:++sequence})
  blocks.push({repetition:r+1,events:chunks.length,elapsed_ms:performance.now()-start})
}
l.settle({attemptId,outcome:'success',actualCostMicros:null})
const actual=openRunLedger({...options,resume:true}).snapshot().attempts[0].chunks
for(let i=0;i<actual.length;i++) {
  const original=chunks[i%chunks.length]
  assert.equal(actual[i].bytes_base64,original.bytes_base64)
  assert.equal(actual[i].channel,original.channel)
}
assert.equal(actual.length,chunks.length*repetitions)
assert.equal(hash(readFileSync(join(sourceRoot,'development/events.jsonl'))),hash(source))
const ratio=blocks.at(-1).elapsed_ms/blocks[0].elapsed_ms,total=blocks.reduce((n,b)=>n+b.elapsed_ms,0)
const report={version:'gate2-amplified-fragment-stress-v1',synthetic_amplification:true,real_model_requests:0,source_sha256:hash(source),
  repetitions,events:sequence,preserved_every_repeated_payload:true,synthetic_timestamps:'ordinal, not observed arrival time',
  blocks,capture_total_ms:total,last_first_ratio:ratio,engineering_limits:{capture_total_ms:60000,last_first_ratio:3},
  passed:total<60000&&ratio<3,diagnostics:l.diagnostics()}
writeFileSync(join(l.path,'stress-result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true})
console.log(JSON.stringify(report,null,2));assert.ok(report.passed)
