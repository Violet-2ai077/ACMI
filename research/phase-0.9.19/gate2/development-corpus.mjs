import { hash, VERSION, CONDITIONS, slotsFor, OPS } from '../protocol/contracts.mjs'
import { buildInput } from '../context/build.mjs'

export const NARRATIVE_SHA256 = '7bff402b399587e65dec93bb7b50728a51179a76f1dea330477afd05bb656d49'
const copy = x => structuredClone(x)
const definitions = [
  ['manifest-continuity', 'continuity', 'none', 1,
    [['migration manifest', 'all six entries validated', 'migration manifest']],
    ['A','A','A','A','A','A','A','A'], ['2 batches are planned.','3 entries remain.','6 rollback notes are needed.','12 checksum values are required.','2 checksums per entry remain authorized.','The report says 6 validations are finished; acceptance is pending.','No acceptance items remain pending; Owner accepted completion.','No. The old checklist does not reopen the completed task.']],
  ['icon-invoice-switch', 'switching', 'same-session', 2,
    [['icon export','three icon sizes','icon export'],['invoice export verification','required invoice columns','invoice export verification']],
    ['A','B','B','B','B','B','B','A'], ['3 sizes are required.','2 columns are required.','The missing column is amount.','2 columns are absent.','No. Decimal amounts supersede integer cents.','No. Neither missing column has been verified.','3 required columns passed.','1 icon export remains: 64 pixels.']],
  ['atlas-audio-parallel', 'parallel', 'none', 2,
    [['atlas captions','captions for four panels','atlas captions'],['audio normalization','normalization of five clips','audio normalization']],
    ['AB','AB','B','A','B','B','AB','AB'], ['4 panels and 5 clips.','3 captions remain; no audio execution occurred.','3 clips still need normalization.','4 alt-text entries are needed.','Neither target is authorized; the decision is unresolved.','No. The decision does not verify the previous clips.','Only atlas captions can be completed; audio verification remains pending.','Both tasks are complete. Keep their identities separate; no merge.']],
  ['release-accessibility-create', 'creation', 'same-session', 1,
    [['release checklist','three release checks','release checklist'],['accessibility audit','audit of two screens','accessibility audit']],
    ['A','B','B','B','B','B','B','A'], ['3 release checks are pending.','2 screens are in the audit.','1 screen still needs keyboard testing.','2 contrast checks are pending.','No. Planning did not complete an acceptance item.','An actual contrast measurement is needed.','2 screens met both criteria.','3 original release checks remain pending.']],
  ['telemetry-branch-merge', 'branch-merge', 'handoff', 1,
    [['telemetry investigation','coverage across four services','telemetry investigation'],['metrics-investigation','two metrics endpoints','metrics-investigation'],['traces-investigation','three trace paths','traces-investigation'],['coverage-report task','verified report covering five checks','coverage-report task']],
    ['A','B','C','BC','BC','D','D','A'], ['4 services remain unverified.','2 endpoints are in scope.','3 paths are in scope.','1 metrics endpoint and 2 trace paths remain.','3 branch checks remain.','3 checks remain unverified.','No. A draft and plan do not complete the report.','4 services remain unverified against the original acceptance.']],
  ['delta-ambiguity', 'ambiguity', 'handoff', 2,
    [['Delta release smoke test','four release checks passed','Delta release smoke test'],['Delta dashboard review','three panels reviewed','Delta dashboard review']],
    ['A','B','B','B','B','B','B','A'], ['4 release checks passed.','3 panels remain.','2 dashboard panels remain.','No. The note cannot establish dashboard completion.','2 panels remain pending.',"The dashboard's 2 panels remain pending. The forwarded instruction is unresolved.",'3 dashboard panels passed.','1 current-build release check failed; reopen the release task.']]
]
const words = { 1:'one', 2:'two', 3:'three', 4:'four', 5:'five', 6:'six', 12:'twelve' }
const answerGroups = [
  [['2'],['3'],['6'],['12'],['2'],['6'],['no|none|zero|0'],['no|not|remain.*complete']],
  [['3'],['2'],['amount'],['2'],['no|not|supersede'],['no|neither|not'],['3'],['1']],
  [['4','5'],['3','no|not'],['3'],['4'],['neither|unresolved|not.*authoriz'],['no|not'],['atlas','pending|not|only'],['both|two|2','separate|no merge|not.*merge']],
  [['3'],['2'],['1'],['2'],['no|not'],['contrast','measurement|measure|test'],['2'],['3']],
  [['4'],['2'],['3'],['1','2'],['3'],['3'],['no|not'],['4']],
  [['4'],['3'],['2'],['no|not|cannot'],['2'],['pending','unresolved|insufficient|cannot'],['3'],['1']]
]
const switches = { 1: {2:'A',8:'B'}, 2: {4:'B',5:'A'}, 3: {8:'B'}, 4: {8:'D'}, 5: {2:'A',8:'B'} }

function parseNarrative(text) {
  if (hash(text) !== NARRATIVE_SHA256) throw new Error('unreviewed narrative source digest')
  return text.split(/^Family: /m).slice(1).map(part => {
    const id = part.split('.')[0]
    const turns = [...part.matchAll(/^\| (t[1-8]) \| (.*?) \|/gm)].map(([, turn_id, quoted]) => {
      const contents = [...quoted.matchAll(/"([^"]+)"/g)].map(m => m[1])
      return { turn_id, messages: contents.map((content, i) => ({ role: 'user', source_id: `u${turn_id.slice(1)}${contents.length > 1 ? String.fromCharCode(97 + i) : ''}`, content })) }
    })
    if (turns.length !== 8) throw new Error('narrative turn count')
    return { id, turns }
  })
}

// These timelines are authored labels, not predictions from an evaluator/reducer.
function updateTimeline(family, turn, memory, r) {
  const m = letter => memory[letter]
  const criterion = (ref, state = 'pending', evidence = []) => ({ ref, state, evidence })
  const work = (ref, state = 'planned', completion_basis = 'none', evidence = []) => ({ ref, state, completion_basis, evidence })
  const init = (letter, refs) => {
    m(letter).lifecycle_status = 'running'
    m(letter).criteria = refs.map(ref => criterion(ref))
    m(letter).work_items = refs.map(ref => work(ref))
  }
  const completeItem = (letter, index, ev, basis = 'observed') => {
    const item = m(letter).work_items[index]
    item.state = 'completed'; item.completion_basis = basis; item.evidence = [ev]
  }
  const accept = (letter, ev) => {
    m(letter).lifecycle_status = 'completed'
    for (const c of m(letter).criteria) if (c.state !== 'superseded') { c.state = 'satisfied'; c.evidence = [ev] }
    for (const w of m(letter).work_items) if (!['superseded','cancelled'].includes(w.state)) { w.state = 'completed'; w.completion_basis = 'accepted'; w.evidence = [ev] }
    m(letter).open_conflicts = []
  }
  const decision = (topic, selected, supersedes, evidence, state = 'active') => ({ topic_ref: topic, selected_ref: selected, supersedes_refs: supersedes, state, evidence })
  if (family === 0) {
    if (turn === 1) init('A', [r(1, 'validate six entries in two batches of three')])
    if (turn === 2) m('A').work_items = [work(r(2, 'first batch of three entries'), 'completed', 'observed', [r(2, 'the operator validated the first batch of three entries')]), work(r(2, 'second batch'))]
    if (turn === 3) {
      m('A').criteria[0].state = 'superseded'
      m('A').criteria.push(criterion(r(3, 'all six entries must pass validation')), criterion(r(3, 'have a rollback note')))
      m('A').work_items.push(work(r(3, 'have a rollback note')))
    }
    if (turn === 4) {
      m('A').decisions = [decision(r(4, 'checksums per entry'), r(4, 'two checksums per entry'), [r(4, 'earlier one-checksum choice')], [r(4)])]
      m('A').criteria.push(criterion(r(4, 'two checksums per entry')))
      m('A').work_items.push(work(r(4, 'two checksums per entry')))
    }
    if (turn === 6) for (const i of [1,2]) Object.assign(m('A').work_items[i], { state:'ready', completion_basis:'reported', evidence:[r(6)] })
    if (turn === 7) accept('A', r(7))
  } else if (family === 1) {
    if (turn === 1) init('A', ['16','32','64'].map(q => r(1,q)))
    if (turn === 2) init('B', ['invoice_id','amount'].map(q => r(2,q)))
    if (turn === 3) { completeItem('B',0,r(3,'contains invoice_id')); Object.assign(m('B').criteria[0], {state:'satisfied',evidence:[r(3,'contains invoice_id')]}) }
    if (turn === 4) { m('B').criteria.push(criterion(r(4,'currency'))); m('B').work_items.push(work(r(4,'currency'))) }
    if (turn === 5) m('B').decisions = [decision(r(5,'invoice output'),r(5,'decimal amounts'),[r(5,'old integer-cents choice')],[r(5)])]
    if (turn === 7) accept('B',r(7))
    if (turn === 8) for (const i of [0,1]) { completeItem('A',i,r(8),'accepted'); Object.assign(m('A').criteria[i], {state:'satisfied',evidence:[r(8)]}) }
  } else if (family === 2) {
    if (turn === 1) { init('A',[r(1,'four panels needing captions')]); init('B',[r(1,'five clips needing normalization')]) }
    if (turn === 2) m('A').work_items = [work(r(2,'first panel caption'),'completed','accepted',[r(2,'Owner accepts the first panel caption')]), work(r(1,'four panels needing captions'),'running')]
    if (turn === 3) m('B').work_items = [work(r(3,'two of five clips'),'completed','observed',[r(3,'has normalized two of five clips')]), work(r(1,'five clips needing normalization'),'running')]
    if (turn === 4) { m('A').criteria.push(criterion(r(4,'an alt-text entry for every panel'))); m('A').work_items.push(work(r(4,'an alt-text entry for every panel'))) }
    if (turn === 5) {
      m('B').decisions = [decision(r(5,'loudness target'),null,[],[r(5)],'disputed')]
      m('B').open_conflicts = [{ refs:[r(5,'-16'),r(5,'-14 LUFS')], resolution_ref:null }]
    }
    if (turn === 6) {
      m('B').decisions = [decision(r(5,'loudness target'),r(6,'-16 LUFS'),[],[r(6)])]
      m('B').open_conflicts = []
      m('B').criteria.push(criterion(r(6,'-16 LUFS'))); m('B').work_items.push(work(r(6,'rechecked against it')))
    }
    if (turn === 7) accept('A',r(7))
    if (turn === 8) accept('B',r(8))
  } else if (family === 3) {
    if (turn === 1) init('A',['packaging','signing','rollback'].map(q=>r(1,q)))
    if (turn === 2) init('B',[r(2,'audit of two screens')])
    if (turn === 3) m('B').work_items = [work(r(3,'first screen'),'completed','observed',[r(3,'first screen passed keyboard navigation')]),work(r(3,'second has not been checked'))]
    if (turn === 4) { m('B').criteria[0].state='superseded'; m('B').criteria.push(criterion(r(4,'both screens must pass keyboard navigation')),criterion(r(4,'AND contrast checks'))); m('B').work_items.push(work(r(4,'AND contrast checks'))) }
    if (turn === 7) accept('B',r(7))
  } else if (family === 4) {
    if (turn === 1) init('A',[r(1,'coverage verified across four services')])
    if (turn === 2) init('B',[r(2,'two metrics endpoints')])
    if (turn === 3) init('C',[r(3,'three trace paths')])
    if (turn === 4) {
      m('B').work_items=[work(r(4,'one of two endpoints verified'),'completed','observed',[r(4,'one of two endpoints verified')]),work(r(2,'two metrics endpoints'),'running')]
      m('C').work_items=[work(r(4,'one of three paths verified'),'completed','observed',[r(4,'one of three paths verified')]),work(r(3,'three trace paths'),'running')]
    }
    if (turn === 6) {
      for (const letter of ['B','C']) { m(letter).lifecycle_status='superseded'; m(letter).criteria.forEach(c=>{c.state='superseded'}); m(letter).work_items.filter(w=>w.state!=='completed').forEach(w=>{w.state='superseded'}) }
      init('D',[r(6,'verified report covering their five checks')])
      m('D').work_items=[copy(m('B').work_items[0]),copy(m('C').work_items[0]),work(r(6,'remaining checks')),work(r(6,'verified report'))]
    }
    if (turn === 7) Object.assign(m('D').work_items[3],{state:'running',completion_basis:'reported',evidence:[r(7,'drafted the report')]})
  } else if (family === 5) {
    if (turn === 1) { init('A',[r(1,'all four release checks passed')]); accept('A',r(1,'Owner accepted the Delta release smoke test')) }
    if (turn === 2) init('B',[r(2,'three panels need review')])
    if (turn === 3) m('B').work_items=[work(r(3,'first panel'),'completed','observed',[r(3,'first panel passed review')]),work(r(3,'two have not been reviewed'))]
    if (turn === 7) accept('B',r(7))
    if (turn === 8) {
      m('A').lifecycle_status='blocked'; m('A').criteria[0].state='superseded'
      m('A').criteria.push(criterion(r(8,'new build'),'failed',[r(8,'one of four checks failed')]))
      m('A').work_items.push(work(r(8,'authoritative rerun'),'failed','observed',[r(8,'one of four checks failed')]))
    }
  }
}

const supports = [
  [0,'SM1','A',2,'change'],[0,'SM1','A',5,'retain'],[0,'SM2','A',3,'change'],[0,'SM2','A',5,'retain'],
  [0,'SM3','A',4,'change'],[0,'SM3','A',5,'retain'],[0,'SM4','A',2,'change'],[0,'SM4','A',5,'retain'],[0,'SM6','A',7,'change'],[0,'SM6','A',8,'retain'],
  [1,'SM1','B',7,'change'],[1,'SM1','B',6,'retain'],[1,'SM2','B',4,'change'],[1,'SM2','B',6,'retain'],
  [1,'SM3','B',5,'change'],[1,'SM3','B',6,'retain'],[1,'SM4','A',8,'change'],[1,'SM4','B',6,'retain'],[1,'SM6','B',7,'change'],[1,'SM6','B',6,'retain'],
  [1,'SM5','A',8,'change'],[3,'SM5','A',8,'retain'],[4,'SM5','A',8,'retain'],[5,'SM5','A',8,'change'],
  [2,'SM3','B',5,'change'],[2,'SM3','B',6,'change'],[2,'SM4','B',3,'change'],[3,'SM2','B',4,'change']
]

export function buildDevelopmentCorpus(narrative) {
  const parsed = parseNarrative(narrative), publicFamilies=[], oracleFamilies=[], planned=[]
  for (const [fi, def] of definitions.entries()) {
    const [id,category,recovery,initialCount,taskDefs,targets,answers] = def, source=parsed[fi]
    if (source.id !== id) throw new Error('narrative family mismatch')
    const tasks=Object.fromEntries(taskDefs.map(([objective,acceptance,anchor],i)=>[String.fromCharCode(65+i),{
      task_id:`a${fi+1}000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,objective,acceptance:[acceptance],initial_status:'planned',anchor
    }]))
    const letters=Object.keys(tasks), initialLetters=letters.slice(0,initialCount)
    const historical=initialLetters.map(l=>`Historical task ${tasks[l].task_id}. Objective: ${tasks[l].objective}. Acceptance: ${tasks[l].acceptance[0]}. Status: planned.`).join('\n')
    const catalog=initialLetters.map(l=>({task_id:tasks[l].task_id,objective:tasks[l].objective,acceptance:tasks[l].acceptance}))
    const s={family_id:id,split:'dev',catalog,initial_active:(category==='parallel'?initialLetters:['A']).map(l=>tasks[l].task_id),
      initial:{C1:[{role:'system',source_id:'h0',content:historical}],C2:[{role:'system',source_id:'h0',content:historical}],C3:[]},
      turns:source.turns.map((t,i)=>({...t,category,difficulty:i<2?'simple':i<4?'medium':'hard',themes:[],identity_visibility:'identity_present',
        session_id:recovery==='handoff'&&i>=4?'s2':'s1',agent_id:recovery==='handoff'&&i>=4?'agent2':'agent1'})),reference_history:{C1:[],C2:[],C3:[]}}
    const f={family_id:id,canonical_tasks:letters.map(l=>{const {anchor,...t}=tasks[l];return t}),oracle:{C1:{},C2:{},C3:{}},state_opportunities:[],
      recovery_points:recovery==='none'?[]:[{turn_id:recovery==='handoff'?'t5':'t8',kind:recovery}]}
    for (const condition of CONDITIONS) {
      const memory={}, priorBirths=[]
      const r=(n,quote)=>{
        const sid=typeof n==='number'?`u${n}`:n
        const msg=s.turns.flatMap(t=>t.messages).find(m=>m.source_id===sid)??s.initial[condition].find(m=>m.source_id===sid)
        const q=quote??msg?.content
        if (!msg || !q || msg.content.indexOf(q)<0 || msg.content.indexOf(q)!==msg.content.lastIndexOf(q)) throw new Error(`missing/ambiguous authored evidence ${id}/${condition}/${sid}/${q}`)
        return {source_id:sid,quote:q}
      }
      const createMemory=(l,ref,criteria=[])=>({task_id:tasks[l].task_id,lifecycle_status:'planned',objective_refs:[ref],criteria,work_items:[],decisions:[],open_conflicts:[]})
      if(condition!=='C3') for(const l of initialLetters) memory[l]=createMemory(l,r('h0',tasks[l].objective),[{ref:r('h0',tasks[l].acceptance[0]),state:'pending',evidence:[]}])
      for(const [i,t] of s.turns.entries()) {
        const n=i+1, previous=i?f.oracle[condition][`t${i}`]:null, selected=[...targets[i]], births=[], actions=[]
        for(const l of selected) if(!memory[l]) {
          memory[l]=createMemory(l,r(n,tasks[l].anchor))
          const branch=fi===4&&['B','C'].includes(l), merge=fi===4&&l==='D', op=branch?'BRANCH':merge?'MERGE':'CREATE'
          const a={op,...(merge?{source_task_ids:['B','C'].map(k=>tasks[k].task_id),target_task_id:tasks[l].task_id}:{task_id:tasks[l].task_id}),
            ...(branch?{parent_task_id:tasks.A.task_id}:{}),objective:tasks[l].objective,acceptance:copy(tasks[l].acceptance)}
          actions.push(a);births.push({unit_id:t.messages[0].source_id,op,occurrence:births.length,task_id:tasks[l].task_id})
        }
        if(!actions.length) actions.push(switches[fi]?.[n]?{op:'SWITCH',from_task_ids:[tasks[switches[fi][n]].task_id],to_task_ids:selected.map(l=>tasks[l].task_id)}:{op:'CONTINUE',task_ids:selected.map(l=>tasks[l].task_id)})
        updateTimeline(fi,n,memory,r)
        const status_updates=Object.values(memory).flatMap(m=>{
          const before=previous?.task_memory.find(old=>old.task_id===m.task_id)?.lifecycle_status??'planned'
          return before===m.lifecycle_status?[]:[{task_id:m.task_id,from:before,to:m.lifecycle_status,evidence:[r(t.messages[0].source_id)],status:'proposed'}]
        })
        const decisions=t.messages.map((msg,j)=>{
          const fullUnresolved=fi===5&&n===4&&j===1, partial=fi===5&&n===6
          return {decision_id:`d${j+1}`,unit_id:msg.source_id,actions:fullUnresolved?[{op:'UNRESOLVED'}]:[...copy(actions),...(partial?[{op:'UNRESOLVED'}]:[])],
            task_ids:fullUnresolved?[]:selected.map(l=>tasks[l].task_id),
            resolved_scope_quotes:fullUnresolved?[]:[partial?"Keep the Delta dashboard's two panels pending.":msg.content],
            unresolved_scope_quotes:fullUnresolved?[msg.content]:partial?["'finish it'"]:[],
            unresolved:fullUnresolved||partial?{reason:'ambiguous_reference',candidate_task_ids:initialLetters.map(l=>tasks[l].task_id),missing_evidence:'Task-specific subject, sender or thread evidence.'}:null,
            evidence:[r(msg.source_id)],self_reported_confidence:'not_reported'}
        })
        const active=Object.values(memory).filter(m=>['running','blocked','unresolved'].includes(m.lifecycle_status)||selected.some(l=>tasks[l].task_id===m.task_id)).map(m=>m.task_id)
        const answersForUnits=t.messages.map((msg,j)=>{
          const text=j===1?'The originating task is unresolved; insufficient subject or sender evidence.':answers[i]
          const groups=j===1?['unresolved|insufficient|cannot']:answerGroups[fi][i]
          const patterns=groups.map(g=>words[g]?`\\b(?:${g}|${words[g]})\\b`:`(?:${g})`)
          return {unit_id:msg.source_id,task_ids:decisions[j].task_ids,contains:[j===1?'unresolved':(text.match(/\d+/)?.[0]??text.split(/[ .]/)[0])],excludes:[],reference_text:text,assertion:{all:patterns}}
        })
        const snapshot=copy(Object.values(memory)), dormant=selected.some(l=>{let last=-1;for(let k=0;k<i;k++)if(targets[k].includes(l))last=k;return last>=0&&i-last-1>=5})
        const g={identity_visibility:births.length?(previous?.known_tasks.length?'identity_partial':'identity_absent'):'identity_present',decisions,task_memory:snapshot,proposed_active_task_ids:active,
          focus_task_id:selected.length===1?tasks[selected[0]].task_id:null,status_updates,births,prior_births:copy(priorBirths),
          forbidden:letters.filter(l=>!selected.includes(l)).map(l=>tasks[l].task_id),answer:answersForUnits,
          changed:previous?JSON.stringify(previous.task_memory)!==JSON.stringify(snapshot):true,dormant,known_tasks:snapshot.map(m=>m.task_id),
          negative_cases:decisions.map(d=>({unit_id:d.unit_id,forbidden_task_ids:letters.map(l=>tasks[l].task_id).filter(id=>!d.task_ids.includes(id)),
            forbidden_operations:OPS.filter(op=>!d.actions.some(a=>a.op===op)),forbid_forced_unresolved_assignment:d.unresolved!==null,
            no_actual_completion: snapshot.filter(m=>m.lifecycle_status!=='completed').map(m=>m.task_id)}))}
        f.oracle[condition][t.turn_id]=g
        const packet=buildInput(s,s.reference_history[condition],{condition,arm:'A',turnId:t.turn_id})
        const envelope=renderOracle(f,packet)
        s.reference_history[condition].push({turn_id:t.turn_id,source_id:`a${n}`,role:'assistant',content:JSON.stringify(envelope),reasoning_content:'',reference_kind:'authored-not-model-generated'})
        priorBirths.push(...births.map(b=>({source_id:`a${n}`,turn_id:t.turn_id,...b})))
      }
      for(const [family,theme,l,n,kind]of supports) if(family===fi) {
        f.state_opportunities.push({condition,theme,kind,task_id:tasks[l].task_id,previous_turn_id:`t${n-1}`,turn_id:`t${n}`,...(theme==='SM5'?{last_active_turn_id:'t1'}:{})})
        if(!s.turns[n-1].themes.includes(theme))s.turns[n-1].themes.push(theme)
      }
    }
    publicFamilies.push(s);oracleFamilies.push(f)
    planned.push({id,category,recovery,turns:s.turns.map(t=>({id:t.turn_id,difficulty:t.difficulty})),probes:['t2','t8']})
  }
  return {planManifest:{split:'dev',seed:'owner-delegated-development-r1',families:planned},
    publicCorpus:{version:'gate2-public-corpus-v1',split:'dev',families:publicFamilies},oracleCorpus:{version:'gate2-oracle-corpus-v1',split:'dev',families:oracleFamilies}}
}

export function renderOracle(family, p) {
  const g=family.oracle[p.context_condition][p.turn_id], mapping={}
  for(const [turn,old]of Object.entries(family.oracle[p.context_condition])) {
    if(Number(turn.slice(1))>Number(p.turn_id.slice(1)))continue
    old.births.forEach((b,i)=>{mapping[b.task_id]=slotsFor(p.family_id,turn)[i]})
  }
  const rename=v=>typeof v==='string'?(mapping[v]??v):Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rename(x)])):v
  return rename({answer:g.answer.map((a,i)=>({block_id:`b${i+1}`,decision_ids:[g.decisions[i].decision_id],task_ids:a.task_ids,
    unresolved_reason:g.decisions[i].unresolved?.reason??null,text:a.reference_text})),work_state:{schema_version:VERSION,turn_id:p.turn_id,base_state_id:p.base_state_id,
    decisions:g.decisions,proposed_active_task_ids:g.proposed_active_task_ids,focus_task_id:g.focus_task_id,status_updates:g.status_updates,task_memory:g.task_memory}})
}
