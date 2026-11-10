import assert from 'node:assert/strict'
import { canonical, createScopeAuthority, makeQualificationEvidence, runtimeFactId, TaskCandidateIndex, TaskGraph } from '../../packages/core/dist/index.js'
import { sha } from './corpus.mjs'

export function makeEvaluationFixture(row) {
  const workspaceId = 'q91-synthetic'
  const authority = createScopeAuthority()
  const scope = authority.grant(workspaceId)
  const catalog = new TaskCandidateIndex({ workspaceId, authority, digest: sha })
  const session = n => ({ adapterId: 'fixture', instanceId: workspaceId, sessionId: row.id + '-s' + n, incarnation: '1' })
  const identity = session(row.turns.at(-1).session)
  const current = row.tasks.find(task => task.taskId === row.binding && !task.foreign && task.status === 'open')
  const target = current ?? row.tasks.find(task => !task.foreign && task.status === 'open')
  for (const task of row.tasks) if (!task.foreign) {
    catalog.upsert(scope, { workspaceId, taskId: task.taskId, title: task.title, objective: task.objective, status: task.status,
      lastActive: Math.max(0, 10_000_000 - task.age), revision: sha(canonical(task)),
      ...(task.session === undefined ? {} : { session: session(task.session) }) })
  }
  const lastUser = [...row.turns].reverse().find(t => t.actor === 'user')?.text.slice(0, 2048)
  const lookup = () => catalog.retrieve(scope, { session: identity,
    ...(current ? { currentTaskId: current.taskId } : {}), ...(lastUser ? { query: lastUser } : {}) })
  let cut
  let graph
  const facts = [], evidence = []
  if (target) {
    graph = new TaskGraph({ workspaceId, taskId: target.taskId, authority, digest: sha })
    const changes = [
      { kind: 'task-opened', objective: target.objective, criteria: ['Explicit Host confirmation required'] },
      ...['root', 'ship', 'verify', 'left', 'right'].map(nodeId => ({ kind: 'node-added', nodeId, title: nodeId, role: 'work' })),
      { kind: 'mainline-advanced', nodeId: 'root' },
      { kind: 'work-transitioned', nodeId: 'root', state: 'ready' },
      { kind: 'work-transitioned', nodeId: 'root', state: 'running' },
    ]
    for (const [i, change] of changes.entries()) assert.equal(graph.append(scope, { ...change, seq: i + 1, id: 'seed-' + i,
      source: { session: session(0), localSeq: i, sourceRevision: 'synthetic-host-seed' } }), 'applied')
    const snapshot = graph.read(scope)
    cut = { workspaceId, revision: sha(canonical(snapshot)), snapshot }
    for (const [i, turn] of row.turns.entries()) {
      const ref = session(turn.session)
      const seq = i + 1
      const detail = turn.actor === 'user' ? { kind: 'user' }
        : turn.actor === 'assistant' ? { kind: 'assistant', turn: 'synthetic-' + seq, step: 's1' }
          : turn.actor === 'tool' ? { kind: 'tool-result', turn: 'synthetic-' + seq, step: 's1', callId: 'call-' + seq }
            : { kind: 'turn-complete', turn: 'synthetic-child-' + seq }
      const record = { fact: { version: 'runtime-fact-v1', eventId: runtimeFactId(ref, seq, sha), workspaceId,
        source: { session: ref, localSeq: seq, sourceRevision: sha(canonical(ref)) },
        runtimeVersion: 'synthetic', adapterVersion: 'fixture', provenance: 'runtime_observed', detail },
      attribution: { kind: 'assigned', taskId: target.taskId, via: 'host-source' }, observedAt: '2026-11-10T00:00:00Z' }
      facts.push(record)
      const excerpt = turn.text.slice(0, 1024)
      const proof = makeQualificationEvidence(record, target.taskId, sha, {
        generation: 1, ...(turn.actor === 'subagent' ? {} : { excerpt, totalLength: turn.text.length }),
      })
      if (proof) evidence.push(proof)
    }
  }
  const dialogue = row.turns.map(({ actor, text }) => ({ actor, text }))
  const checkpoint = graph?.checkpoint(scope)
  const preview = (changes, proof) => {
    const simulated = checkpoint && graph.restore(scope, checkpoint)
    if (!simulated) return 'projection-preview-required'
    for (const [i, change] of changes.entries()) {
      const status = simulated.append(scope, { ...change, id: sha(canonical([row.id, i, change])), seq: cut.snapshot.through + i + 1, source: proof.source })
      if (status !== 'applied') return simulated.read(scope).unresolved.at(-1)?.reason ?? status
    }
    return null
  }
  return { lookup, packetInput: retrieval => ({ synthetic: true, workspaceId, dialogue, candidates: retrieval.candidates,
    candidateRevision: retrieval.revision, ...(current ? { currentTaskId: current.taskId } : {}),
    ...(cut ? { cut, facts, evidence, preview } : {}) }) }
}

export function retrievalStress() {
  const workspaceId = 'q91-synthetic-scale'
  const authority = createScopeAuthority(), scope = authority.grant(workspaceId)
  return [128, 512, 2048].map(size => {
    const catalog = new TaskCandidateIndex({ workspaceId, authority, digest: sha, maxEntries: size })
    for (let i = 0; i < size; i++) {
      const id = '09100000-0000-4000-8000-' + i.toString(16).padStart(12, '0')
      catalog.upsert(scope, { workspaceId, taskId: id, title: 'Runner cache task ' + i, objective: 'Verify the workspace cache',
        status: 'open', lastActive: i, revision: sha(id) })
    }
    return { size, lookup: () => catalog.retrieve(scope, { query: 'runner cache verify workspace' }) }
  })
}
