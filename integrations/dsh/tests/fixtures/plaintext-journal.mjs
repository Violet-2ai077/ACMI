import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'

const emptyDigest = createHash('sha256').digest('hex')

export function selectPlaintextJournal(entries) {
  const journals = entries.filter(([path]) => basename(path) === 'session.v4.jsonl')
  assert.equal(journals.length, 1, 'Expected one isolated plaintext dsh journal')
  const [journal] = journals
  // Stock dsh uses an empty sibling lease file on POSIX and a semaphore on Windows.
  const extra = entries.filter(row => row !== journal)
  const leaseOnly = extra.length <= 1 && extra.every(([path, digest]) =>
    basename(path) === 'session.lock' && dirname(path) === dirname(journal[0]) && digest === emptyDigest)
  assert(leaseOnly, 'Unexpected artifact beside the isolated dsh journal')
  return journal
}
