import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  continuationLayout, continuationOwner, continuationPair, encodeContinuationPair, verifyContinuationPair, type ContinuationRoots,
} from './continuation-layout.ts'
import { GraphStoreError, provisionGraphRoot, translateGraphError, verifyGraphRootMarker } from './graph-store-db.ts'
import { createStorageIsolationMarker, openStorageIsolation } from './storage-isolation.ts'

export interface ContinuationRootLease {
  readonly workspaceId: string
  close(): void
}

export async function provisionContinuationRoots(config: ContinuationRoots): Promise<void> {
  const roots = continuationLayout(config)
  const { journalRoot, graphRoot, workspaceRoot, compression } = roots
  const writers = [graphRoot, journalRoot]
  if (writers.some(root => readdirSync(root).length !== 0)) throw new GraphStoreError('conflict')
  // The partition identifier is fixed width; check the pair fits before provisioning either root.
  encodeContinuationPair(roots, 'acmi-p2-' + '0'.repeat(64))
  const { partitionId } = await createStorageIsolationMarker(journalRoot, workspaceRoot, compression)
  provisionGraphRoot(graphRoot, partitionId)
  const record = encodeContinuationPair(roots, partitionId)
  for (const root of writers) {
    const owner = join(root, continuationOwner)
    writeFileSync(owner, '', { flag: 'wx', mode: 0o600, flush: true })
    const db = new DatabaseSync(owner, { timeout: 0, allowExtension: false })
    try { db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA user_version=1;') } finally { db.close() }
  }
  for (const root of writers) writeFileSync(join(root, continuationPair), record, { flag: 'wx', mode: 0o600, flush: true })
}

export async function acquireContinuationRoots(config: ContinuationRoots): Promise<ContinuationRootLease> {
  const connections: DatabaseSync[] = []
  const close = () => {
    try { connections.pop()?.close() } finally { connections.pop()?.close() }
  }
  try {
    const roots = continuationLayout(config)
    const { journalRoot, graphRoot, workspaceRoot, compression } = roots
    const proof = await openStorageIsolation(journalRoot, workspaceRoot, compression)
    const workspaceId = proof.partitionId
    verifyGraphRootMarker(graphRoot, workspaceId)
    const pair = verifyContinuationPair(roots, workspaceId)
    for (const root of [graphRoot, journalRoot].sort()) {
      const db = new DatabaseSync(join(root, continuationOwner), { timeout: 0, allowExtension: false })
      connections.push(db)
      db.exec('PRAGMA trusted_schema=OFF; BEGIN EXCLUSIVE;')
      if (db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete'
        || db.prepare('PRAGMA user_version').get()?.user_version !== 1) throw new GraphStoreError('corrupt')
    }
    await proof.verify()
    verifyGraphRootMarker(graphRoot, workspaceId)
    if (verifyContinuationPair(roots, workspaceId) !== pair) throw new GraphStoreError('conflict')
    return Object.freeze({ workspaceId, close })
  } catch (error) {
    close()
    throw translateGraphError(error)
  }
}
