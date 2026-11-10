# Phase 0.9 proposal review validation

The 70-case SQLite subrun has 50 accepted, 10 stale-revision conflicts and 10 cycle conflicts. Every case rechecks exact idempotency, reviewer type, revisions, evidence, change IDs and resulting graph. Staging never mutates graph state. An independent integration test injects a SQLite failure at review-receipt insertion and verifies rollback of the already inserted graph prefix and clean retry after reopening.

Tests cover distinct grants, absent evidence and unknown Task IDs, both kinds of dependency cycle, mainline cardinality, duplicate source replay, stale revision, expiry, supersession, negative Result disposition blocking Join, bounded worker timeout and durable cursor restart. A stock dsh Source/Built test checks the real authorized Session feed, excludes another live Session, reviews an exact decomposition diff and verifies the Host apply leaves the native Session unchanged.

Full receipt history is retained. No per-change selective acceptance, authenticated remote review service, or API for untrusted tool callers is supplied.
