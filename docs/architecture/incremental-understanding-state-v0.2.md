# Incremental Understanding State v0.2

Phase 0.9.3 adds an in-memory interpretation cache, not a Task Graph, Binding store, or durable replay ledger. It sits after trusted Host admission and before the layered read-only pipeline. Neither the cache nor its dsh Shadow consumer holds a writer.

## Cut and checkpoint

`LayeredState` keys a checkpoint by Workspace and Session. The observed cut records Session incarnation, Graph/Binding/source/catalog revisions, Workspace authorization epoch, policy version, and committed source cursor. The Host supplies an exclusive `fromCursor` boundary and an observation digest; a completed native delta can span multiple source rows without counting as a gap. `lastAnalyzedCursor` is distinct from the last observed cursor because a safely skipped event may advance only the latter.

The Binding task ID is copied from the Host's current snapshot for each call. Recent Task identities are hypotheses with exact candidate summary revisions and origin cursors. Memory holds at most four such hypotheses, four optional identity IDs, four unresolved IDs, eight draft IDs and four short feature tokens. It retains no turn text, packet, proposal body, execution capability or analysis output. The dsh adapter issues a retained hint only if the currently scoped context admits that candidate and its exact revision. Session-local hypotheses never bridge Sessions automatically.

| Observation | State action |
|---|---|
| New Session incarnation, source gap, Graph rewind | Empty the interpretation; start from the current authenticated cut. |
| Binding revision or observed bound Task changes; authorization, source, candidate or policy revision changes | Empty the interpretation. |
| Monotonic Graph advance | Drop pending proposal IDs; run against the new Graph cut. Identity hints keep their origin cursors and exact candidate revisions, which context assembly revalidates. |
| TTL expiry or clock rewind | Discard interpretation; keep the replay boundary. Metadata skips do not refresh analysis TTL. |
| Older cursor within an incarnation or lower authorization epoch | Reject as stale without changing the newer checkpoint. |
| Same cursor and digest | Return `duplicate` without rerunning or returning the previous output. Apply any relevant invalidation to cache memory. |
| Same cursor, different digest | Clear interpretation and quarantine that cursor. A subsequent authenticated delta may advance, but cannot reuse the invalidated memory. |
| Cancellation, stale async cut, retry exhaustion or failed work | No checkpoint commit; any already-identified invalidation remains effective. |

The default limits are 64 cached Sessions (least recently committed evicted), four active Sessions across one scheduler instance, 30 seconds interpretation TTL, and one retry for explicitly transient work. Configurable caps are 256 Sessions, 16 in flight (never more than cached Session capacity), and five minutes TTL. The total attempt cap is always two, including retry. Single-flight admission is per Workspace/Session. Overflow returns `busy_session` or `busy_global`; there is no queue. The dsh adapter combines close, caller cancellation and a 250 ms default deadline. A cancelled caller receives no output; work that does not cooperate still occupies its slot until it settles, preventing hidden overcommit. The adapter revalidates current scope, cut, and eligible entities after async catalog retrieval and before returning a result.

Eviction and restart lose the ephemeral replay boundary. The trusted Host remains responsible for supplying a current committed delta and coordinating instance ownership; the cache is not distributed fencing or durable exactly-once delivery. The warm path uses bounded preselected observations, a prepared Graph cut and candidate summaries, not a Session rescan. Production authorization, binding, result acceptance and lifecycle changes remain outside this cache.

## Trigger strategy

Phase 0.9.2's narrow keyword gate lowered validation candidate comparisons from 40 to 33 but missed 3 of 17 required reviews. Phase 0.9.3 does not gate on text. Completed user messages always take the bounded layered path. Authenticated causal, Binding, authorization and closed-task observations are not skippable. In the gated Shadow arm, only authenticated Host `metadata` may skip, and `cursor % 8 === 0` samples it through the same analysis. A metadata envelope carrying a scoped typed fact is promoted to causal analysis. An ungated comparator is always available. Replay suppression is independent of the trigger.

The native fixture demonstrates policy wiring, not a field recall estimate or Provider savings. Evaluate required-event recall and coverage against the ungated comparator before considering any expensive-analysis gate. Treat input bytes, estimated tokens and observed local timing separately from Provider cost. Nothing here enables a production trigger.
