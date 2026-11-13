import { lstatSync, readdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { boundedText, canonical } from '@acmi/core'
import { continuityDigest } from './local-digest.ts'

export type GraphStoreCode = 'unavailable' | 'busy' | 'invalid' | 'conflict' | 'revision' | 'gap' | 'limit' | 'corrupt' | 'io' | 'closed'
export class GraphStoreError extends Error {
  constructor(readonly code: GraphStoreCode) {
    super('graph-store:' + code)
    this.name = 'GraphStoreError'
  }
}
export function translateGraphError(error: unknown): GraphStoreError {
  if (error instanceof GraphStoreError) return error
  const errno = typeof error === 'object' && error !== null && 'errcode' in error ? Number(error.errcode) & 255 : 0
  return new GraphStoreError([5, 6].includes(errno) ? 'busy' : errno === 13 ? 'limit' : [11, 26].includes(errno) ? 'corrupt' : 'io')
}

const database = 'graph.sqlite'
const marker = 'graph-root-v1.json'
const schema = `
CREATE TABLE graph_meta (partition TEXT PRIMARY KEY, root_id TEXT NOT NULL) STRICT;
CREATE TABLE graph_event (
  task TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL, idem TEXT NOT NULL,
  hash TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(task, seq), UNIQUE(task, idem), UNIQUE(task, event_id)
) STRICT;
CREATE TABLE graph_checkpoint (task TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL) STRICT;
CREATE TABLE runtime_cursor (session TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL) STRICT;
CREATE TABLE runtime_fact (
  session TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL UNIQUE, task TEXT,
  call_key TEXT UNIQUE, body TEXT NOT NULL, hash TEXT NOT NULL,
  PRIMARY KEY(session, seq)
) STRICT;
CREATE INDEX task_facts ON runtime_fact(task);
CREATE TABLE runtime_turn (session TEXT NOT NULL, turn TEXT NOT NULL, source_seq INTEGER NOT NULL, PRIMARY KEY(session,turn)) STRICT;
CREATE TABLE proposal_review (id TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL) STRICT;
PRAGMA user_version=1;
`

const contains = (root: string, target: string) => {
  const part = relative(root, target)
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep))
}
export const pathsOverlap = (a: string, b: string) => contains(a, b) || contains(b, a)

function rootIdentity(root: string, workspaceId: string): string {
  if (!boundedText(workspaceId, 512) || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) {
    throw new GraphStoreError('unavailable')
  }
  const info = lstatSync(root, { bigint: true })
  if (!info.isDirectory() || info.isSymbolicLink() || info.ino === 0n) throw new GraphStoreError('unavailable')
  for (const home of [join(homedir(), '.dsh'), process.env.DSH_HOME, process.env.DSH_AGENTS_HOME]) {
    if (home && pathsOverlap(root, resolve(home))) throw new GraphStoreError('unavailable')
  }
  return continuityDigest(canonical([root, String(info.dev), String(info.ino), workspaceId]))
}

function regular(file: string, max: number, optional = false): void {
  const info = lstatSync(file, { throwIfNoEntry: !optional })
  if (optional && !info) return
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > max) throw new GraphStoreError('unavailable')
}

/** Provision only an empty, operator-owned canonical directory, separate from the source Journal. */
export function provisionGraphRoot(root: string, workspaceId: string): void {
  const rootId = rootIdentity(root, workspaceId)
  if (readdirSync(root).length !== 0) throw new GraphStoreError('unavailable')
  const file = join(root, database)
  writeFileSync(file, '', { flag: 'wx', mode: 0o600 })
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;')
    db.exec(schema)
    db.prepare('INSERT INTO graph_meta VALUES (?, ?)').run(workspaceId, rootId)
    db.exec('COMMIT')
  } finally { db.close() }
  writeFileSync(join(root, marker), canonical({ workspaceId, rootId }), { flag: 'wx', mode: 0o600, flush: true })
}

export function verifyGraphRootMarker(root: string, workspaceId: string): string {
  const rootId = rootIdentity(root, workspaceId)
  const mark = join(root, marker)
  regular(mark, 2048)
  if (readFileSync(mark, 'utf8') !== canonical({ workspaceId, rootId })) throw new GraphStoreError('unavailable')
  const file = join(root, database)
  regular(file, 256 * 1024 * 1024)
  regular(file + '-journal', 257 * 1024 * 1024, true)
  return rootId
}

export function connectGraphRoot(root: string, workspaceId: string, maxPages = 65_536): DatabaseSync {
  if (!Number.isSafeInteger(maxPages) || maxPages < 16 || maxPages > 65_536) throw new GraphStoreError('invalid')
  const rootId = verifyGraphRootMarker(root, workspaceId)
  const file = join(root, database)
  const db = new DatabaseSync(file, { timeout: 0, allowExtension: false })
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA locking_mode=EXCLUSIVE; PRAGMA synchronous=FULL; BEGIN EXCLUSIVE; COMMIT;')
    if (db.prepare('PRAGMA user_version').get()?.user_version !== 1
      || db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete'
      || db.prepare('SELECT root_id FROM graph_meta WHERE partition=?').get(workspaceId)?.root_id !== rootId
      || db.prepare('PRAGMA quick_check(1)').get()?.quick_check !== 'ok') throw new GraphStoreError('corrupt')
    if (Number(db.prepare(`PRAGMA max_page_count=${maxPages}`).get()?.max_page_count) !== maxPages) throw new GraphStoreError('limit')
    db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS snapshot_reservation (
      session TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL, retired INTEGER NOT NULL CHECK(retired IN (0,1))
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS runtime_child_link (
      session TEXT NOT NULL, child TEXT NOT NULL, incarnation TEXT NOT NULL, seq INTEGER NOT NULL,
      PRIMARY KEY(session, child, incarnation)
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS runtime_lifecycle_latest (
      session TEXT NOT NULL, category TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(session,category)
    ) STRICT, WITHOUT ROWID;
    COMMIT;`)
    return db
  } catch (error) {
    db.close()
    throw translateGraphError(error)
  }
}
