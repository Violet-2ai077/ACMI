import test from 'node:test'
import assert from 'node:assert/strict'
import { routingHeadersFor } from '../gate2/routing.mjs'
import { performCompletion } from '../gate2/transport.mjs'
import { hash } from '../protocol/contracts.mjs'

const policy={version:'opencode-conversation-v1',user_agent:'acmi-attribution-research/0.9.19'}
const c={family_id:'story',condition:'C3',arm:'A',track:'CLOSED-LOOP',turn_id:'t1',stage:'single'}
const args={policy,runId:'run',freezeHash:'a'.repeat(64),coordinate:c,sessionId:'s1'}

test('routing identity is stable per conversation and isolated across arms, sessions, runs and replay probes',()=>{
  const h=routingHeadersFor(args),session=h['x-opencode-session']
  assert.equal(h['user-agent'],policy.user_agent)
  assert.match(session,/^acmi-[a-f0-9]{48}$/)
  assert.equal(routingHeadersFor({...args,coordinate:{...c,turn_id:'t8'}})['x-opencode-session'],session)
  for(const change of [{runId:'other'},{sessionId:'s2'},{coordinate:{...c,arm:'B'}},{coordinate:{...c,condition:'C2'}}])assert.notEqual(routingHeadersFor({...args,...change})['x-opencode-session'],session)
  const d={...c,arm:'D',track:'FROZEN-REPLAY',stage:'answer'}
  const d1=routingHeadersFor({...args,coordinate:d})['x-opencode-session']
  assert.equal(routingHeadersFor({...args,coordinate:{...d,stage:'marker'}})['x-opencode-session'],d1)
  assert.notEqual(routingHeadersFor({...args,coordinate:{...d,turn_id:'t8'}})['x-opencode-session'],d1)
  assert.throws(()=>routingHeadersFor({...args,policy:{...policy,user_agent:'fake\r\nheader'}}))
})

test('transport sends and archives only the pinned safe routing headers, rejecting mutation before Fetch',async()=>{
  const headers=routingHeadersFor(args),body=Buffer.from('{}'),events=[]
  const request={endpoint:'https://synthetic.invalid/v1/chat/completions',bytes:body,sha256:hash(body),headers,headers_sha256:hash(headers)}
  let sent=0
  const opts={request,credential:'SYNTHETIC',timeoutMs:1000,maxResponseBytes:10000,record:e=>events.push(e),fetchImpl:async(url,init)=>{
    sent++;assert.equal(init.headers['x-opencode-session'],headers['x-opencode-session']);assert.equal(init.headers['user-agent'],policy.user_agent)
    return new Response('data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
  }}
  assert.equal((await performCompletion(opts)).outcome,'complete')
  assert.deepEqual(events.find(e=>e.kind==='request').headers,headers)
  assert.equal(JSON.stringify(events).includes('SYNTHETIC'),false)
  request.headers['x-opencode-session']='changed'
  await assert.rejects(performCompletion(opts),/header/)
  assert.equal(sent,1)
})
