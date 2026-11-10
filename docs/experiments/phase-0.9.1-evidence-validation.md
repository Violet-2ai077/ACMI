# Phase 0.9.1 evidence validation

The executable tests cover incorrect topic/choice, question, qualified
approval, assistant suggestion, user rejection, invented rationale and
alternatives, hashed excerpt mismatch, revoked source, foreign Workspace,
invalid graph IDs and stale revisions. Tool result metadata, injection and
clipped lines cannot substantiate a summary. A positive complete extracted
line becomes an unverified Result, not an acceptance, Join or Task closure.

Opt-in SQLite tests stage an unsupported claim, verify no graph mutation,
attach a protected source, and exercise exact confirmation and replay.
Revoking the source between staging and review prevents application even
after reopening without the option. The durable accepted case records
the exact proof atomically. Independent Phase 0.9 transaction and cycle
tests remain unchanged.
