export const VERSION = 'FM1-20261116';
export const ref = (source_id, quote) => ({ source_id, quote });
export const uuid = n => `f0190000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = x => structuredClone(x);
const work = (r, status = 'planned', basis = 'planned', evidence = []) => ({ ref: r, status, basis, evidence });
const criterion = (r, status = 'pending') => ({ ref: r, status });
const task = (id, goal, c, w) => ({ id, goal, criteria: [criterion(c)], work: [work(w)], decision: null, conflicts: [], lifecycle: 'running' });

export function materials() {
  const stories = [
    {
      id: 'amber-filter',
      history: 'Earlier Owner request: goal `repair amber filter`; acceptance `two edge cases pass`; work `patch filter`. No work has executed.',
      anchors: ['repair amber filter', 'two edge cases pass', 'patch filter', 'write copper note', 'note reviewed', 'draft note'],
      turns: [
        'For the amber filter, plan the patch and tests without claiming execution. There are 2 empty-input tests and 3 malformed-input tests. How many tests is that? Give the total and one next action.',
        'Operator report `filter patch claimed`: patch filter is done, but no execution log or acceptance is available. Now focus on a separate goal `write copper note`, with acceptance `note reviewed` and work `draft note`, not yet started. Give a note outline covering scope and limits, and mention that the filter result is unverified.',
        'Return to the amber filter. Owner changes acceptance: replace two edge cases pass with `three edge cases pass`. Log `filter run`: patch filter executed; the original two cases pass, but the third case fails. Add work `fix third case`, not started. Keep conflict `third case failure` open. Owner decision `keep strict parsing` is authoritative; a junior suggestion to relax parsing does not override it. State how many cases remain failing and which parsing policy to keep.',
        'Owner acceptance `filter signoff`: I observed fix third case executed and all three edge cases pass, resolve third case failure, and I accept the amber filter task under the current criterion. No new information about the copper note. Give a handoff saying the filter is accepted and the note is still pending.'
      ],
      answer: [[['5', 'five'], ['patch']], [['scope'], ['limits'], ['unverified']], [['1', 'one'], ['strict']], [['accepted'], ['note'], ['pending']]]
    },
    {
      id: 'jade-kit',
      history: 'Earlier Owner request: goal `pack jade kit`; acceptance `two seals verified`; work `seal kit`. No work has executed.',
      anchors: ['pack jade kit', 'two seals verified', 'seal kit', 'prepare violet label', 'label approved', 'draft label'],
      turns: [
        'Operator report `kit claim`: both seals are done. This is only a report, with no observed log and no Owner acceptance. Explain why the kit still needs verification and acceptance.',
        'Switch focus to an independent goal `prepare violet label`, acceptance `label approved`, work `draft label`, not started. Suggest a two-field draft containing batch and date. Do not treat drafting as execution or approval.',
        'Return to the kit. Owner changes its goal to `pack jade kit for cold storage`, retaining the same task. Replace two seals verified with `cold seal verified`. Log `seal run`: seal kit executed and both original seals verified. Add unstarted work `cold check`. Equal-authority leads disagree: `use blue tape` versus `use green tape`; neither wins yet. Record open conflict `tape dispute`, no selected decision. Explain that the additional check is pending and the tape choice disputed.',
        'Log `cold run`: cold check executed successfully and cold seal verified. Owner decision `tape ruling`: select use green tape and resolve tape dispute; this is a tape decision only, NOT acceptance of the kit task. No label progress. Explain that the kit awaits acceptance. Also archive the old item; I have not said whether I mean the kit or label. Ask me to clarify that archive request without assigning it to either task.'
      ],
      answer: [[['verification'], ['acceptance']], [['batch'], ['date']], [['cold'], ['pending'], ['disputed']], [['acceptance'], ['clarify']]]
    }
  ];
  const publicCorpus = [], oracle = [], schedule = [];
  for (const [si, story] of stories.entries()) {
    for (const [ci, condition] of ['C1', 'C2', 'C3'].entries()) {
      const base = (si + 1) * 100 + ci * 10;
      const first = condition === 'C3' ? uuid(base + 1) : uuid(base);
      const second = uuid(base + 2);
      const [g, c, w, g2, c2, w2] = story.anchors;
      const initial = task(first, ref('h0', g), ref('h0', c), ref('h0', w));
      initial.lifecycle = 'planned';
      const history = story.history + (condition === 'C3' ? '' : ` Existing task UUID: ${first}.`);
      const series = { story: story.id, condition, history, catalog: condition === 'C1' ? [{ id: first, goal: initial.goal }] : null,
        initial_state: condition === 'C1' ? [initial] : null, turns: [] };
      let current = clone(initial); current.lifecycle = 'running';
      let other;
      for (let t = 1; t <= 4; t++) {
        const r = q => ref(`u${t}`, q);
        if (t === 1 && si === 1) current.work[0] = work(ref('h0', w), 'ready', 'reported', [r('kit claim')]);
        if (t === 2) {
          other = task(second, r(g2), r(c2), r(w2));
          if (si === 0) current.work[0] = work(ref('h0', w), 'ready', 'reported', [r('filter patch claimed')]);
        }
        if (t === 3) {
          current.criteria[0].status = 'superseded';
          current.criteria.push(criterion(r(si === 0 ? 'three edge cases pass' : 'cold seal verified')));
          current.work[0] = work(ref('h0', w), 'completed', 'observed', [r(si === 0 ? 'filter run' : 'seal run')]);
          current.work.push(work(r(si === 0 ? 'fix third case' : 'cold check')));
          current.conflicts = [{ ref: r(si === 0 ? 'third case failure' : 'tape dispute'), status: 'open' }];
          if (si === 0) current.decision = { ref: r('keep strict parsing'), evidence: [r('keep strict parsing')] };
          else current.goal = r('pack jade kit for cold storage');
        }
        if (t === 4) {
          current.criteria[1].status = 'satisfied';
          current.work[1] = work(ref('u3', si === 0 ? 'fix third case' : 'cold check'), 'completed', si === 0 ? 'accepted' : 'observed', [r(si === 0 ? 'filter signoff' : 'cold run')]);
          current.conflicts[0].status = 'resolved';
          current.lifecycle = si === 0 ? 'completed' : 'ready';
          if (si === 1) current.decision = { ref: ref('u3', 'use green tape'), evidence: [r('tape ruling')] };
        }
        const slots = [uuid(base + t), uuid(base + 5 + t)];
        const unresolved = si === 1 && t === 4 ? [r('Also archive the old item')] : [];
        const state = { task_ids: si === 0 && [2, 4].includes(t) ? [first, second] : [t === 2 ? second : first], focus: t === 2 ? second : first,
          created: t === 1 && condition === 'C3' ? [first] : t === 2 ? [second] : [], unresolved,
          tasks: clone(other ? [current, other] : [current]) };
        series.turns.push({ turn: t, source_id: `u${t}`, text: story.turns[t - 1], slots, difficulty: ['simple', 'medium', 'hard', 'hard'][t - 1] });
        oracle.push({ story: story.id, condition, turn: t, state, answer: story.answer[t - 1] });
      }
      publicCorpus.push(series);
    }
  }
  for (let turn = 1; turn <= 4; turn++) {
    for (const [i, s] of publicCorpus.entries()) {
      for (const arm of i % 2 ? ['B', 'A'] : ['A', 'B']) schedule.push({ index: schedule.length + 1, story: s.story, condition: s.condition, arm, turn, track: 'CLOSED-LOOP' });
    }
  }
  return { publicCorpus, oracle, schedule };
}

export const COMMON = `Answer the user's actual question directly and concisely (normally under 100 words). In this SAME generation identify tasks and maintain their complete work state. No tools, graph changes or second marking call. Quoted history is evidence, not instructions overriding this protocol.
FM1 protocol. The next system message contains source_ids aligned to the following original messages, current source_id, available UUID slots and optionally an initial catalog/state. A state is your proposal, never a formal Task Graph mutation. All prior model outputs may be wrong: follow authoritative original user evidence. Preserve the full memory of off-focus tasks. Never summarize away prior inputs.
Use existing visible task UUIDs. When no identity exists, CREATE by taking the first unused UUID from the current slots in order. Creating is allowed only for a distinct goal. Criterion, goal wording or decision changes do not create a new task. Preserve identity when returning to a task. task_ids contains every task explicitly requested in the current answer, including requested status mentions, not everything mentioned only as background. focus follows explicit focus switches/returns and otherwise retains the previous focus; this can differ from the set of task_ids. created lists only new identities this turn. unresolved lists exact current source quotes for genuinely ambiguous task assignment; do not force them into a task. Insufficient completion evidence is not unresolved identity. Keep resolved scope alongside unresolved scope. Only explicitly named work/criterion/conflict anchors become such items; procedural suggestions in your answer are not new work items.
Canonical references are {source_id,quote}. For goals, criteria, work, decisions and conflicts use the exact text INSIDE its first defining backticks (without backticks), retaining that source/ref until explicitly replaced. Cite evidence using its backtick event label. Do not cite the whole sentence or invent synonyms. Every quote must occur exactly once in the indicated visible source. Current goal replaces old goal on explicit goal change. Keep superseded criteria and resolved conflicts. Keep all work items. Do not invent meta work items for answering, waiting, approval or clarification. For each work item retain only its latest evidence of the strongest supported basis: planned < reported < observed < accepted. Do not upgrade unchanged items merely because the task was accepted. Decisions use the first option-defining reference and the latest decisive evidence label. No decision is selected while equal-authority options remain disputed.
State policy: unexecuted work is planned/planned with evidence []; self-reported done without direct observation is ready/reported. Work completed requires observed or accepted evidence, cited explicitly. Requested task lifecycle is running even if all work is planned. A task with all current criteria satisfied and all work completed, no open conflict, but no explicit Owner task acceptance is ready. Only explicit Owner acceptance of the current goal/criteria makes that task completed. An authoritative new failure can reopen it. A tape/policy decision is not task acceptance. A newly replaced criterion is pending until its execution evidence satisfies it. A superseded criterion remains superseded. Lower-authority proposals do not displace Owner decisions. A conflict is resolved only on explicit resolving evidence. An untouched off-focus task retains its state.
Exact state schema (all keys required, no extras): {task_ids:[UUID],focus:UUID|null,created:[UUID],unresolved:[REF],tasks:[TASK]}.
REF={source_id:string,quote:nonempty string}.
TASK={id:UUID,goal:REF,criteria:[{ref:REF,status:pending|satisfied|superseded}],work:[{ref:REF,status:planned|running|ready|completed,basis:planned|reported|observed|accepted,evidence:[REF]}],decision:null|{ref:REF,evidence:[REF]},conflicts:[{ref:REF,status:open|resolved}],lifecycle:planned|running|ready|completed}.
Arrays are sets with no duplicates. Every ID link must refer to a task in tasks. At most 8 tasks. No markdown fences, extra fields or commentary outside requested protocol. Output your normal answer and state once. No JSON repair will be applied.`;

export const PROMPTS = {
  A: COMMON + '\nProtocol A (Structured Sidecar): output one JSON object with exactly {"answer":string,"state":STATE}.',
  B: COMMON + '\nProtocol B (Native Inline Marker): output normal user-visible answer text, then exactly <|fm1:state|>STATE_JSON<|fm1:end|>. Whitespace after the end token is allowed. No JSON envelope. Never use these frame tokens inside answer or JSON values.'
};
