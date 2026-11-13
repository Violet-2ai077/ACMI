/** Host-only provisioning and verification for a dedicated journal root. */

import { createHash } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { continuationOwner, continuationPair, verifyJournalContinuationPair } from './continuation-layout.ts'
import { projectKey, ScopedJournalError, type JsonlCompression } from './journal-format.ts'

const MARKER = '.acmi-scoped-root.json'
const MAX_BYTES = 4096

function denied(): ScopedJournalError { return new ScopedJournalError('ACMI_JOURNAL_SCOPE') }

function within(base: string, path: string): boolean {
  const from = relative(base, path)
  return from === '' || (!isAbsolute(from) && from !== '..' && !from.startsWith('..' + sep))
}

function digest(...fields: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex')
}

function fingerprint(value: BigIntStats): string {
  if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1n
    || value.ino === 0n || value.size > BigInt(MAX_BYTES)) throw denied()
  return [value.dev, value.ino, value.birthtimeNs, value.size, value.mtimeNs, value.ctimeNs].join(':')
}

async function directory(path: string): Promise<string> {
  if (!isAbsolute(path) || path !== resolve(path)) throw denied()
  const info = await lstat(path, { bigint: true })
  if (!info.isDirectory() || info.isSymbolicLink() || info.ino === 0n || await realpath(path) !== path) throw denied()
  return digest('acmi-directory-v1', path, String(info.dev), String(info.ino))
}

async function context(root: string, workspace: string, encoding: JsonlCompression) {
  if (!isAbsolute(root) || !isAbsolute(workspace)) throw denied()
  for (const protectedRoot of [workspace, join(homedir(), '.dsh'), process.env.DSH_HOME, process.env.DSH_AGENTS_HOME]) {
    if (protectedRoot === undefined || protectedRoot === '') continue
    const path = resolve(protectedRoot)
    const canonical = await realpath(path).catch(() => path)
    if ([path, canonical].some(value => within(value, root) || within(root, value))) throw denied()
  }
  const rootIdentity = await directory(root)
  const workspaceIdentity = await directory(workspace)
  return {
    version: 1, isolation: 'single-workspace', partitionVersion: 2,
    rootIdentity, workspaceIdentity, partitionId: 'acmi-p2-' + digest('acmi-partition-v2', workspaceIdentity),
    journalVersion: SESSION_FORMAT_VERSION, encoding,
  } as const
}

async function inventory(root: string, workspace: string, empty: boolean): Promise<boolean> {
  const bucket = projectKey(workspace)
  let sidecars = 0
  for await (const entry of await opendir(root)) {
    if (!empty && ((entry.name === MARKER && entry.isFile()) || (entry.name === bucket && entry.isDirectory()))
      && !entry.isSymbolicLink()) continue
    if (!empty && (entry.name === continuationOwner || entry.name === continuationPair) && entry.isFile()
      && !entry.isSymbolicLink()) { sidecars++; continue }
    throw denied()
  }
  if (sidecars === 1) throw denied()
  return sidecars === 2
}

async function readMarker(path: string): Promise<{ text: string; revision: string }> {
  const before = await lstat(path, { bigint: true })
  const revision = fingerprint(before)
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)
  await using handle = await open(path, flags)
  const opened = await handle.stat({ bigint: true })
  if (fingerprint(opened) !== revision) throw denied()
  const buffer = Buffer.alloc(MAX_BYTES + 1)
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
  if (BigInt(bytesRead) !== before.size || fingerprint(await handle.stat({ bigint: true })) !== revision
    || fingerprint(await lstat(path, { bigint: true })) !== revision) throw denied()
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead)), revision }
}

function matches(text: string, expected: Awaited<ReturnType<typeof context>>): boolean {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const data: Record<string, unknown> = { ...value }
  return Object.keys(data).length === Object.keys(expected).length + 1
    && Object.entries(expected).every(([key, field]) => data[key] === field)
    && typeof data.createdAt === 'number' && Number.isSafeInteger(data.createdAt) && data.createdAt > 0
    && text === JSON.stringify({ ...expected, createdAt: data.createdAt }) + '\n'
}

/**
 * Explicitly provision an existing empty directory. Startup never calls this.
 * @param root - canonical dedicated journal root, outside dsh homes.
 * @param workspace - canonical authorized workspace directory.
 * @param encoding - pinned native v4 encoding.
 * @returns marker path and stable v2 identity; never touches native journals.
 */
export async function createStorageIsolationMarker(
  root: string, workspace: string, encoding: JsonlCompression,
): Promise<{ path: string; partitionId: string }> {
  try {
    const expected = await context(root, workspace, encoding)
    await inventory(root, workspace, true)
    const path = join(root, MARKER)
    {
      await using handle = await open(path, 'wx', 0o600)
      await handle.writeFile(JSON.stringify({ ...expected, createdAt: Date.now() }) + '\n')
      await handle.sync()
    }
    await openStorageIsolation(root, workspace, encoding)
    return { path, partitionId: expected.partitionId }
  } catch {
    throw denied()
  }
}

/**
 * Verify an existing dedicated root and pin its marker revision.
 * @param root - canonical backend root.
 * @param workspace - canonical authorized workspace directory.
 * @param encoding - backend's configured encoding.
 * @returns a runtime proof that fails closed after marker, root or workspace replacement.
 */
export async function openStorageIsolation(
  root: string, workspace: string, encoding: JsonlCompression,
): Promise<{ partitionId: string; verify(): Promise<void> }> {
  try {
    const expected = await context(root, workspace, encoding)
    const path = join(root, MARKER)
    const paired = await inventory(root, workspace, false)
    const marker = await readMarker(path)
    if (!matches(marker.text, expected)) throw denied()
    const pair = paired ? verifyJournalContinuationPair(root, workspace, encoding, expected.partitionId) : null
    return {
      partitionId: expected.partitionId,
      async verify() {
        try {
          const current = await context(root, workspace, encoding)
          const stillPaired = await inventory(root, workspace, false)
          if (current.rootIdentity !== expected.rootIdentity || current.workspaceIdentity !== expected.workspaceIdentity
            || fingerprint(await lstat(path, { bigint: true })) !== marker.revision || stillPaired !== paired
            || (stillPaired && verifyJournalContinuationPair(root, workspace, encoding, expected.partitionId) !== pair)) throw denied()
        } catch {
          throw denied()
        }
      },
    }
  } catch {
    throw denied()
  }
}
