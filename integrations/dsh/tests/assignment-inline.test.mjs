import { expect, test } from 'vitest'

const { splitAssignment } = process.env.ACMI_TEST_BUILT === '1'
  ? await import('../dist/assignment-inline.js') : await import('../src/assignment-inline.ts')

const a = { taskId: 'task-a', workId: 'work-a' }
const b = { taskId: 'task-b', workId: null }
const cut = { links: { 'q-7d9ac': a, 'q-49cdf': b }, toolAvailable: true }
const tag = { user_turn: 'q-7d9ac', assistant: 'q-49cdf', basis: 'explicit',
  operations: [{ ref: 'a1', key: 'amber', assignment: 'q-7d9ac' }, { ref: 'a2', key: 'indigo', assignment: 'q-49cdf' }] }
const answer = 'Checking both synthetic values.'
const split = (value, scope = cut) => splitAssignment(JSON.stringify(value), 'eos', scope)

test('one completion maps independent user, assistant and per-action assignments, including task-only', () => {
  const result = split({ answer, tag })
  expect(result).toMatchObject({ answer, issues: [], user: a, assistant: b, operations: [
    { ref: 'a1', key: 'amber', assignment: a }, { ref: 'a2', key: 'indigo', assignment: b },
  ] })
})

test('bad attribution preserves clean answer and does not silently assign the current binding', () => {
  for (const bad of [null, {}, { ...tag, user_turn: 'q-00000' }, { ...tag, user_turn: 'constructor' }]) {
    const result = split({ answer, tag: bad })
    expect(result.answer).toEqual(answer)
    expect(result.user).toBe('unresolved')
    expect(result.issues.length).toBeGreaterThan(0)
  }
  expect(split({ answer, tag: { ...tag, user_turn: 'q-00000' } }).assistant).toEqual(b)
})

test('invalid, duplicate or unadmitted tool actions cannot execute and do not swallow safe text', () => {
  for (const operations of [[{ ...tag.operations[0], assignment: 'unresolved' }], [tag.operations[0], tag.operations[0]],
    [{ ...tag.operations[0], key: 'shell' }], [{ ...tag.operations[0], extra: true }]]) {
    const result = split({ answer, tag: { ...tag, operations } })
    expect(result.answer).toEqual(answer)
    expect(result.operations).toEqual([])
    expect(result.issues).toContain('ACTION_REJECTED')
  }
  expect(split({ answer, tag }, { ...cut, toolAvailable: false }).operations).toEqual([])
})

test('malformed/ambiguous boundary, truncation and visible metadata fail closed', () => {
  for (const raw of ['{"answer":"hello"', '{"answer":"x","answer":"y"}', '{"answer":"hello","extra":1}']) {
    expect(() => splitAssignment(raw, 'eos', cut)).toThrow()
  }
  expect(() => splitAssignment(JSON.stringify({ answer, tag }), 'limit', cut)).toThrow('TRUNCATED')
  for (const echoed of ['q-7D9AC', 'ｑ-７ｄ９ａｃ', 'assignment_ref', 'user_turn', 'task-a',
    '0bc93cab-a4f4-41e2-a547-1b816ab38482', 'prefix\u0000suffix']) {
    expect(() => split({ answer: echoed, tag })).toThrow('UNSAFE_ANSWER')
  }
})

test('no task, abstention and new goal are proposals, never host IDs', () => {
  const meta = { user_turn: 'new_task_proposal', assistant: 'no_task', basis: 'new_goal', new_goal: 'New guide' }
  expect(split({ answer, tag: meta }, { ...cut, toolAvailable: false })).toMatchObject({
    user: 'new_task_proposal', assistant: 'no_task', newGoal: 'New guide', issues: [],
  })
  const bad = split({ answer, tag: { ...meta, new_goal: 'q-7d9ac' } }, { ...cut, toolAvailable: false })
  expect(bad.user).toBe('unresolved')
  expect(bad.assistant).toBe('no_task')
})
