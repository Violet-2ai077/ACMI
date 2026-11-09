import type { CausalReference, HistoryRow, NormalizedRuntimeEvent, ScopeAuthority, WorkspaceScope } from '@acmi/contracts'
import { authorizeScope } from '@acmi/core'
import { observerStyles } from './styles.ts'

export interface ObserverEntry {
  readonly row: HistoryRow
  readonly kind?: NormalizedRuntimeEvent['kind']
  readonly cause?: CausalReference
}

export interface ObserverHost {
  readonly authority: Pick<ScopeAuthority, 'permits'>
  /** Both workspace identity and scope come from trusted host context, not route parameters. */
  readonly workspaceId: string
  readonly scope: unknown
  readonly readTimeline: (scope: WorkspaceScope) => Promise<readonly ObserverEntry[]>
}

function escape(value: string | number): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function groupKey(ref: HistoryRow['ref']): string {
  const { adapterId, instanceId, sessionId, incarnation } = ref.session
  return JSON.stringify([adapterId, instanceId, sessionId, incarnation])
}

function renderEvent(entry: ObserverEntry): string {
  const { ref, attribution } = entry.row
  const call = entry.cause?.call
  const cause = entry.kind === 'tool-result' && entry.cause?.kind === 'tool-result-of' && call !== undefined
    && groupKey(call) === groupKey(ref) && call.sourceRevision === ref.sourceRevision && call.localSeq < ref.localSeq ? call : undefined
  const task = attribution.kind === 'bound'
    ? `<p>Task UUID <code>${escape(attribution.binding.taskId)}</code></p>
       <p class="meta">Session-local binding revision ${escape(attribution.binding.revision)} &middot; ${escape(attribution.method)}</p>
       <p class="meta">Effective after <code>${escape(attribution.binding.effectiveAfter.sourceRevision)} #${escape(attribution.binding.effectiveAfter.localSeq)}</code></p>`
    : '<p><span class="badge warning">Unresolved</span></p><p class="meta">No proved Task attribution.</p>'
  return `<li class="event">
    <div><strong><span class="position">#${escape(ref.localSeq)}</span>${escape(entry.kind ?? 'Observed event')}</strong></div>
    <div>${task}</div>
    <div><p>Source revision <code>${escape(ref.sourceRevision)}</code></p>${cause === undefined ? '' :
      `<p class="meta">tool-result-of <code>${escape(cause.sourceRevision)} #${escape(cause.localSeq)}</code></p>`}</div>
  </li>`
}

/** Authorize before reading and re-check before returning a payload-free static document. */
export async function renderObserver(host: ObserverHost): Promise<string> {
  const { authority, scope, workspaceId, readTimeline } = host
  if (!authorizeScope(authority, scope, workspaceId)) throw new Error('Observer workspace not authorized')
  const entries = await readTimeline(scope as WorkspaceScope)
  if (!authorizeScope(authority, scope, workspaceId)) throw new Error('Observer workspace not authorized')
  const groups = new Map<string, ObserverEntry[]>()
  const tasks = new Map<string, Set<string>>()
  let unresolved = 0
  for (const entry of entries) {
    const key = groupKey(entry.row.ref)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [entry])
    else group.push(entry)
    if (entry.row.attribution.kind === 'unresolved') unresolved++
    else {
      const taskId = entry.row.attribution.binding.taskId
      const seen = tasks.get(taskId)
      if (seen === undefined) tasks.set(taskId, new Set([key]))
      else seen.add(key)
    }
  }
  const taskList = [...tasks].map(([taskId, sessions]) =>
    `<li><code>${escape(taskId)}</code><span class="meta">${sessions.size} Session${sessions.size === 1 ? '' : 's'}</span></li>`).join('')
  const timeline = [...groups.values()].map(([first, ...rest], index) => {
    if (first === undefined) return ''
    const session = first.row.ref.session
    return `<section class="session" aria-labelledby="session-${index}">
      <h3 id="session-${index}">${escape(session.sessionId)}</h3>
      <p class="meta">Adapter <code>${escape(session.adapterId)}</code> &middot; instance <code>${escape(session.instanceId)}</code> &middot; incarnation <code>${escape(session.incarnation)}</code></p>
      <ol class="timeline">${[first, ...rest].map(renderEvent).join('')}</ol>
    </section>`
  }).join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>ACMI Observer</title>
  <style>${observerStyles}</style>
</head>
<body><main>
  <header><p class="eyebrow">ACMI / Public Alpha</p><h1>ACMI Observer</h1>
    <p class="caption"><span class="badge">Read-only</span> Workspace-scoped attribution and event provenance. No message bodies, tool payloads or write actions.</p></header>
  <section class="summary" aria-labelledby="tasks"><h2 id="tasks">Task history</h2>
    <p class="meta">${groups.size} Sessions &middot; ${entries.length} events &middot; ${unresolved} unresolved</p>
    ${taskList === '' ? '<p>No attributed Tasks in this view.</p>' : `<ul class="tasks" aria-label="Task UUIDs">${taskList}</ul>`}
  </section>
  <section aria-labelledby="timeline"><h2 id="timeline">Session timeline</h2>
    ${timeline === '' ? '<p>No events in this view.</p>' : timeline}</section>
  <footer class="meta">Sequence numbers and binding revisions are Session-local. Session grouping does not imply a global causal order.</footer>
</main></body>
</html>`
}
