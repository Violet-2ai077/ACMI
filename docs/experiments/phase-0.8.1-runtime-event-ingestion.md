# Runtime evidence matrix

Tested published dsh `0.2.2-rc.1`, Cordis `4.1.0`; reviewed upstream
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` in the read-only engineering
repository. The global installation is not used. The cited paths are in
that pinned source tree.

| Runtime signal | Public source | Identity/order | Support and confidence |
| --- | --- | --- | --- |
| Session native append | `packages/core/session/src/index.ts`, `session/event` | Session object, header creation epoch and native seq | Direct observation, buffered after native append; durable ingestion after host flush |
| Session publish/dispose/resume | `session/created`, `session/disposed`, `agent/created(source)` | Live object; no durable local seq for these notifications | Disposed hook cleans observers. No durable publish/resume/terminal Session fact inferred; seed boundary is a separate native log fact |
| Agent status | `packages/core/agent/src/runtime-types.ts`, `agent/status` | Live Agent, idle/running only | Not sufficient to infer wait/resume, failure, or result acceptance; not persisted as a guessed causal event |
| Turn, step, assistant/user | Native `turn/*`, `step/*`, committed `assistant/message` and `user/message` | Native seq and available turn/step fields | Direct metadata; user intent unassigned absent matching host source link |
| Tool Call/Result | `tool/call`, append `tool/result` with `sourceEventSeqs` | Earlier exact same-epoch call + turn, step, call ID | Direct metadata; only validated one-shot causal result attribution |
| Child Agent | Registry factory parent ownership + native Session header `origin/parentSession` | Exact child incarnation, explicitly associated live parent incarnation | Header/turn evidence observed; actual child Agent execution tested; no inferred WorkResult/review |
| Subagent scheduler | `packages/subagent/subagent/src/index.ts`, `subagent/start` and `subagent/end` | Published process-local lifecycle; provider/parent and terminal data | Audited, not persisted or used as a replay cursor. Stock child factory test is not full scheduler/provider validation |
| Request/response | Public Agent request lifecycle and durable turn/step log | Request hook is not a globally durable counter | Captures durable step/assistant/turn metadata; no raw request bodies, streaming deltas or provider usage |
| Compact and snapshots | Native `compaction/start,summary,end` and `runtime-context` user-role records | Session-local seq; not an additive hook | Metadata only. Stock compact runs unmodified; excludes snapshot text from facts/graph |
| Prompt injection | `packages/core/system-prompt/src/index.ts`, `SystemPrompt.context` | Live request Agent + session, revision and host TTL | Level B opt-in only |

The stock dsh end-to-end test observes a real scripted Adapter turn, tool
pair, A/B/A switches, native Compact and suffix after observer reload.
The separate late-result fixture changes Binding between native-shaped call
and result, proving original-call attribution; no claim that the running
stock Agent naturally produced that artificial switch timing.

Subscription, disposal and attach are host operations. Feed callbacks only
buffer; no automatic Binding, model dispatch, speculative semantic change
or filesystem scan happens in the listener. Initial/explicit reconcile
uses the existing guarded stock Journal reader.
