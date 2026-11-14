# Gate 2 corpus structural preflight plan

Execution: inline executing-plans and TDD; no agents or LLM judges.

Goal: continue offline preparation with a deterministic corpus validator and bind its results to the already pinned freeze package. Do not generate formal research labels or claim that syntax/coverage proves semantic truth.

## Contract and scope

- New public wrapper: version gate2-public-corpus-v1, split dev, families containing existing publicScenario fields plus complete condition-specific reference_history.
- Separate oracle wrapper: version gate2-oracle-corpus-v1, split dev, families containing family_id, canonical_tasks, oracle, state_opportunities and recovery_points. canonical_tasks are human-defined UUID/objective/acceptance/initial_status records.
- Require one-to-one family/turn/condition coverage against createPlan; verify every current user unit has a decision and answer obligation; reject unknown canonical UUIDs, duplicate IDs and inconsistent memory/active/focus sets.
- Reuse frozen contract descriptors for syntactic validation only; check evidence quotes exist uniquely in the visible prefix for that condition/turn. Never infer missing gold, repair it, or call scoreAttempt to manufacture truth.
- Validate declared births against CREATE/BRANCH/MERGE targets and forbidden UUIDs against positive assignments. Check complete known-task snapshots and condition-specific records. Check reference history order and recovery metadata against public session/agent IDs.
- State opportunities identify condition, theme, turn, prior turn, task and change/retain. Compare relevant raw state fields deterministically. SM5 additionally requires a real 5-turn inactive gap in declared gold attribution. Count at least 2 change + 2 retain opportunities per SM theme per condition, without mixing conditions.
- Structural success does not imply coverage success. Semantic scene correctness, label truth, family independence, identity provenance, all negative-case subtypes, model prompt validity and human authenticity remain explicitly unverified.
- Existing Gate 1 test fixtures remain engineering-only. Test packaging may copy them to exercise validator mechanics, but cannot be promoted to the six research scenarios.
- Freeze CLI gains verify-corpus using the same external manifest pin and actual artifact bytes. Incomplete corpus reports exit 2 and never grant live execution.

## Tasks

- [x] C1: write RED tests for missing families/conditions/units, unknown identities, inconsistent states, future evidence and malformed reference history; implement structural validation.
- [x] C2: test state opportunity comparison, insufficient support, dormant gap and recovery errors; implement per-condition coverage diagnostics.
- [x] C3: test freeze integration and CLI; use pinned public/oracle bytes only, preserve original verify-freeze behavior and reports.
- [x] C4: run complete offline/repository tests, source-boundary checks and Gate 1 hash checks; preserve evidence and document remaining live/data prerequisites.
