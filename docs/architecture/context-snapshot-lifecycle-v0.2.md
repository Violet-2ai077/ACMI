# Context Snapshot Lifecycle v0.2

The Phase 0.8.2 experiment is Host-only, explicit, synthetic and default off.
A prepared package has one reservation for an empty, unseeded destination
Session id and exact incarnation. Its ledger stores only identity, policy, source and graph revision,
package hash/version, estimator, budget, creation/expiry and retirement. It
never stores the prompt, package body, native user/tool bytes, or provider response.

1. Resolve a scoped persistent graph cut and deterministically assemble a package.
2. Persist the hash-checked reservation in the isolated Graph Store before making
   its in-memory text available. A reservation is not proof of exposure.
3. The public dynamic context callback checks the live Session object, grant,
   TTL, active node, graph and source versions before contributing. It performs
   no Journal or SQLite read. dsh owns the rendered, persistent runtime-context
   message and ordinary or Compact request.
4. The public Host guard rechecks before the adapter; invalidations close the
   entire reserved Session request path. A durable retirement prevents reuse;
   a process restart has no live validator and conservatively quarantines the id.

After publication there can be independent copies in Agent memory, native JSONL,
request envelopes, compaction summaries, downstream storage/cache, and backups.
No lifecycle action in ACMI erases these. A missing contribution does not prove
that historical bytes were not already loaded or offered to a Provider.
