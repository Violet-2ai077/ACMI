import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from './protocol.mjs';
function fixture(v){
  const s=p.story(v),rows=s.notes.map(([k,user],i)=>({id:i+1,user,answer:'ok',tag:k,global:i+1===s.initialAt?[{key:'footer',value:s.old}]:i+1===s.globalAt?[{key:'footer',value:s.end}]:[]}));
  const mem=p.memory(rows), local=p.publicRows(p.project(rows,s.initialAt));
  const packets={full:p.publicRows(rows),filtered:{transcript:local,memory:mem},compact:{note:'short',memory:mem},gold:{}};
  const output=JSON.stringify({trail:s.a,print_line:[s.a[1],s.sa,s.end].join('/')});
  const out=Object.fromEntries(['full','filtered','compact','gold'].map(k=>[k,output]));
  out.memory=JSON.stringify({footer:s.end,seal:'UNKNOWN'});out.empty=JSON.stringify({footer:'UNKNOWN',seal:'UNKNOWN'});
  return {s,rows,mem,packets,out,grade:()=>p.grade(v,rows,mem,packets,out)};
}
for(const v of [0,1]){
  test('valid '+v,()=>{const f=fixture(v);assert.equal(f.grade().local_pass,true);assert.equal(f.packets.filtered.transcript.some(x=>x.user.includes(f.s.end)),false);});
  test('collision and dropped tags '+v,()=>{const f=fixture(v);f.rows.forEach(r=>r.tag='same');assert.equal(f.grade().chains.A.purity,2/5);f.rows[f.s.initialAt-1].tag=null;assert.equal(f.grade().chains.A.coverage,0);assert.equal(f.grade().local_pass,false);});
  test('wrong revision order and stale decision '+v,()=>{const f=fixture(v);f.out.compact=JSON.stringify({trail:[...f.s.a].reverse(),print_line:[f.s.a[0],f.s.sa,f.s.end].join('/')});assert.equal(f.grade().arms.compact.trail,false);assert.equal(f.grade().arms.compact.delivery,false);});
  test('leak not silently fixed '+v,()=>{const f=fixture(v);f.rows.at(-1).global=[{key:'seal',value:'local'}];assert.equal(p.memory(f.rows).length,2);assert.equal(f.grade().writes,false);f.mem.push({key:'seal',value:'local'});assert.equal(f.grade().global_exact,false);f.out.memory='{"footer":"ok","seal":"local"}';assert.equal(f.grade().transfer_ok,false);});
}
