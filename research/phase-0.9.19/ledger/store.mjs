import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, relative, join, isAbsolute } from 'node:path'
import { hash } from '../protocol/contracts.mjs'

export const EVIDENCE_ROOT = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1')
function within(child, parent) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
function safePath(path, allowed) {
  if (!within(path, allowed) || !within(allowed, EVIDENCE_ROOT)) throw new Error('outside evidence root')
  let part = path
  while (within(part, allowed)) {
    if (existsSync(part) && lstatSync(part).isSymbolicLink()) throw new Error('linked evidence path')
    if (part === allowed) break
    part = resolve(part, '..')
  }
  if (existsSync(allowed) && !within(realpathSync(allowed), realpathSync(EVIDENCE_ROOT))) throw new Error('outside resolved root')
  if (existsSync(EVIDENCE_ROOT) && realpathSync(EVIDENCE_ROOT).toLowerCase() !== EVIDENCE_ROOT.toLowerCase()) throw new Error('linked evidence ancestor')
}
export const assertEvidencePath = path => safePath(resolve(path), EVIDENCE_ROOT)
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)

export function openLedger({ root, runId, allowedRoot = EVIDENCE_ROOT, scope = {}, resume = false, oracleHash = null }) {
  if (!validId(runId)) throw new Error('invalid run id')
  const allowed = resolve(allowedRoot), base = resolve(root), path = join(base, runId)
  safePath(path, allowed)
  const manifestPath = join(path, 'manifest.json'), eventsPath = join(path, 'events.jsonl')
  if (!resume) {
    mkdirSync(base, { recursive: true })
    mkdirSync(path)
    for (const sub of ['inputs', 'outputs', 'transport', 'records', 'checkpoints']) mkdirSync(join(path, sub))
    writeFileSync(manifestPath, JSON.stringify({ version: 1, run_id: runId, scope, transport: 'fake', oracle_hash: oracleHash }), { flag: 'wx' })
    writeFileSync(eventsPath, '', { flag: 'wx' })
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.run_id !== runId || JSON.stringify(manifest.scope) !== JSON.stringify(scope)) throw new Error('foreign run/scope')
  function restore() {
    safePath(path, allowed)
    const raw = readFileSync(eventsPath, 'utf8')
    if (raw && !raw.endsWith('\n')) throw new Error('partial journal')
    const events = raw.trim() ? raw.trimEnd().split('\n').map(l => JSON.parse(l)) : []
    let previous = ''
    const reservations = [], attempts = [], proposals = []
    for (const [i, event] of events.entries()) {
      const { digest, ...body } = event
      if (body.seq !== i + 1 || body.previous !== previous || digest !== hash(body)) throw new Error('journal digest')
      previous = digest
      if (event.kind === 'reserve') {
        if (event.value.request_hash && hash(readFileSync(join(path, 'inputs', event.value.attempt_id + '.json'))) !== event.value.request_hash) throw new Error('reserved request digest')
        reservations.push(event.value)
      }
      if (event.kind === 'attempt') {
        for (const [file, digest] of Object.entries(event.value.files)) {
          const filePath = resolve(path, file)
          if (!within(filePath, path) || lstatSync(filePath).isSymbolicLink()) throw new Error('unsafe artifact')
          if (hash(readFileSync(filePath)) !== digest) throw new Error('artifact digest')
        }
        attempts.push(JSON.parse(readFileSync(join(path, 'records', event.value.attempt_id + '.json'), 'utf8')))
      }
      if (event.kind === 'proposal') proposals.push(event.value)
    }
    const lastCheckpoint = events.filter(e => e.kind === 'checkpoint').at(-1)
    if (lastCheckpoint) {
      const checkpoint = JSON.parse(readFileSync(join(path, 'checkpoints', lastCheckpoint.value.file), 'utf8'))
      if (checkpoint.run_id !== runId || JSON.stringify(checkpoint.scope) !== JSON.stringify(scope) ||
        checkpoint.through !== lastCheckpoint.seq - 1 || checkpoint.digest !== lastCheckpoint.previous) throw new Error('checkpoint scope/digest')
    }
    return { run_id: runId, scope, events, reservations, attempts, proposals, digest: previous }
  }
  restore()
  function append(kind, value) {
    const state = restore()
    const body = { seq: state.events.length + 1, previous: state.digest, kind, value }
    const event = { ...body, digest: hash(body) }
    appendFileSync(eventsPath, JSON.stringify(event) + '\n', { flush: true })
    return event.digest
  }
  return {
    path, scope,
    restore,
    reserve(attempt_id, turnKey, input) {
      if (!validId(attempt_id)) throw new Error('invalid attempt id')
      const state = restore()
      if (state.reservations.some(r => r.attempt_id === attempt_id || r.turnKey === turnKey)) throw new Error('duplicate generation reservation')
      const request_hash = input === undefined ? null : hash(JSON.stringify(input))
      if (input !== undefined) writeFileSync(join(path, 'inputs', attempt_id + '.json'), JSON.stringify(input), { flag: 'wx', flush: true })
      return append('reserve', { attempt_id, turnKey, request_hash })
    },
    appendAttempt(record) {
      const state = restore(), id = record.attempt_id
      if (state.attempts.some(a => a.attempt_id === id)) throw new Error('duplicate attempt')
      if (!state.reservations.some(r => r.attempt_id === id)) throw new Error('attempt not reserved')
      const { raw, input, chunks, ...meta } = record
      const files = {}
      const save = (file, data) => {
        safePath(join(path, file), allowed)
        writeFileSync(join(path, file), data, { flag: 'wx', flush: true })
        files[file] = hash(data)
      }
      const reserved = state.reservations.find(r => r.attempt_id === id)
      if (reserved.request_hash) {
        if (reserved.request_hash !== hash(JSON.stringify(input))) throw new Error('reserved request changed')
        files['inputs/' + id + '.json'] = reserved.request_hash
      } else save('inputs/' + id + '.json', JSON.stringify(input))
      save('outputs/' + id + '.raw', raw)
      save('transport/' + id + '.jsonl', chunks.map(c => JSON.stringify(c) + '\n').join(''))
      save('records/' + id + '.json', JSON.stringify({ ...meta, request_hash: hash(JSON.stringify(input)), raw_hash: hash(raw) }))
      return append('attempt', { attempt_id: id, files })
    },
    appendProposal(proposal) {
      const state = restore()
      const attempt = state.attempts.find(a => a.attempt_id === proposal.attempt_id)
      if (!proposal.valid || !attempt || attempt.arm === 'D' || state.proposals.some(p => p.attempt_id === proposal.attempt_id)) throw new Error('invalid proposal')
      return append('proposal', { ...proposal, provenance: 'model_proposed', status: 'proposed' })
    },
    checkpoint() {
      const state = restore(), file = 'through-' + state.events.length + '.json'
      writeFileSync(join(path, 'checkpoints', file), JSON.stringify({ run_id: runId, scope, through: state.events.length, digest: state.digest }), { flag: 'wx', flush: true })
      return append('checkpoint', { file })
    }
  }
}
