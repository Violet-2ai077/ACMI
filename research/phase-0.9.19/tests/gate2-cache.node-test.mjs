import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,statSync,utimesSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { openRunLedger,GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'

mkdirSync(GATE2_EVIDENCE_ROOT,{recursive:true})
const root=mkdtempSync(join(GATE2_EVIDENCE_ROOT,'cache-tests-'));let serial=0
const c={family_id:'cache-test',condition:'C1',arm:'A',track:'CLOSED-LOOP',turn_id:'t1',stage:'single'}
function setup(){
  const options={root,runId:'run-'+(++serial),freezeHash:'a'.repeat(64),limits:{maxCalls:2,maxCostMicros:100,currency:'USD'}}
  const l=openRunLedger(options),id=l.reserve({coordinate:c,requestBytes:'body',maxCostMicros:10})
  const capture=(n=1)=>l.capture({attemptId:id,channel:'wire',bytes:'data',elapsedMs:n})
  return {options,l,id,capture,path:join(l.path,'events.jsonl')}
}

test('captures avoid full replay while explicit snapshots and settlement audit disk',()=>{
  const x=setup(),before=x.l.diagnostics().full_replays
  for(let i=0;i<500;i++)x.capture(i)
  assert.equal(x.l.diagnostics().full_replays,before)
  assert.equal(x.l.diagnostics().capture_cache_hits,500)
  const s=x.l.snapshot();assert.equal(s.attempts[0].chunks.length,500)
  s.attempts[0].chunks.length=0;s.attempts[0].settlement={outcome:'error'}
  x.capture(501)
  x.l.settle({attemptId:x.id,outcome:'success',actualCostMicros:1})
  assert.equal(x.l.snapshot().attempts[0].chunks.length,501)
  assert.ok(x.l.diagnostics().full_replays>=before+3)
})

test('same-length prefix alteration with restored mtime is never accepted by an audit',()=>{
  const x=setup();x.capture();const s=statSync(x.path),raw=readFileSync(x.path,'utf8')
  writeFileSync(x.path,raw.replace('cache-test','cache-best'));utimesSync(x.path,s.atime,s.mtime)
  assert.throws(()=>x.capture(2),/digest|checkpoint/)
  assert.throws(()=>x.l.snapshot(),/digest|checkpoint/)
  assert.throws(()=>x.l.settle({attemptId:x.id,outcome:'success',actualCostMicros:1}),/digest|checkpoint/)
})

test('failed append invalidates speculative state; partial write remains unrecoverable evidence',()=>{
  for(const partial of [false,true]) {
    const x=setup();x.capture(1)
    const original=fs.appendFileSync
    try {
      fs.appendFileSync=(path,data,opts)=>{
        if(path!==x.path)return original(path,data,opts)
        if(partial)original(path,data.slice(0,20),opts)
        throw Object.assign(new Error('injected write failure'),{code:'EIO'})
      }
      syncBuiltinESMExports()
      assert.throws(()=>x.capture(2),/write failure/)
    } finally { fs.appendFileSync=original;syncBuiltinESMExports() }
    if(partial) {
      assert.throws(()=>x.l.snapshot(),/partial/)
      assert.throws(()=>openRunLedger({...x.options,resume:true}),/partial/)
    } else {
      x.capture(3)
      assert.deepEqual(x.l.snapshot().attempts[0].chunks.map(k=>k.elapsedMs),[1,3])
    }
  }
})

test('known prefix rollback and invalid capture cannot poison the cache',()=>{
  const x=setup(),prefix=readFileSync(x.path)
  x.capture(2)
  assert.throws(()=>x.capture(1),/monotonic/)
  x.capture(3)
  writeFileSync(x.path,prefix)
  assert.throws(()=>x.l.snapshot(),/checkpoint|rollback/)
})

test('another process valid append invalidates cache and preserves both captures',()=>{
  const x=setup();x.capture(1)
  const code=`import {openRunLedger} from ${JSON.stringify(new URL('../gate2/run-ledger.mjs',import.meta.url).href)};const l=openRunLedger(${JSON.stringify({...x.options,resume:true})});l.capture(${JSON.stringify({attemptId:x.id,channel:'wire',bytes:'peer',elapsedMs:2})});`
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'})
  assert.equal(child.status,0,child.stderr);x.capture(3)
  assert.deepEqual(x.l.snapshot().attempts[0].chunks.map(k=>Buffer.from(k.bytes_base64,'base64').toString()),['data','peer','data'])
  assert.throws(()=>openRunLedger({...x.options,resume:true}).reserve({coordinate:{...c,turn_id:'t2'},requestBytes:'body',maxCostMicros:1}),/in.flight/)
})
