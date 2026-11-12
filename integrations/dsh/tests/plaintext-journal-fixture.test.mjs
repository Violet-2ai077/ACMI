import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { selectPlaintextJournal } from './fixtures/plaintext-journal.mjs'

const session = join('workspace', 'synthetic-session')
const journal = [join(session, 'session.v4.jsonl'), 'journal-digest']
const lock = [join(session, 'session.lock'), createHash('sha256').digest('hex')]

test('Windows and POSIX identify the same plaintext journal', () => {
  expect(selectPlaintextJournal([journal])).toBe(journal)
  expect(selectPlaintextJournal([lock, journal])).toBe(journal)
})

test('missing, duplicate, or unexpected artifacts fail closed', () => {
  const unexpected = [
    [lock],
    [journal, journal],
    [journal, lock, lock],
    [journal, [join(session, 'session.lock'), 'nonempty']],
    [journal, [join(session, 'nested', 'session.lock'), lock[1]]],
    [journal, [join(session, 'sidecar.json'), 'sidecar-digest']],
  ]
  for (const entries of unexpected) expect(() => selectPlaintextJournal(entries)).toThrow()
})
