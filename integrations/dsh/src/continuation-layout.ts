import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { canonical } from '@acmi/core'
import { GraphStoreError, pathsOverlap } from './graph-store-db.ts'
import type { JsonlCompression } from './journal-format.ts'

export const continuationPair = 'continuation-pair.json'
export const continuationOwner = 'continuation-owner.sqlite'
const pairLimit = 8192

export interface ContinuationRoots {
  readonly workspaceRoot: string
  readonly journalRoot: string
  readonly graphRoot: string
  readonly compression: JsonlCompression
}

function directory(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new GraphStoreError('unavailable')
  const stat = lstatSync(path, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n) throw new GraphStoreError('unavailable')
  return `${stat.dev}:${stat.ino}`
}

export function continuationLayout(config: ContinuationRoots) {
  const { workspaceRoot, journalRoot, graphRoot, compression } = config
  const paths = [workspaceRoot, journalRoot, graphRoot]
  if ((compression !== 'none' && compression !== 'zstd')
    || paths.some((path, i) => paths.slice(i + 1).some(other => pathsOverlap(path, other)))) throw new GraphStoreError('invalid')
  for (const home of [join(homedir(), '.dsh'), process.env.DSH_HOME, process.env.DSH_AGENTS_HOME]) {
    if (!home) continue
    const absolute = resolve(home)
    const physical = resolvePhysical(absolute)
    if (paths.some(path => pathsOverlap(path, absolute) || pathsOverlap(path, physical))) {
      throw new GraphStoreError('unavailable')
    }
  }
  const [workspaceIdentity, journalIdentity, graphIdentity] = paths.map(directory)
  return { workspaceRoot, journalRoot, graphRoot, compression, workspaceIdentity, journalIdentity, graphIdentity }
}

function resolvePhysical(path: string): string {
  try { return realpathSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path
    throw error
  }
}

function regular(path: string, ceiling: number): void {
  const stat = lstatSync(path, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.ino === 0n || stat.size > BigInt(ceiling)) {
    throw new GraphStoreError('unavailable')
  }
}

export function encodeContinuationPair(config: ContinuationRoots, workspaceId: string): string {
  const text = canonical({ version: 1, workspaceId, ...continuationLayout(config) })
  if (Buffer.byteLength(text) > pairLimit) throw new GraphStoreError('limit')
  return text
}

function readPair(root: string): string {
  regular(join(root, continuationOwner), 65536)
  const path = join(root, continuationPair)
  regular(path, pairLimit)
  return readFileSync(path, 'utf8')
}

export function verifyContinuationPair(config: ContinuationRoots, workspaceId: string): string {
  const expected = encodeContinuationPair(config, workspaceId)
  if (readPair(config.journalRoot) !== expected || readPair(config.graphRoot) !== expected) throw new GraphStoreError('conflict')
  return expected
}

export function verifyJournalContinuationPair(journalRoot: string, workspaceRoot: string, compression: JsonlCompression, workspaceId: string): string {
  const local: unknown = JSON.parse(readPair(journalRoot))
  if (!local || typeof local !== 'object' || !('graphRoot' in local) || typeof local.graphRoot !== 'string') {
    throw new GraphStoreError('invalid')
  }
  return verifyContinuationPair({ journalRoot, workspaceRoot, compression, graphRoot: local.graphRoot }, workspaceId)
}
