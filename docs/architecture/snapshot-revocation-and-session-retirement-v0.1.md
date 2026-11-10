# Snapshot revocation and Session retirement

| Operation | Result in stock 0.2.2-rc.1 |
| --- | --- |
| Stop future contribution | GO: grant, TTL, graph/source change, disposal or explicit retirement invalidate the registration. |
| Continue same Session after securely removing old bytes | NO-GO: no verified public request-only text contribution, complete history filter, or secure native cleanup. |
| Block ordinary and native Compact adapter requests from the old Session | CONDITIONAL GO in the isolated Host with the guard mounted continuously. Both are keyed by Session id; the guard does not rewrite requests. |
| Delete local copies or recall a provider disclosure | NO-GO: unsupported here; retention is unknown. |

`llm/stream(options, next)` is a public waterfall and `next()` cannot take
replacement messages. The Host stops the iterable before invoking it.
The guard additionally denies recognized foreign ACMI snapshot markers and
direct seeded descendants that retain a managed parent id. These are
defense in depth, not a complete provenance filter for rewritten/derived copies.
The request carries no incarnation: an old id is never reused while the ledger
exists. The ledger is capped at 256 entries and is not an erasure mechanism.
No provider-side enforcement, in-flight cancellation, or cross-process guard
distribution is implied. Production persistent injection remains NO-GO.
