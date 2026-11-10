# Runtime reliability state model

**Supervisor:** running -> stopping -> stopped. Per-Session: pending ->
draining -> idle; a missing sequence/overflow selects bounded reconciliation;
transient timeout, busy, I/O or unavailable status uses bounded backoff;
conflict, invalid source and limits degrade without moving an unverified cursor.
The Host may explicitly request reconciliation after fixing a cause. A disposed
authorized Session may finish bounded read-only catch-up; reuse of its id by
another live Session blocks that path.

**Snapshot:** no reservation -> durable reservation -> active live validator
or quarantined. Retirement closes authority without proving persistence, erasing
bytes, or resetting Provider retention. These are independent dimensions, not
synonyms.

**Child:** catalog only, confirmed local membership, native open/terminal turn,
or missing evidence. Live Scheduler results are independent of durable native
evidence; graph result inspection, consumption, acceptance and join are explicit.
