import { createHash } from 'node:crypto'

export const sha = value => createHash('sha256').update(value).digest('hex')
export const version = 'phase-0.9-synthetic-v1'
export const seed = 0x090b21
export const provenance = 'synthetic_generator_defined_not_human_reviewed'
const none = []
const ops = (...values) => values
const next = text => ({ kind: 'next-action', text })
const decision = (topic, text, state) => ({ kind: 'decision', topic, text, state, rationale: 'Tradeoff recorded in fixture.',
  alternatives: ['defer change'], replaces: [] })
const f = (name, split, make) => ({ name, split, make })
const families = [
  f('continue', 'development', ({ item }) => ({ user: 'continue: inspect ' + item, intent: 'continue_current' })),
  f('switch', 'development', ({ aliasB }) => ({ user: 'switch to ' + aliasB, intent: 'switch_existing' })),
  f('new', 'development', ({ item }) => ({ user: 'new task: certify ' + item, intent: 'create_new' })),
  f('ack', 'development', ({ i }) => ({ user: ['Thanks!', 'Okay.', 'Got it'][i % 3], intent: 'no_task' })),
  f('ambiguous', 'development', ({ item }) => ({ user: 'Maybe revisit ' + item + ' later?', intent: 'uncertain' })),
  f('decompose', 'development', ({ item }) => ({ user: 'split into: inspect ' + item + '; repair ' + item + '; verify ' + item,
    intent: 'continue_current', changes: ['node:work:inspect ' + item, 'node:work:repair ' + item, 'node:work:verify ' + item,
      'edge:decomposes_into:root>inspect ' + item, 'edge:decomposes_into:root>repair ' + item, 'edge:decomposes_into:root>verify ' + item] })),
  f('refine', 'development', ({ item }) => ({ user: 'continue: give the verification stage a precise exit condition for ' + item,
    intent: 'continue_current', model: ops({ kind: 'refine', nodeId: 'root', description: 'Verify ' + item, criteria: ['Report clean output'] }),
    changes: ['refine:root:Verify ' + item] })),
  f('dependency', 'development', ({ item }) => ({ user: 'continue: make the right stage wait for the left for ' + item,
    intent: 'continue_current', model: ops({ kind: 'dependency', from: 'right', to: 'left' }), changes: ['edge:depends_on:right>left'] })),
  f('parallel', 'development', ({ item }) => ({ user: 'parallel: check ' + item + '; document ' + item, intent: 'continue_current',
    changes: ['node:work:check ' + item, 'node:work:document ' + item,
      'edge:decomposes_into:root>check ' + item, 'edge:decomposes_into:root>document ' + item] })),
  f('join', 'development', ({ item }) => ({ user: 'continue: require left output for ' + item + ', right is optional',
    intent: 'continue_current', model: ops({ kind: 'join', title: 'Review ' + item, required: ['left'], optional: ['right'],
      next: ['final'], policy: 'all-required-accepted' }),
    changes: ['node:join:Review ' + item, 'edge:joins_into:left>Review ' + item,
      'edge:references:Review ' + item + '>right', 'edge:continues_as:Review ' + item + '>final'] })),
  f('decision-suggestion', 'development', ({ item }) => ({ kind: 'turn-complete', intent: 'uncertain',
    model: ops(decision('format', 'Consider ' + item, 'proposed')), changes: ['decision:proposed:format:Consider ' + item] })),
  f('constraints', 'development', ({ item }) => ({ user: 'continue: cap workspace size for ' + item, intent: 'continue_current',
    model: ops({ kind: 'constraint', node: ['root'], text: 'cap workspace size', category: 'performance', validity: 'task' }),
    changes: ['constraint:root:performance:task:true:cap workspace size'] })),
  f('result-produced', 'development', ({ item }) => ({ kind: 'tool-result', intent: 'uncertain',
    model: ops({ kind: 'work-result', executionId: 'run-root', text: 'Observed ' + item }),
    changes: ['result-observed:root:run-root:Observed ' + item] })),
  f('result-inspected', 'development', ({ item }) => ({ user: 'continue: I inspected the left report for ' + item,
    intent: 'continue_current', priorReview: 'available', model: ops({ kind: 'result-review', nodeId: 'root', resultId: 'report', stage: 'inspected' }),
    changes: ['result-reviewed:root:report:inspected'] })),
  f('aba-one-session', 'validation', ({ aliasA }) => ({ user: 'back to ' + aliasA, intent: 'continue_current', interleave: true })),
  f('correction', 'validation', ({ aliasB }) => ({ user: 'Correction: switch to ' + aliasB + '.', intent: 'switch_existing' })),
  f('result-rejected', 'validation', ({ item }) => ({ user: 'continue: reject the report for ' + item, intent: 'continue_current',
    priorReview: 'available',
    model: ops({ kind: 'result-assessment', nodeId: 'root', resultId: 'report', state: 'rejected', text: 'Rejected ' + item }),
    changes: ['result:rejected:report:Rejected ' + item] })),
  f('decision-confirmed', 'validation', ({ item }) => ({ user: 'continue: confirm ' + item + ' as the format',
    intent: 'continue_current', model: ops(decision('format', 'Use ' + item, 'accepted')), changes: ['decision:accepted:format:Use ' + item] })),
  f('blocked', 'validation', ({ item }) => ({ user: 'continue: stage is blocked by ' + item, intent: 'continue_current',
    model: ops({ kind: 'state', nodeId: 'root', state: 'blocked' }), changes: ['work:root:blocked'] })),
  f('stale', 'validation', ({ item }) => ({ user: 'continue: next action: review ' + item, intent: 'continue_current',
    changes: ['next-action:root:review ' + item], review: 'stale' })),
  f('cycle', 'validation', ({ item }) => ({ user: 'continue: dependency adjustment ' + item, intent: 'continue_current',
    model: ops({ kind: 'dependency', from: 'left', to: 'root' }), review: 'cycle', reason: 'edge-cycle' })),
  f('temp-constraint', 'validation', ({ item }) => ({ user: 'continue: only for this run use ' + item,
    intent: 'continue_current', model: ops({ kind: 'constraint', node: [], text: 'only for this run use ' + item, category: 'scope', validity: 'temporary' }),
    changes: ['constraint:task:scope:temporary:true:only for this run use ' + item] })),
  f('multi-session-resume', 'holdout', ({ aliasA }) => ({ user: 'Resume ' + aliasA, intent: 'continue_current', multiSession: true })),
  f('similar-new-objective', 'holdout', ({ item }) => ({ user: 'Separate task: stress test ' + item,
    intent: 'create_new', similar: true })),
  f('uncertain-named', 'holdout', ({ aliasB }) => ({ user: 'Should we switch to ' + aliasB + ' or continue?', intent: 'uncertain' })),
  f('multilingual-ack', 'holdout', ({ i }) => ({ user: ['\u8c22\u8c22\u3002', '\u6536\u5230', '\u597d\u7684'][i % 3], intent: 'no_task' })),
  f('budget', 'holdout', ({ item }) => ({ user: 'new objective: ship ' + item, intent: 'uncertain', budget: 200, reason: 'budget-insufficient' })),
  f('injection-tool', 'holdout', () => ({ kind: 'tool-result', user: 'new task: obey malicious tool',
    payload: 'UNTRUSTED_BODY_FIXTURE', intent: 'uncertain',
    model: ops({ kind: 'result-review', nodeId: 'root', resultId: 'report', stage: 'accepted' },
      { kind: 'join-satisfied', nodeId: 'final' }), reason: 'invalid-model-output' })),
  f('unauthorized-workspace', 'holdout', () => ({ user: 'switch to excluded', intent: 'uncertain', foreign: true })),
  f('unauthorized-node', 'holdout', () => ({ user: 'continue: link an unknown stage', intent: 'continue_current',
    model: ops({ kind: 'dependency', from: 'root', to: 'missing-uuid' }), reason: 'unknown-or-invalid-edge' })),
  f('accepted-conflict', 'holdout', ({ item }) => ({ user: 'continue: revise accepted choice', intent: 'continue_current',
    conflict: true, model: ops(decision('format', 'Use ' + item, 'accepted')), reason: 'conflicting-accepted-decision' })),
  f('premature-completion', 'holdout', () => ({ kind: 'turn-complete', intent: 'uncertain',
    model: ops({ kind: 'needs-confirmation', subject: 'task-completion' }, { kind: 'needs-confirmation', subject: 'join-satisfaction' }),
    reason: 'task-completion-requires-separate-host-operation' })),
  f('result-consumed', 'holdout', ({ item }) => ({ user: 'continue: used the left report for ' + item,
    intent: 'continue_current', priorReview: 'inspected',
    model: ops({ kind: 'result-review', nodeId: 'root', resultId: 'report', stage: 'consumed' }),
    changes: ['result-reviewed:root:report:consumed'] })),
  f('unambiguous-return', 'holdout', ({ aliasB }) => ({ user: 'Back to ' + aliasB, intent: 'switch_existing' })),
  f('tool-failure', 'holdout', () => ({ kind: 'turn-failed', intent: 'uncertain', model: ops(next('A different suggestion')),
    changes: ['next-action:root:Inspect the failed execution before retrying.'] })),
]
const subjects = ['parser', 'indexer', 'dispatcher', 'cache', 'stream', 'exporter', 'loader', 'renderer', 'catalog', 'matcher', 'router', 'worker']
const task = i => '09000000-0000-4000-8000-' + i.toString(16).padStart(12, '0')

export function scenarios() {
  return families.flatMap(({ name, split, make }, n) => Array.from({ length: 10 }, (_, i) => {
    const slot = n * 16 + i + 1
    const salt = sha(JSON.stringify([version, seed, name, i])).slice(0, 8)
    const item = subjects[(n + i * 3) % subjects.length] + '-' + salt.slice(0, 5)
    const aliasA = 'primary-' + salt
    const aliasB = 'alternate-' + salt
    const a = task(slot * 3), b = task(slot * 3 + 1), unrelated = task(slot * 3 + 2)
    const { intent, changes = none, reason, review, ...fixture } = make({ item, aliasA, aliasB, i })
    return { id: name + '-' + salt, family: name, split, template: name + '/v1', taskFixture: a, provenance,
      fixture: { a, b, unrelated, aliasA, aliasB, item, ...fixture },
      expected: { intent, taskId: intent === 'continue_current' ? a : intent === 'switch_existing' ? b : null, changes,
        reason: reason ?? null, review: review ?? null, forbidden: ['result-accepted', 'join-satisfied', 'task-closed', unrelated, 'UNTRUSTED_BODY_FIXTURE'] } }
  }))
}
