import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCredential, executeSchedule } from '../execution/live.mjs'

test('credential loader selects only the requested managed reference and sanitizes failures',()=>{
  const document={errors:[],get:()=>1,getIn:path=>path.join('/')==='refs/EXPECTED_REF'?'SYNTHETIC_SECRET':undefined}
  const opts={reference:'EXPECTED_REF',credentialsFile:'synthetic',parseDocument:()=>document,read:()=>'',env:{EXPECTED_REF:'OTHER_SYNTHETIC'}}
  assert.equal(resolveCredential(opts),'SYNTHETIC_SECRET')
  assert.throws(()=>resolveCredential({...opts,parseDocument:()=>{throw new Error('DO_NOT_ECHO')}}),e=>e.message==='credential resolution failed')
  assert.throws(()=>resolveCredential({...opts,reference:'bad ref'}),/credential resolution failed/)
  assert.throws(()=>resolveCredential({...opts,parseDocument:()=>({...document,errors:['DO_NOT_ECHO']})}),/credential resolution failed/)
})

test('credential fallback is allowed only when managed file/ref is absent',()=>{
  const opts={reference:'EXPECTED_REF',credentialsFile:'synthetic',parseDocument:()=>({errors:[],get:()=>1,getIn:()=>undefined}),env:{EXPECTED_REF:'SYNTHETIC_ENV'},read:()=>''}
  assert.equal(resolveCredential(opts),'SYNTHETIC_ENV')
  assert.equal(resolveCredential({...opts,read:()=>{throw Object.assign(new Error(),{code:'ENOENT'})}}),'SYNTHETIC_ENV')
  assert.throws(()=>resolveCredential({...opts,read:()=>{throw Object.assign(new Error(),{code:'EACCES'})}}),/credential resolution failed/)
  assert.throws(()=>resolveCredential({...opts,env:{EXPECTED_REF:'bad\nvalue'}}),/credential resolution failed/)
})

test('schedule stops on first transport failure without retry and does not inspect marker quality',async()=>{
  let n=0;const seen=[]
  const run={next:()=>n<3?{turn_id:`t${n+1}`}:null,execute:async c=>{n++;return {coordinate:c,transport:{outcome:n===2?'failed':'complete',evidence_complete:n!==2}}}}
  const result=await executeSchedule(run,r=>seen.push(r.coordinate.turn_id))
  assert.deepEqual(seen,['t1','t2']);assert.equal(n,2);assert.equal(result,'halted')
})
