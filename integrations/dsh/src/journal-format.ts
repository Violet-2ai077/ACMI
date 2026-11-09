/**
 * v4 read-only layout/codec adapter. encodeSegment and projectKey are from
 * DeepSeek Harness format.ts (Copyright (c) 2026 DeepSeek; MIT, see DSH-LICENSE).
 */
import { join } from 'node:path'
import { KNOWN_SESSION_EVENT_TYPES, SESSION_FORMAT_VERSION, SessionLogOffset, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { parseSessionFormatLogFilename, sessionFormatLogFilename, SessionFormatUnsupportedMigrationError } from '@deepseek-ai/dsh-session-format'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { assertReleasedV4Header, assertReleasedV4Relationships, assertV4RowAdmission } from '@deepseek-ai/dsh-session-format-v3-to-v4'

export type JsonlCompression = 'none' | 'zstd'

export interface ScopedJournalLimits {
  readonly maxCompressedBytes?: number
  readonly maxPlainBytes?: number
  readonly maxExpansionRatio?: number
  readonly maxEvents?: number
  readonly maxLineBytes?: number
  readonly maxDepth?: number
  readonly maxDurationMs?: number
}

export type ScopedJournalCode = `ACMI_JOURNAL_${'UNSUPPORTED' | 'CORRUPT' | 'LIMIT' | 'CHANGED' | 'SCOPE' | 'BUSY'}`

export class ScopedJournalError extends Error {
  constructor(readonly code: ScopedJournalCode) { super(code) }
}

export function generationLogFilename(version: number, compression: JsonlCompression): string {
  return sessionFormatLogFilename(version) + (compression === 'zstd' ? '.zstd' : '')
}

export function parseGenerationLogFilename(name: string, compression: JsonlCompression): number | undefined {
  if (compression === 'zstd') return name.endsWith('.zstd') ? parseSessionFormatLogFilename(name.slice(0, -5)) : undefined
  return parseSessionFormatLogFilename(name)
}

export function encodeSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch
    } else {
      out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
    }
  }
  return out
}

export function projectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

export const projectDir = (root: string, cwd: string) => join(root, projectKey(cwd))

export interface DshJournalInspection {
  readonly meta: SessionHeader
  readonly inheritedEventCount: number
  readonly events: readonly SessionEvent[]
}

export function strictScanner(line: Buffer) {
  if (line.length === 0 || line.indexOf(0x0a) !== line.length - 1) throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT')
  const header: unknown = JSON.parse(line.toString('utf8'))
  if (header === null || typeof header !== 'object' || Array.isArray(header) || !('version' in header)
    || typeof header.version !== 'number') {
    throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT')
  }
  if (header.version !== SESSION_FORMAT_VERSION) throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
  if (!('type' in header) || header.type !== 'session') throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT')
  const { type: _tag, ...physical } = header
  assertReleasedV4Header(physical)
  const restore = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'transformed' })
  const meta = Object.freeze(physical) as SessionHeader
  let pending = Buffer.alloc(0)
  let committedBytes = line.length
  return {
    header: meta,
    write(chunk: Buffer) {
      const combined = pending.length === 0 ? chunk : Buffer.concat([pending, chunk])
      let offset = 0
      for (let end = combined.indexOf(0x0a, offset); end !== -1; end = combined.indexOf(0x0a, offset)) {
        const row: unknown = JSON.parse(combined.subarray(offset, end).toString('utf8'))
        try {
          assertV4RowAdmission(row, KNOWN_SESSION_EVENT_TYPES)
        } catch (error) {
          if (error instanceof SessionFormatUnsupportedMigrationError) throw new ScopedJournalError('ACMI_JOURNAL_UNSUPPORTED')
          throw error
        }
        restore.decodeRow(row)
        committedBytes += end + 1 - offset
        offset = end + 1
      }
      pending = Buffer.from(combined.subarray(offset))
    },
    finish(): DshJournalInspection & { readonly committedBytes: number } {
      if (pending.length > 0) throw new ScopedJournalError('ACMI_JOURNAL_CORRUPT')
      const artifact = restore.finish()
      assertReleasedV4Relationships(artifact, KNOWN_SESSION_EVENT_TYPES)
      return {
        meta, committedBytes,
        inheritedEventCount: SessionLogOffset(artifact.inheritedEventCount),
        events: artifact.events as unknown as readonly SessionEvent[],
      }
    },
  }
}
