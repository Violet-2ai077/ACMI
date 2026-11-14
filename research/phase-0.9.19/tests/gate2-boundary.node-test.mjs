import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { freezeDevelopment } from '../gate2/freeze-development.mjs'
import { openGuardedRun } from '../gate2/send-boundary.mjs'
import { GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { createPlan } from '../gate2/plan.mjs'
import { buildDevelopmentCorpus } from '../gate2/development-corpus.mjs'

mkdirSync(GATE2_EVIDENCE_ROOT,{recursive:true})
const root=mkdtempSync(join(GATE2_EVIDENCE_ROOT,'boundary-tests-'))
const data=buildDevelopmentCorpus(readFileSync(new URL('../gate2/development-scenarios.md',import.meta.url),'utf8'))
const runtime={version:'gate2-runtime-v1',model_snapshot:'alias:synthetic-not-a-model',model_identity_kind:'mutable-service-alias',node_version:process.version,
  spending_policy:{mode:'uncapped',authorization_ref:'owner-2026-11-14',scheduled_calls:576},route:{version:'gate2-dsh-route-v1',provider:'synthetic',api:'openai-completions',endpoint:'https://synthetic.invalid/v1/chat/completions',model_alias:'synthetic-not-a-model',reasoning_effort:'max',thinking_format:'deepseek',max_tokens_field:'max_tokens',assistant_reasoning_content_required:true,output_tokens_declared:32768},
  max_output_tokens:16384,max_input_bytes:131072,max_response_bytes:1048576,timeout_ms:1000,currency:'USD',pricing_verified:false}
let serial=0
const wire=text=>'data: '+JSON.stringify({id:'synthetic',model:'synthetic-not-a-model',choices:[{index:0,delta:{content:text,reasoning_content:'own reasoning'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'
const response=text=>new Response(wire(text),{headers:{'content-type':'text/event-stream'}})
function setup(extra={}) {
  const bundle=freezeDevelopment({root,packageId:'package-'+(++serial),runtime,purpose:'synthetic-test'})
  const sent=[], options={bundle,root,runId:'run-'+serial,mode:'offline',credentialProvider:()=> 'SYNTHETIC_TEST_ONLY',fetchImpl:async(url,init)=>{sent.push(JSON.parse(Buffer.from(init.body).toString()));return response('Own answer '+sent.length)},...extra}
  return {bundle,options,sent,run:openGuardedRun(options)}
}

test('boundary enforces exact frozen coordinate and persists reservation before secret lookup/send',async()=>{
  const x=setup();const first=x.run.next()
  assert.throws(()=>x.run.prepare({...first,turn_id:'t999'}),/coordinate/)
  assert.equal(x.run.snapshot().budget.usedCalls,0)
  const result=await x.run.execute(first)
  assert.equal(result.transport.outcome,'complete')
  assert.equal(x.sent.length,1)
  const attempt=x.run.snapshot().attempts[0]
  assert.equal(attempt.request_sha256,result.request_sha256)
  assert.equal(Buffer.from(attempt.request_base64,'base64').toString(),JSON.stringify(x.sent[0]))
  assert.equal(attempt.chunks.some(c=>c.channel==='reasoning'),true)
  assert.equal(attempt.chunks.some(c=>c.channel==='transport'),true)
  await assert.rejects(x.run.execute(first),/coordinate|duplicate/)
  assert.equal(x.sent.length,1)
  assert.equal(JSON.stringify(x.sent).includes('negative_cases'),false)
  assert.equal(JSON.stringify(x.sent).includes('reference_text'),false)
  assert.equal(JSON.stringify(x.run.snapshot()).includes('SYNTHETIC_TEST_ONLY'),false)
})

test('boundary persists before credential callback and fails closed if that callback fails',async()=>{
  let x
  x=setup({credentialProvider:()=>{assert.equal(x.run.snapshot().budget.usedCalls,1);throw new Error('secret error detail')}})
  await assert.rejects(x.run.execute(x.run.next()),/credential unavailable/)
  assert.equal(x.sent.length,0);assert.equal(x.run.snapshot().halted,true)
  assert.equal(JSON.stringify(x.run.snapshot()).includes('secret error detail'),false)
})

test('boundary rechecks frozen prompt after credentials resolve and never sends changed input',async()=>{
  let x
  x=setup({credentialProvider:()=>{writeFileSync(join(root,'package-'+serial,'prompts/a.txt'),'tamper');return 'SYNTHETIC_TEST_ONLY'}})
  const r=await x.run.execute(x.run.next())
  assert.equal(r.transport.outcome,'failed');assert.equal(x.sent.length,0)
  assert.equal(r.boundary_failure,'pre_send_freeze_or_reservation_rejected')
  assert.ok(x.run.snapshot().attempts[0].chunks.some(c=>Buffer.from(c.bytes_base64,'base64').toString().includes('pre_send_freeze_or_reservation_rejected')))
  assert.equal(x.run.snapshot().halted,true)
})

test('caller cannot change reserved coordinate while credential lookup is pending',async()=>{
  let release
  const x=setup({credentialProvider:()=>new Promise(resolve=>{release=resolve})})
  const coordinate=x.run.next(), expected=structuredClone(coordinate), pending=x.run.execute(coordinate)
  coordinate.turn_id='t999';release('SYNTHETIC_TEST_ONLY')
  const result=await pending
  assert.deepEqual(result.coordinate,expected)
  assert.deepEqual(x.run.snapshot().attempts[0].coordinate,expected)
})

test('invalid timer bounds fail before reservation or credentials',()=>{
  const bundle=freezeDevelopment({root,packageId:'invalid-runtime-'+(++serial),runtime:{...runtime,timeout_ms:2147483648},purpose:'synthetic-test'})
  assert.throws(()=>openGuardedRun({bundle,root,runId:'invalid-run-'+serial,mode:'offline',fetchImpl:()=>assert.fail('send'),credentialProvider:()=>assert.fail('secret')}),/runtime/)
})

test('journal corruption during credential lookup blocks fetch rather than rebuilding evidence',async()=>{
  let x
  x=setup({credentialProvider:()=>{
    appendFileSync(join(x.run.path,'events.jsonl'),'INVALID_JOURNAL_RECORD\n')
    return 'SYNTHETIC_TEST_ONLY'
  }})
  await assert.rejects(x.run.execute(x.run.next()))
  assert.equal(x.sent.length,0)
  assert.ok(readFileSync(join(x.run.path,'events.jsonl'),'utf8').endsWith('INVALID_JOURNAL_RECORD\n'))
  assert.throws(()=>x.run.snapshot())
})

test('ledger resume keeps original model history; no repair with frozen oracle history',async()=>{
  const x=setup(), first=x.run.next()
  await x.run.execute(first)
  const resumed=openGuardedRun({...x.options,resume:true})
  const next=resumed.next(), prepared=resumed.prepare(next)
  const plan=createPlan(data.planManifest)
  if(plan.blocks[0].track==='CLOSED-LOOP') {
    assert.ok(prepared.packet.messages.some(m=>m.role==='assistant'&&m.content==='Own answer 1'))
    assert.ok(!prepared.packet.messages.some(m=>m.role==='assistant'&&m.content.includes('reference_text')))
    assert.equal(prepared.assistantReasoning['a1'],'own reasoning')
  } else if(first.arm==='D'&&first.stage==='answer') assert.equal(prepared.compiled.body.diagnostic_answer,'Own answer 1')
  assert.equal(resumed.snapshot().budget.usedCalls,1)
  await resumed.execute(next)
  assert.equal(resumed.snapshot().budget.usedCalls,2)
})

test('preexisting reserved attempt cannot be silently resent after restart',async()=>{
  // A stalled sender leaves a durable reservation while another handle is opened.
  let release
  const y=setup({fetchImpl:()=>new Promise(resolve=>{release=resolve})})
  const pending=y.run.execute(y.run.next())
  await new Promise(resolve=>setImmediate(resolve))
  const resumed=openGuardedRun({...y.options,resume:true})
  assert.throws(()=>resumed.prepare(resumed.next()),/in.flight|interrupted/)
  release(response('finished once'));await pending
  assert.equal(resumed.snapshot().budget.usedCalls,1)
})

test('offline and live evidence cannot share a run; malformed runtime cannot create an execution',()=>{
  const x=setup()
  assert.throws(()=>openGuardedRun({...x.options,mode:'live',resume:true}),/live|purpose|transport/)
  assert.throws(()=>openGuardedRun({...x.options,bundle:{...x.bundle,expectedManifestHash:'0'.repeat(64)},runId:'other'}),/digest/)
  const manifest=JSON.parse(readFileSync(join(x.run.path,'manifest.json')))
  assert.equal(manifest.version,'gate2-run-v3');assert.equal(manifest.evidenceKind,'offline-boundary-test')
})

test('routing headers are archived before credentials and stay identical through the guarded send',async()=>{
  const bundle=freezeDevelopment({root,packageId:'routing-package-'+(++serial),runtime:{...runtime,routing_policy:{version:'opencode-conversation-v1',user_agent:'acmi-attribution-research/0.9.19'}},purpose:'synthetic-test'})
  let run,archived,sends=0
  run=openGuardedRun({bundle,root,runId:'routing-run-'+serial,mode:'offline',credentialProvider:()=>{
    const a=run.snapshot().attempts.at(-1)
    archived=JSON.parse(Buffer.from(a.chunks[0].bytes_base64,'base64'))
    assert.ok(archived.headers_sha256);assert.match(archived.headers['x-opencode-session'],/^acmi-/)
    return 'SYNTHETIC_TEST_ONLY'
  },fetchImpl:async(url,init)=>{
    sends++;assert.equal(init.headers['x-opencode-session'],archived.headers['x-opencode-session'])
    assert.equal(init.headers['user-agent'],archived.headers['user-agent']);return response('own response')
  }})
  assert.equal((await run.execute(run.next())).transport.outcome,'complete')
  const firstSession=archived.headers['x-opencode-session']
  assert.equal((await run.execute(run.next())).transport.outcome,'complete')
  assert.equal(archived.headers['x-opencode-session'],firstSession);assert.equal(sends,2)
})
