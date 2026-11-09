# Task Understanding validation

The deterministic rules accept structured synthetic suggestions with
explicit source IDs, not unrestricted raw conversation. The engine also
has a bounded failed-turn next-action rule and refuses ambiguity by default.
Accepted/rejected/stale/tampered cases are exercised without a provider.

The fixture suite checks that a read grant cannot review, evidence and
Task identity match, analysis leaves the graph unchanged, proposal diff
tampering cannot apply, and an explicit accepted decomposition commits
its node and edge together. Rejection persists after a store restart;
replaying the same review cannot overturn it. A changed graph revision
requires a fresh proposal and fresh confirmation.

In the 160-case experiment the review family has 20 cases: 16 expected
proposals, all 16 structurally correct and source-complete, and 4 expected
abstentions, all 4 observed. Identical input returned the same ID 16/16.
No graph mutation from analysis (0/20); 4 accepted, 4 rejected, 4 stale,
and 4 tampered cases at the review gate. Precision/recall here are
structural fixture checks, not human-grounded intent inference. No mock
or real model escalation was needed or attempted.
