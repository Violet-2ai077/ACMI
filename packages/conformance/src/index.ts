import type {
  AdapterCapabilities, Cancellation, EventRef, HarnessAdapter, NormalizedRuntimeEvent, Offer,
  RuntimeSessionRef, TaskRecord, ToolCall, ToolResult, WorkspaceScope,
} from '@acmi/contracts'
import { negotiate, project, resolveToolResult, taskHistory } from '@acmi/core'
import { capabilityOffer, parseAdapterCapabilities, parseEventRef, parseNormalizedEvent, parseRuntimeSessionRef } from '@acmi/sdk'

export interface SessionFixture {
  readonly session: RuntimeSessionRef
  /** Independent expected metadata, not captured by the adapter under test. */
  readonly events: readonly NormalizedRuntimeEvent[]
}

export interface AdapterFixture {
  readonly adapter: HarnessAdapter
  readonly capabilities: AdapterCapabilities
  readonly sessions: readonly [SessionFixture, SessionFixture]
  readonly scope: WorkspaceScope
  readonly foreignScope: WorkspaceScope
  /** Check declared runtime behavior, without grading ACMI-side binding projection. */
  readonly observationOnly?: true
  /** Required for persistentHistory: open a new adapter over the same persisted source. */
  readonly reopen?: () => Promise<HarnessAdapter>
}

export interface ConformanceResult {
  readonly level: 0 | 1 | 2 | 3 | 4
  readonly passed: boolean
  readonly checks: readonly { readonly id: string; readonly passed: boolean }[]
}

const active = { cancelled: false }
const cancelled = { cancelled: true }
const message = (event: NormalizedRuntimeEvent) => event.kind === 'user' || event.kind === 'assistant'
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const sameRef = (ref: EventRef, value: unknown) => equal(parseEventRef(ref), parseEventRef(value))
const sameSession = (session: RuntimeSessionRef, value: unknown) => equal(parseRuntimeSessionRef(session), parseRuntimeSessionRef(value))

async function read(adapter: HarnessAdapter, fixture: SessionFixture, scope: WorkspaceScope): Promise<NormalizedRuntimeEvent[]> {
  const events: NormalizedRuntimeEvent[] = []
  for await (const value of adapter.observeSession(fixture.session, scope, active)) {
    const event = parseNormalizedEvent(value)
    if (event === null || events.length >= fixture.events.length) throw new Error('Invalid observation')
    events.push(event)
  }
  return events
}

async function denied(adapter: HarnessAdapter, session: RuntimeSessionRef, scope: WorkspaceScope, cancel: Cancellation): Promise<boolean> {
  try {
    for await (const _ of adapter.observeSession(session, scope, cancel)) return false
  } catch {
    // Implementations may either reject or return an empty iterable.
  }
  return true
}

function expected(fixture: SessionFixture): NormalizedRuntimeEvent[] {
  return fixture.events.map(value => {
    const event = parseNormalizedEvent(value)
    if (event === null) throw new Error('Invalid fixture metadata')
    return event
  })
}

function bindingEvidence(streams: readonly NormalizedRuntimeEvent[][]): { local: boolean; crossSession: boolean } {
  const first = streams[0]?.find(message)
  const second = streams[1]?.find(message)
  if (first === undefined || second === undefined) return { local: false, crossSession: false }
  const taskA: TaskRecord = { taskId: '10000000-0000-4000-8000-000000000001', workspaceId: 'fixture', status: 'open' }
  const taskB: TaskRecord = { ...taskA, taskId: '10000000-0000-4000-8000-000000000002' }
  const firstRef = (localSeq: number) => ({ ...first.ref, localSeq })
  const secondRef = (localSeq: number) => ({ ...second.ref, localSeq })
  const tasks = [taskA, taskB]
  // Use observed Session identities and source cuts in an isolated, synthetic binding journal.
  const rows = project([
    { kind: 'bind', ref: firstRef(0), taskId: taskA.taskId },
    { kind: 'assistant', ref: firstRef(1) },
    { kind: 'assistant', ref: secondRef(1) },
    { kind: 'bind', ref: firstRef(2), taskId: taskB.taskId },
    { kind: 'assistant', ref: firstRef(3) },
    { kind: 'bind', ref: secondRef(2), taskId: taskA.taskId },
    { kind: 'assistant', ref: secondRef(3) },
  ], tasks)
  const [beforeSwitch, unbound, afterSwitch, resumed] = rows.map(row => row.attribution)
  const local = beforeSwitch?.kind === 'bound' && beforeSwitch.binding.taskId === taskA.taskId && beforeSwitch.binding.revision === 1
    && afterSwitch?.kind === 'bound' && afterSwitch.binding.taskId === taskB.taskId && afterSwitch.binding.revision === 2
  const history = taskHistory(rows, taskA.taskId)
  const crossSession = unbound?.kind === 'unresolved' && resumed?.kind === 'bound' && resumed.binding.revision === 1
    && equal(history.map(row => row.ref), [firstRef(1), secondRef(3)])
  return { local, crossSession }
}

async function causalEvidence(adapter: HarnessAdapter, scope: WorkspaceScope, streams: readonly NormalizedRuntimeEvent[][]): Promise<boolean> {
  const calls = streams.flat().filter((event): event is ToolCall => event.kind === 'tool-call')
  const results = streams.flat().filter((event): event is ToolResult => event.kind === 'tool-result')
  let paired = false
  let unpaired = false
  for (const result of results) {
    const call = calls.find(candidate => resolveToolResult(result, candidate) !== null)
    const actual = await adapter.resolveCausality(result, scope, active)
    if (call === undefined) {
      if (result.originalCall !== null || actual !== null) return false
      unpaired = true
    } else {
      if (actual?.kind !== 'tool-result-of' || !sameRef(call.ref, actual.call)) return false
      paired = true
    }
  }
  return paired && unpaired
}

async function causalDenied(adapter: HarnessAdapter, event: NormalizedRuntimeEvent, scope: WorkspaceScope, cancel: Cancellation): Promise<boolean> {
  try { return await adapter.resolveCausality(event, scope, cancel) === null } catch { return true }
}

function matchesOffer(expectedOffer: Offer, actual: Offer): boolean {
  const result = negotiate(expectedOffer, actual)
  return result.ok && actual.minor === expectedOffer.minor && actual.required.length === 0
    && equal([...actual.offered].sort(), [...expectedOffer.offered].sort())
}

/** Run bounded synthetic checks. Never include adapter errors or source data in the report. */
export async function runConformance(fixture: AdapterFixture): Promise<ConformanceResult> {
  const { adapter, scope, foreignScope, sessions, reopen } = fixture
  const checks: { id: string; passed: boolean }[] = []
  async function check(id: string, run: () => boolean | Promise<boolean>): Promise<boolean> {
    let passed = false
    try { passed = await run() } catch { /* Adapter errors are not report data. */ }
    checks.push({ id, passed })
    return passed
  }

  const capabilities = parseAdapterCapabilities(fixture.capabilities)
  const profile = await check('capability-profile', async () => capabilities !== null
    && capabilities.adapterId === adapter.adapterId && capabilities.adapterVersion === adapter.adapterVersion
    && matchesOffer(capabilityOffer(capabilities), await adapter.getCapabilities()))
  let streams: NormalizedRuntimeEvent[][] = []
  const normalized = await check('event-normalization', async () => {
    streams = await Promise.all(sessions.map(session => read(adapter, session, scope)))
    return streams.every((events, index) => {
      const source = sessions[index]
      const cut = events[0]?.ref.sourceRevision
      return source !== undefined && events.length > 0 && equal(events, expected(source))
        && events.every((event, i) => event.ref.sourceRevision === cut && event.ref.localSeq > (events[i - 1]?.ref.localSeq ?? -1))
    })
  })
  const identity = await check('session-identity', () => !sameSession(sessions[0].session, sessions[1].session)
    && sessions.every(({ session }, index) => session.adapterId === adapter.adapterId
      && streams[index]?.every(event => sameSession(session, event.ref.session)) === true))
  const forged = Object.freeze({}) as WorkspaceScope
  const relevant = streams.flat().find(event => event.kind === 'tool-result' && event.originalCall !== null)
  const isolated = await check('workspace-isolation', async () => {
    for (const deniedScope of [foreignScope, forged]) {
      for (const { session } of sessions) if (!await denied(adapter, session, deniedScope, active)) return false
      if (relevant !== undefined && !await causalDenied(adapter, relevant, deniedScope, active)) return false
    }
    return true
  })
  await check('cancellation', async () => {
    for (const { session } of sessions) if (!await denied(adapter, session, scope, cancelled)) return false
    return relevant === undefined || causalDenied(adapter, relevant, scope, cancelled)
  })
  await check('unsupported-capability', async () => {
    const sample = streams.flat().find(message) ?? sessions.flatMap(session => session.events).find(message)
    if (sample === undefined || await adapter.resolveCausality(sample, scope, active) !== null) return false
    if (capabilities?.causalToolResults) return true
    const unpaired: ToolResult = { kind: 'tool-result', ref: sample.ref, turnId: 'unsupported', stepId: 'unsupported', toolCallId: 'unsupported', originalCall: null }
    return await adapter.resolveCausality(unpaired, scope, active) === null
  })
  const honesty = await check('capability-honesty', () => {
    if (capabilities === null || !normalized) return false
    const events = streams.flat()
    return capabilities.sessionEvents === events.some(event => event.kind === 'session-open' || event.kind === 'session-close')
      && capabilities.messageEvents === events.some(message)
      && capabilities.toolCallEvents === events.some(event => event.kind === 'tool-call' || event.kind === 'tool-result')
      && capabilities.subagentEvents === events.some(event => event.kind === 'agent-open' || event.kind === 'agent-close')
      && capabilities.causalToolResults === events.some(event => event.kind === 'tool-result' && event.originalCall !== null)
  })

  let evidence = { local: false, crossSession: false }
  const binding = fixture.observationOnly !== true
    && await check('binding-inheritance', () => { evidence = bindingEvidence(streams); return evidence.local })
  const crossSession = fixture.observationOnly !== true
    && await check('cross-session-identity', () => identity && evidence.crossSession)
  if (capabilities?.eventReplay) {
    await check('replay-determinism', async () => {
      const replay = await Promise.all(sessions.map(session => read(adapter, session, scope)))
      return equal(streams, replay) && equal(project(streams.flat(), []), project(replay.flat(), []))
    })
  }
  const causality = capabilities?.causalToolResults
    ? await check('tool-causality', () => causalEvidence(adapter, scope, streams))
    : false
  const persistent = capabilities?.persistentHistory
    ? await check('persistent-history', async () => {
      if (reopen === undefined) return false
      const reopened = await reopen()
      return reopened !== adapter && reopened.adapterId === adapter.adapterId && reopened.adapterVersion === adapter.adapterVersion
        && equal(streams, await Promise.all(sessions.map(session => read(reopened, session, scope))))
    }) : false

  const passed = checks.every(item => item.passed)
  let level: ConformanceResult['level'] = 0
  if (passed && profile && identity && isolated && honesty && capabilities?.messageEvents && capabilities.stableSessionIdentity) {
    level = binding ? (causality ? (persistent && crossSession ? 4 : 3) : 2) : 1
  }
  return { level, passed, checks }
}
