import { expect, test } from 'vitest'
const { splitRoles } = process.env.ACMI_TEST_BUILT === '1'
  ? await import('../dist/role-attribution.js') : await import('../src/role-attribution.ts')

const first = { taskId: 'task-alpha', workId: null }, second = { taskId: 'task-beta', workId: 'work-beta' }
const cut = { links: { 'q-0acbd': first, 'q-6abcd': second }, toolAvailable: false }
const tag = { user_turn: { kind: 'existing', ref: 'q-0acbd' },
  assistant: { primary: { kind: 'existing', ref: 'q-0acbd' }, related: ['q-6abcd'] }, intent: 'describe_only' }
const answer = 'Alpha is the main item. Beta is related.'
const split = (meta, scope = cut) => splitRoles(JSON.stringify({ answer, tag: meta }), 'eos', scope)

test('description alone does not erase existing task identity or force a WorkNode', () => {
  expect(split(tag)).toMatchObject({ answer, user: first, assistant: first, related: [second], intent: 'describe_only', issues: [] })
})

test('new goals are local proposals and cannot be smuggled into existing choices', () => {
  const a = split({ ...tag, user_turn: { kind: 'new_task_proposal', goal: 'New outline' }, intent: 'propose' })
  expect(a).toMatchObject({ user: 'new_task_proposal', newGoal: 'New outline', assistant: first, intent: 'propose' })
  const b = split({ ...tag, user_turn: { ...tag.user_turn, goal: 'smuggled objective' } })
  expect(b).toMatchObject({ answer, user: 'unresolved', newGoal: null, assistant: first })
})

test('bad secondary metadata is rejected without hiding a valid primary, user or answer', () => {
  for (const related of [['q-0acbd'], ['q-6abcd', 'q-6abcd'], ['q-fffff'], ['__proto__']]) {
    expect(split({ ...tag, assistant: { ...tag.assistant, related } })).toMatchObject({
      answer, user: first, assistant: first, related: [], issues: ['RELATED_REJECTED'],
    })
  }
})

test('envelope literal leakage or truncation fails closed before creating any visible blocks', () => {
  expect(() => splitRoles(JSON.stringify({ answer: '{"related":[]}', tag }), 'eos', cut)).toThrow('UNSAFE_ANSWER')
  expect(() => splitRoles(JSON.stringify({ answer, tag }), 'limit', cut)).toThrow('TRUNCATED')
})

test('each safe action has independent scope and a fully checked batch', () => {
  const operations = [{ ref: 'a1', key: 'amber', assignment: 'q-0acbd' }, { ref: 'a2', key: 'indigo', assignment: 'q-6abcd' }]
  expect(split({ ...tag, operations }, { ...cut, toolAvailable: true }).operations.map(a => a.assignment)).toEqual([first, second])
  expect(split({ ...tag, operations: [operations[0], { ...operations[1], assignment: 'q-fffff' }] },
    { ...cut, toolAvailable: true })).toMatchObject({ answer, operations: [], issues: ['ACTION_REJECTED'] })
})
