/** Opt-in, scoped read path; never uses global discovery or writable recovery. */

import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, opendir, realpath, stat, type FileHandle } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session'
import {
  encodeSegment, generationLogFilename, parseGenerationLogFilename, projectDir, ScopedJournalError,
  type DshJournalInspection, type JsonlCompression, type ScopedJournalLimits,
} from './journal-format.ts'
import { readHeader, type DecodeLimits } from './scoped-decode.ts'
import { openStorageIsolation } from './storage-isolation.ts'

export interface DshJournalSnapshot {
  readonly header: SessionHeader
  readonly revision: string
}

/** Host-only capability for a trusted single-workspace journal root. */
export interface DshJournal {
  readonly partitionId: string
  list(signal: AbortSignal): Promise<readonly DshJournalSnapshot[]>
  inspect(id: string, signal: AbortSignal): Promise<DshJournalSnapshot | undefined>
  read(snapshot: DshJournalSnapshot, signal: AbortSignal): Promise<DshJournalInspection>
}

const CEILINGS: DecodeLimits = {
  maxCompressedBytes: 16 * 1024 * 1024, maxPlainBytes: 32 * 1024 * 1024, maxExpansionRatio: 50,
  maxEvents: 4096, maxLineBytes: 1024 * 1024, maxDepth: 48, maxDurationMs: 6000,
}
const MAX_PARTITION_ENTRIES = 128
let decoding = false

function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT' }
function scopeError(): ScopedJournalError { return new ScopedJournalError('ACMI_JOURNAL_SCOPE') }
function changed(): ScopedJournalError { return new ScopedJournalError('ACMI_JOURNAL_CHANGED') }
function limit(): ScopedJournalError { return new ScopedJournalError('ACMI_JOURNAL_LIMIT') }

type DirectoryChain = readonly [root: string, project: string, session: string]

interface CheckedPath {
  readonly physical: BigIntStats
  readonly directories: DirectoryChain
}

function objectIdentity(value: BigIntStats): string {
  return [value.dev, value.ino, value.birthtimeNs].join(':')
}

function revision(value: BigIntStats) {
  return [objectIdentity(value), value.size, value.mtimeNs, value.ctimeNs].join(':')
}

function sameDirectories(left: DirectoryChain, right: DirectoryChain | undefined): boolean {
  return right !== undefined && left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
}

function fileKind(value: BigIntStats): void {
  if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1n || value.ino === 0n) throw scopeError()
}

function directoryKind(value: BigIntStats): void {
  if (!value.isDirectory() || value.isSymbolicLink() || value.ino === 0n) throw scopeError()
}

async function canonicalDirectory(path: string): Promise<string> {
  const entry = await lstat(path, { bigint: true })
  directoryKind(entry)
  if (await realpath(path) !== path) throw scopeError()
  const target = await stat(path, { bigint: true })
  directoryKind(target)
  const identity = objectIdentity(entry)
  if (objectIdentity(target) !== identity) throw changed()
  return identity
}

async function currentGeneration(path: string): Promise<void> {
  let seen = 0
  let matching = false
  let older = false
  for await (const entry of await opendir(dirname(path))) {
    if (++seen > MAX_PARTITION_ENTRIES) throw limit()
    const version = parseGenerationLogFilename(entry.name, 'zstd') ?? parseGenerationLogFilename(entry.name, 'none')
    if (version === undefined) continue
    if (version > SESSION_FORMAT_VERSION || (version === SESSION_FORMAT_VERSION && entry.name !== basename(path))) {
      throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
    }
    if (entry.name === basename(path)) matching = true
    else older = true
  }
  if (!matching && older) throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
}

/**
 * Construct a reader for an explicitly isolated, canonical workspace partition.
 * @param storageRoot - operator-provisioned journal root.
 * @param cwd - host-authorized canonical Workspace directory.
 * @param compression - backend-configured expected encoding.
 * @param overrides - positive integer limits at or below hard ceilings.
 * @returns scoped discovery and bounded, non-recovering reads.
 */
export async function openDshJournal(
  storageRoot: string, cwd: string, compression: JsonlCompression, overrides: ScopedJournalLimits = {},
): Promise<DshJournal> {
  if (!isAbsolute(cwd) || resolve(cwd) !== cwd) throw scopeError()
  if (!isAbsolute(storageRoot) || resolve(storageRoot) !== storageRoot) throw scopeError()
  if (compression !== 'none' && compression !== 'zstd') throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
  const root = storageRoot
  const proof = await openStorageIsolation(root, cwd, compression)
  const project = projectDir(root, cwd)
  const limits = { ...CEILINGS, ...overrides }
  for (const key of Object.keys(CEILINGS) as (keyof DecodeLimits)[]) {
    const value = limits[key]
    if (!Number.isSafeInteger(value) || value < 1 || value > CEILINGS[key]) throw limit()
  }
  const issued = new WeakMap<DshJournalSnapshot, DirectoryChain>()

  async function checkPath(path: string): Promise<CheckedPath> {
    await proof.verify()
    const directories: DirectoryChain = [
      await canonicalDirectory(root), await canonicalDirectory(project), await canonicalDirectory(dirname(path)),
    ]
    await currentGeneration(path)
    const physical = await lstat(path, { bigint: true })
    fileKind(physical)
    return { physical, directories }
  }

  function snapshot(header: SessionHeader, observation: CheckedPath): DshJournalSnapshot {
    const { physical, directories } = observation
    const value: DshJournalSnapshot = Object.freeze({
      header: Object.freeze({ ...header }), revision: revision(physical),
    })
    issued.set(value, directories)
    return value
  }

  async function withFile<T>(
    path: string, cancellation: AbortSignal, expected: DshJournalSnapshot | undefined,
    use: (handle: FileHandle, observation: CheckedPath, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    cancellation.throwIfAborted()
    if (decoding) throw new ScopedJournalError('ACMI_JOURNAL_BUSY')
    decoding = true
    const started = performance.now()
    const deadline = AbortSignal.timeout(limits.maxDurationMs)
    const signal = AbortSignal.any([cancellation, deadline])
    let handle: FileHandle | undefined
    try {
      const { physical: pathBefore, directories } = await checkPath(path)
      if (expected !== undefined && (revision(pathBefore) !== expected.revision
        || !sameDirectories(directories, issued.get(expected)))) throw changed()
      const sizeLimit = compression === 'zstd' ? limits.maxCompressedBytes : limits.maxPlainBytes
      if (pathBefore.size > BigInt(sizeLimit)) throw limit()
      signal.throwIfAborted()
      const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)
      handle = await open(path, flags)
      const opened = await handle.stat({ bigint: true })
      fileKind(opened)
      const openedRevision = revision(opened)
      const pathOpened = await checkPath(path)
      if (openedRevision !== revision(pathBefore) || openedRevision !== revision(pathOpened.physical)
        || !sameDirectories(directories, pathOpened.directories)) throw changed()
      signal.throwIfAborted()
      const value = await use(handle, { physical: opened, directories }, signal)
      const descriptorAfter = await handle.stat({ bigint: true })
      fileKind(descriptorAfter)
      const pathAfter = await checkPath(path)
      if (revision(descriptorAfter) !== openedRevision || revision(pathAfter.physical) !== openedRevision
        || !sameDirectories(directories, pathAfter.directories)) {
        throw changed()
      }
      signal.throwIfAborted()
      if (performance.now() - started > limits.maxDurationMs) throw limit()
      return value
    } catch (error) {
      cancellation.throwIfAborted()
      if (deadline.aborted) throw limit()
      if (error instanceof ScopedJournalError || (expected === undefined && missing(error))) throw error
      if (missing(error)) throw changed()
      throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT')
    } finally {
      try { await handle?.close() } finally { decoding = false }
    }
  }

  function pathForSegment(segment: string): string {
    return join(project, segment, generationLogFilename(SESSION_FORMAT_VERSION, compression))
  }

  async function inspectSegment(segment: string, signal: AbortSignal): Promise<DshJournalSnapshot | undefined> {
    const path = pathForSegment(segment)
    try {
      return await withFile(path, signal, undefined, async (handle, observation, bounded) => {
        const { physical } = observation
        const { header } = await readHeader(handle, Number(physical.size), compression, limits, bounded)
        if (header.cwd !== cwd || encodeSegment(header.id) !== segment) throw scopeError()
        return snapshot(header, observation)
      })
    } catch (error) {
      if (missing(error)) {
        return undefined
      }
      throw error
    }
  }

  async function discover(signal: AbortSignal): Promise<readonly DshJournalSnapshot[]> {
    signal.throwIfAborted()
    let dir
    let rootIdentity: string
    let projectIdentity: string
    try {
      await proof.verify()
      rootIdentity = await canonicalDirectory(root)
      projectIdentity = await canonicalDirectory(project)
      dir = await opendir(project)
    } catch (error) {
      signal.throwIfAborted()
      if (missing(error)) return []
      throw error instanceof ScopedJournalError ? error : scopeError()
    }
    const values: DshJournalSnapshot[] = []
    let count = 0
    for await (const entry of dir) {
      signal.throwIfAborted()
      if (++count > MAX_PARTITION_ENTRIES) throw limit()
      if (entry.isSymbolicLink()) throw scopeError()
      if (!entry.isDirectory()) continue
      const value = await inspectSegment(entry.name, signal)
      if (value !== undefined) values.push(value)
    }
    await proof.verify()
    if (rootIdentity !== await canonicalDirectory(root) || projectIdentity !== await canonicalDirectory(project)) throw changed()
    signal.throwIfAborted()
    return values
  }

  return {
    partitionId: proof.partitionId,
    async list(cancellation) {
      const deadline = AbortSignal.timeout(limits.maxDurationMs)
      try {
        return await discover(AbortSignal.any([deadline, cancellation]))
      } catch (error) {
        cancellation.throwIfAborted()
        if (deadline.aborted) throw limit()
        throw error instanceof ScopedJournalError ? error : scopeError()
      }
    },
    inspect: (id, signal) => inspectSegment(encodeSegment(id), signal),
    read(value, signal) {
      if (!issued.has(value)) return Promise.reject(scopeError())
      const { header } = value
      const path = pathForSegment(encodeSegment(header.id))
      return withFile(path, signal, value, async (handle, { physical }, bounded) => {
        const reader = await readHeader(handle, Number(physical.size), compression, limits, bounded)
        if (reader.header.id !== header.id || reader.header.cwd !== cwd || reader.header.createdAt !== header.createdAt) throw scopeError()
        return reader.body()
      })
    },
  }
}
