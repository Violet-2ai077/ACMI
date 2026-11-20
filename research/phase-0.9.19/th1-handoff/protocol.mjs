export const sender = 'Help the operator with each note: acknowledge the concrete change in a short normal sentence. In the SAME reply give only JSON {"answer":"...","tag":"...","global":[{"key":"...","value":"..."}]}. Invent a stable short nonempty tag per distinct job; reuse it whenever that job returns. Use UNRESOLVED if ambiguous. A workspace-wide persistent preference, and only such a preference, merits a global write on the turn introducing or changing it. Use concise lowercase English keys, e.g. footer for the workspace footer, and literal values. Otherwise global is []. Never promote job-specific codes or seals.';
export const compressor = 'Compact the supplied job transcript into a short handoff note (plain text). Preserve the ordered revisions of the print code, the job seal, and the latest operative decision; discard repeated acknowledgements. Workspace memory is supplied separately to the receiver. Do not infer missing facts.';
export const receiver = 'Use only the supplied evidence to fulfill the job. Output only JSON {"trail":["code1","code2"],"print_line":"latestCode/seal/footer"}. trail lists the actual print code changes from first to last, no duplicate acknowledgements. print_line is a single label ready to print, literal values separated by slash without spaces. Use UNKNOWN for each unavailable value. Distinguish global footer updates from job-local rules.';
export const transfer = 'A fresh print job called Cairn has just been opened, with no local details set. Using only the supplied workspace memory, prepare its defaults. Return only JSON {"footer":"...","seal":"..."}. Use UNKNOWN for each value not established for this job. Do not invent values.';
export function story(v) {
  const [a,b]=v===0?[['K14','N72'],['P83','J26']]:[['P83','J26'],['K14','N72']];
  const [old,end]=v===0?['M16','M94']:['M94','M16'];
  const [sa,sb]=v===0?['S58','S31']:['S31','S58'];
  const a1=['A',`Open the Alder print job. Start its print code at ${a[0]}; its seal is ${sa}, only for this job. Set the standing footer on every workspace job to ${old}.`];
  const b1=['B',`Open the Birch print job. Its print code starts at ${b[0]}; stamp ${sb} on this job only.`];
  const a2=['A',`On the Alder proof replace its earlier print code with ${a[1]}. Retain its seal. Confirm the change.`];
  const b2=['B',`For Birch replace the print code with ${b[1]}. Separately the standing footer on ALL workspace jobs is now ${end}, superseding the earlier one. Leave the local seal alone.`];
  const ack=['B','For that Birch proof, confirm its current code and seal for the operator. This is a readback, not a change.'];
  const notes=v===0?[a1,b1,a2,b2,ack]:[b1,a1,b2,a2,ack];
  return {notes, a,sa,end, globalAt:notes.indexOf(b2)+1, old, initialAt:notes.indexOf(a1)+1};
}
export function json(s){try{return JSON.parse(s)}catch{return null}}
export const validTag=t=>typeof t==='string'&&t.trim()!==''&&t!=='UNRESOLVED';
export function project(rows, opener){
  const tag=rows[opener-1]?.tag;
  return validTag(tag)?rows.filter(r=>r.tag===tag):[];
}
export const publicRows=rows=>rows.map(({id,user,answer})=>({id,user,answer}));
export function memory(rows){
  const map=new Map();
  for(const r of rows)for(const w of (Array.isArray(r.global)?r.global:[])){
    if(typeof w?.key==='string'&&typeof w?.value==='string')map.set(w.key,{key:w.key,value:w.value,source:r.id});
  }
  return [...map.values()];
}
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const bytes=v=>Buffer.byteLength(JSON.stringify(v));
export function grade(v,rows,store,packets,outputs){
  const s=story(v), ids=k=>s.notes.flatMap(([j],i)=>j===k?[i+1]:[]);
  const chains=Object.fromEntries(['A','B'].map(k=>{const expected=ids(k), actual=project(rows,expected[0]).map(r=>r.id);
    return [k,{expected,actual,purity:actual.length?actual.filter(i=>expected.includes(i)).length/actual.length:null,coverage:actual.filter(i=>expected.includes(i)).length/expected.length,exact:same(actual,expected)}]}));
  const wanted=[{key:'footer',value:s.end,source:s.globalAt}];
  const writes=rows.every(r=>same(r.global?.map?.(x=>[x?.key,x?.value]),r.id===s.initialAt?[['footer',s.old]]:r.id===s.globalAt?[['footer',s.end]]:[]));
  const arms=Object.fromEntries(['full','filtered','compact','gold'].map(k=>{
    const out=json(outputs[k]), trail=same(out?.trail,s.a), delivery=out?.print_line===[s.a[1],s.sa,s.end].join('/');
    return [k,{trail,delivery,pass:trail&&delivery,context_bytes:bytes(packets[k])}]}));
  const probe=(k,footer)=>{const x=json(outputs[k]);return x?.footer===footer&&x?.seal==='UNKNOWN'};
  const transfer_ok=probe('memory',s.end),no_memory_ok=probe('empty','UNKNOWN');
  const global_exact=same(store.map(x=>[x.key,x.value,x.source]),wanted.map(x=>[x.key,x.value,x.source]));
  const smaller=arms.compact.context_bytes<arms.filtered.context_bytes;
  return {chains,writes,global_exact,arms,smaller,transfer_ok,no_memory_ok,local_pass:Object.values(chains).every(x=>x.exact)&&writes&&global_exact&&arms.filtered.pass&&arms.compact.pass&&smaller&&transfer_ok&&no_memory_ok};
}
