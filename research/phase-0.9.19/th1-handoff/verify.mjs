// Offline evidence audit; no credential access or model calls.
import {readFileSync as read,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCompletionDecoder} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/gate2/transport.mjs';
import * as p from './protocol.mjs';
const root=dirname(fileURLToPath(import.meta.url)),ev=join(root,'evidence'),jf=f=>JSON.parse(read(f,'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const freeze=jf(join(root,'freeze.json')),start=jf(join(ev,'start.json')),end=jf(join(ev,'end.json'));
assert.equal(start.freezeHash,sha(read(join(root,'freeze.json'))));
for(const [f,h] of Object.entries(freeze.files))assert.equal(sha(read(resolve(root,f))),h);
assert.equal(end.halt,null);assert.equal(end.calls,24);
const dirs=readdirSync(ev).filter(f=>/^\d\d-v/.test(f)).sort();
assert.equal(dirs.length,end.calls);
const items=new Map(), sessions=new Set();let tokens=0,ms=0;
for(const [i,f] of dirs.entries()){
  const d=join(ev,f),req=jf(join(d,'request.json')),r=jf(join(d,'result.json')),meta=jf(join(d,'meta.json'));
  const events=read(join(d,'events.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(events.filter(e=>e.kind==='fetch_invoked').map(e=>e.ordinal),[i+1]);
  assert.equal(events.filter(e=>e.kind==='terminal').length,1);
  const decoder=createCompletionDecoder(); for(const w of events.filter(e=>e.kind==='wire'))decoder.push(Buffer.from(w.bytes_base64,'base64'));
  for(const [k,v] of Object.entries(decoder.finish()))assert.deepEqual(v,r[k]);
  assert.equal(r.response_model,freeze.model);assert.equal(r.evidence_complete,true);assert.equal(r.outcome,'complete');
  assert.equal(meta.request_hash,sha(read(join(d,'request.json'))));
  const session=meta.headers['x-opencode-session'];sessions.add(session);tokens+=r.usage.total_tokens;ms+=r.latency.total_ms;
  items.set(f.slice(3),{req,r,session});
}
assert.equal(sessions.size,16);
for(const v of [0,1]){
  const item=k=>items.get('v'+v+'-'+k),dir=join(ev,'assembly-'+v);
  const rows=jf(join(dir,'rows.json')),packets=jf(join(dir,'packets.json')),out=jf(join(dir,'outputs.json')),mem=jf(join(dir,'memory.json')),s=p.story(v);
  const hist=[];
  for(const [i,row] of rows.entries()){
    const {req,r,session}=item('sender-'+(i+1));
    assert.equal(session,item('sender-1').session);assert.equal(row.user,s.notes[i][1]);
    hist.push({role:'user',content:row.user});assert.deepEqual(req.messages.slice(2),hist);
    hist.push({role:'assistant',content:r.content,reasoning_content:r.reasoning});
    const got=p.json(r.content);
    assert.deepEqual(row,{id:i+1,user:s.notes[i][1],answer:typeof got?.answer==='string'?got.answer:r.content,tag:got?.tag??null,global:got?.global??null});
  }
  assert.deepEqual(mem,p.memory(rows));
  const target=p.publicRows(p.project(rows,s.initialAt));assert.deepEqual(packets.full,{transcript:p.publicRows(rows)});
  assert.deepEqual(item('compress').req.messages.slice(2),[{role:'user',content:JSON.stringify(target)}]);
  assert.deepEqual(packets.filtered,{transcript:target,memory:mem});
  assert.deepEqual(packets.compact,{note:item('compress').r.content,memory:mem});
  for(const k of ['full','filtered','compact','gold','memory','empty']){
    const {req,r}=item(k);const isTransfer=['memory','empty'].includes(k);
    assert.equal(req.messages[0].content,isTransfer?p.transfer:p.receiver);
    const content=isTransfer?JSON.stringify({memory:k==='memory'?mem:[]}):'Deliver the Alder print label. Evidence:\n'+JSON.stringify(packets[k]);
    assert.deepEqual(req.messages.slice(2),[{role:'user',content}]);assert.equal(r.content,out[k]);
  }
  assert.deepEqual(p.grade(v,rows,mem,packets,out),end.scores[v]);
}
console.log(JSON.stringify({calls:end.calls,wire_redecodes:items.size,session_keys:sessions.size,verified_scores:end.scores.map(x=>x.local_pass),total_tokens:tokens,total_request_ms:Math.round(ms)},null,2));
