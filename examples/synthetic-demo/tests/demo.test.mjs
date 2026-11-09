import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

function run(...args) {
  return execFileSync(process.execPath, [fileURLToPath(new URL('../dist/index.js', import.meta.url)), ...args], { encoding: 'utf8' })
}

it('prints deterministic Task A/B transitions, causal result, unresolved event and cross-Session history', () => {
  const output = run()
  expect(run()).toBe(output)
  for (const label of ['Task A created', 'Session 1 contains Task A', 'Session 1 switches to Task B', 'Session 2 resumes Task A', 'tool-result-of', 'unresolved', 'Cross-Session Task History', 'Observer timeline']) {
    expect(output).toContain(label)
  }
  expect(output).toMatch(/Session 1 #5 tool-result.*Task A.*original-call/)
})

it('can emit the same synthetic history as a standalone read-only HTML page', () => {
  const output = run('--html')
  expect(output).toContain('<!doctype html>')
  expect(output).toContain('Read-only')
  expect(output).toContain('tool-result-of')
  expect(output).toContain('Unresolved')
})
