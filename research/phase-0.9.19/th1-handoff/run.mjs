import {readFileSync as read,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import * as p from './protocol.mjs';
import {inspectDsh} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/gate2/dsh-inspect.mjs';
import {serializeCompletion} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/gate2/transport.mjs';
import {routingHeadersFor} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/gate2/routing.mjs';
import {performDeadlineCompletion} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/gate2/deadline-transport.mjs';
import {hash} from '../../../worktrees/finite-mechanism/research/phase-0.9.19/protocol/contracts.mjs';
const root=dirname(fileURLToPath(import.meta.url)), ev=join(root,'evidence');
const jf=f=>JSON.parse(read(f,'utf8')), save=(f,x)=>writeFileSync(f,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const digest=x=>createHash('sha256').update(x).digest('hex'), h=homedir();
const paths={packageJson:join(h,'AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json'),profilePatch:join(h,'.dsh/profiles/web/cordis.patch.yml'),credentialsFile:join(h,'.dsh/.credentials.yaml')};
function signature(){
  const files=new Map();
  function walk(f){if(files.has(f))return;const b=read(f);files.set(f,digest(b));
    if(f.endsWith('.mjs'))for(const m of b.toString().matchAll(/from\s*['"](\.[^'"]+\.mjs)['"]/g))walk(resolve(dirname(f),m[1]));}
  for(const f of ['PLAN.md','protocol.mjs','run.mjs','tests.mjs'])walk(join(root,f));
  return Object.fromEntries([...files].map(([f,d])=>[relative(root,f).replaceAll('\\','/'),d]).sort(([a],[b])=>a.localeCompare(b)));
}
function routing(){
  const route=inspectDsh(paths);
  if(route.endpoint!=='https://opencode.ai/inference/go/v1/chat/completions'||route.provider!=='opencode-go'||route.model_alias!=='deepseek-v4.1-flash'||!route.credential.available||route.reasoning_effort!=='max')throw Error('route_mismatch');
  return route;
}
const manifest=join(root,'freeze.json');
if(process.argv[2]==='freeze'){
  const r=routing();save(manifest,{time:new Date().toISOString(),files:signature(),route:r.binding_sha256,model:r.model_alias,dsh:r.dsh_version,cap:24,retries:0});process.exit();
}
if(process.argv[2]!=='run')throw Error('use freeze or run');
const frozen=jf(manifest),route=routing(),freezeHash=digest(read(manifest));
if(!p.same(frozen.files,signature())||route.binding_sha256!==frozen.route||route.dsh_version!==frozen.dsh||existsSync(ev))throw Error('freeze_or_no_resume');
const {parseDocument}=createRequire(paths.packageJson)('yaml');
const secret=parseDocument(read(paths.credentialsFile,'utf8')).getIn(['refs',route.credential_ref])??process.env[route.credential_ref];
mkdirSync(ev);save(join(ev,'start.json'),{at:new Date().toISOString(),freezeHash,cap:24});
let n=0;
async function call(arm,variant,sys,messages){
  const label=`v${variant}-${arm}`,session=arm.startsWith('sender')?'sender':arm;
  const id=`${String(n+1).padStart(2,'0')}-${label}`,d=join(ev,id);
  if(n>=24||!p.same(frozen.files,signature()))throw Error('cap_or_freeze');
  const body={instructions:sys,messages:messages.map(({reasoning,...m})=>m),metadata:{protocol:'TH1'}};
  const serialized=JSON.stringify(body);
  const req=serializeCompletion({body,serialized,request_hash:hash(serialized)},{route,maxOutputTokens:4096,assistantReasoning:Object.fromEntries(messages.filter(m=>m.role==='assistant').map(m=>[m.source_id,m.reasoning])),routingHeaders:routingHeadersFor({policy:{version:'opencode-conversation-v1',user_agent:'acmi-attribution-research/0.9.19'},runId:'th1',freezeHash,coordinate:{family_id:String(variant),condition:'pilot',arm:session,track:'TH1'},sessionId:session})});
  if(req.bytes.length>131072)throw Error('input_limit');
  mkdirSync(d);writeFileSync(join(d,'request.json'),req.bytes,{flag:'wx'});
  save(join(d,'meta.json'),{at:new Date().toISOString(),request_hash:req.sha256,headers:req.headers});
  const record=({bytes,...x})=>appendFileSync(join(d,'events.jsonl'),JSON.stringify({...x,...(bytes?{bytes_base64:bytes.toString('base64')}:{})})+'\n');
  const res=await performDeadlineCompletion({request:req,credential:secret,timeoutMs:180000,maxResponseBytes:1048576,record,fetchImpl:(url,opts)=>{n++;record({kind:'fetch_invoked',ordinal:n});return fetch(url,{...opts,redirect:'error'});}});
  save(join(d,'result.json'),res);console.log(id,res.outcome,res.http_status,res.error_code??'');
  if(res.outcome!=='complete'||!res.evidence_complete)throw Error('transport_or_evidence_failure');
  return res;
}
const user=content=>[{source_id:'query',role:'user',content}];
async function variant(v){
  const s=p.story(v),hist=[],rows=[],out={},dir=join(ev,'assembly-'+v);
  mkdirSync(dir);
  for(const [i,[,note]] of s.notes.entries()){
    const id=i+1;hist.push({source_id:'u'+id,role:'user',content:note});
    const r=await call('sender-'+id,v,p.sender,hist),x=p.json(r.content);
    rows.push({id,user:note,answer:typeof x?.answer==='string'?x.answer:r.content,tag:x?.tag??null,global:x?.global??null});
    hist.push({source_id:'a'+id,role:'assistant',content:r.content,reasoning:r.reasoning});
  }
  save(join(dir,'rows.json'),rows);save(join(dir,'memory.json'),p.memory(rows));
  const mem=()=>jf(join(dir,'memory.json')), local=p.publicRows(p.project(rows,s.initialAt));
  const compact=await call('compress',v,p.compressor,user(JSON.stringify(local)));
  const packets={full:{transcript:p.publicRows(rows)},filtered:{transcript:local,memory:mem()},compact:{note:compact.content,memory:mem()},gold:{note:`Alder: print code ${s.a[0]} then ${s.a[1]}; seal ${s.sa}.`,memory:[{key:'footer',value:s.end,source:s.globalAt}]}};
  save(join(dir,'packets.json'),packets);
  for(const k of (v===0?['full','filtered','compact','gold']:['gold','compact','filtered','full'])){
    out[k]=(await call(k,v,p.receiver,user('Deliver the Alder print label. Evidence:\n'+JSON.stringify(packets[k])))).content;
  }
  for(const k of (v===0?['memory','empty']:['empty','memory'])){
    out[k]=(await call(k,v,p.transfer,user(JSON.stringify({memory:k==='memory'?mem():[]})))).content;
  }
  save(join(dir,'outputs.json'),out);
  const scores=p.grade(v,rows,mem(),packets,out);save(join(dir,'scores.json'),scores);return scores;
}
try{const scores=[];for(const v of [0,1])scores.push(await variant(v));
  save(join(ev,'end.json'),{at:new Date().toISOString(),calls:n,halt:null,scores});
}catch(e){const error=['cap_or_freeze','input_limit','transport_or_evidence_failure'].includes(e.message)?e.message:'execution_error';
  save(join(ev,'end.json'),{at:new Date().toISOString(),calls:n,halt:error});console.error(error);process.exitCode=1;}
