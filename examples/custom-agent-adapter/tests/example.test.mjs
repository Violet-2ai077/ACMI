import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('runs the message-only template through the same public conformance runner', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../dist/index.js', import.meta.url))], { encoding: 'utf8' })
  expect(output).toContain('Level 2')
  expect(output).toContain('tool causality unavailable')
})
