# FM1: finite mechanism validation

Owner authorization: conversation dated 2026-11-16 (Asia/Shanghai), finite
mechanism path, maximum 120 actual generations including any diagnostic calls.
This plan schedules 48 logical turns and authorizes no subsequent stage. No D
or C0. Owner's subsequent same-conversation amendment permits environmental
retries: at most one retry per coordinate and 12 retry calls in total, maximum
60 actual generations. Original failures remain visible and counted.

This is the newly authorized research path, NOT a pass of old G1/P-G, NOT a
repair of historical failures, and NOT consumption of historical unused slots.
Old gates, code, scores, frozen inputs and evidence remain unchanged. No Host or
Task Graph mutation. All story data are synthetic.

## Questions and design

Can one generation answer and attribute? Can it preserve identities and update
state across a four-turn conversation? Can reported, observed and accepted
support be kept distinct? Are errors factual, reference-level, or protocol-level?

Two new narratives, four turns each; crossed C1/C2/C3 and A/B = 12 trajectories,
48 generations. Two narratives share a transition scaffold, NOT independent
random samples. Difficulty is pre-labelled simple/medium/hard/hard within each.
All are CLOSED-LOOP: every previous model content AND reasoning are returned
verbatim, no corrective messages, oracle snapshots, summaries or marker repair.
FROZEN-REPLAY: zero. Session handoff: zero. Fixed schedule interleaves trajectories
by turn so early transport failure does not consume the budget on one condition.
Arm order alternates by condition/story; no randomized causal inference claim.

C1: initial two-field catalog plus full initial state and work history.
C2: identical work history including the existing task UUID, without a state
projection or catalog. C3: same raw user history with UUID removed, no catalog,
no reference assistant or hidden old UUID. Model must establish identity from
visible unused UUID slots, first available first, and discover the second task.
Source IDs and backtick anchors are experimental reference aids, NOT supplied
task assignments. C3 is raw consecutive conversation in this deliberately
anchor-labelled synthetic domain, NOT unrestricted natural-language discovery.
New UUID slots are generic resources, not indications that a new task is needed.

FM1 is a reduced protocol, distinct from historical ENVELOPE v1. A is one JSON
answer+state sidecar. B is normal text followed by one native state marker.
No API JSON mode, second generation, JSON repair, model judge, or fallback.
Prior historical outputs motivated the design but these narratives and oracles
have not been exposed to a model before freeze. This is prospective exploratory
validation, not an independent confirmatory or statistically powered study.

## Frozen metrics and interpretation

All metrics are reported per condition AND arm; no pooled C1/C2/C3 success score.
Denominators: planned, invoked, complete, failed, evidence-incomplete, not sent;
schema invalid is not UNRESOLVED. Failed acquisition has null mechanism scores.
Protocol validity = exact frame/JSON and schema, including duplicate-key rejection.
Attribution = exact current task IDs and unresolved scopes; discovery = exact
created IDs; identity continuity = exact (goal anchor, UUID) memory mapping,
including the required retention of off-focus tasks. These are distinct checks.
State facts = exact full task snapshot after dropping citation source IDs and
evidence lists, keeping goal/work/criterion/decision/conflict anchors, statuses,
bases and lifecycle. Reference exact = identity/status-independent citation
projection versus oracle. Grounding = all citation quotes uniquely visible at
their stated source. Full state exact includes both facts and references.
Arrays represent sets (canonical sorted JSON); duplicate items are invalid.
Every difference includes a JSON pointer, expected value and actual value.
Basic answer = frozen case-insensitive token/phrase assertions only, not a claim
of overall answer quality or noninferiority; no matching C0 and no such claim.
No scoring of free-text explanations and no post-output rule changes.

State rules are public, not hidden oracle policy: a requested task is running
even when its work is planned; reported-only work is ready/reported, never
completed. Observed or accepted work can be completed. Task completed requires
explicit Owner acceptance of the current goal and all current criteria, no
pending work or open conflict; otherwise fully observed task is ready. Changed
criteria retain superseded predecessors; changed goal retains UUID. Lower
authority does not supersede an Owner decision. Equal-authority disagreement
stays open until resolved. A decision alone is not task acceptance.

Scope-limited positive evidence requires every tested trajectory in the given
condition/arm complete and pass the metric on all four turns. A single valid
counterexample falsifies reliable maintenance for that tested configuration.
Missing observations mean unknown, not failure of model capability. No product
GO or historical threshold reassessment even if all 48 succeed. Report field
and per-turn results as diagnostics, never as independent samples.

## Acquisition and stop

Existing DSH selected route only; inspect credential reference, never export its
value or credential-store contents. Model alias is mutable, weights unverified.
Keep existing max_tokens=16384, thinking enabled, configured reasoning effort,
180000 ms deadline, 5000 ms cleanup and 1048576 response-byte admission limit.
The received over-limit chunk is retained, then stop; no next read or truncation
to conceal overage. Request bytes <=131072. Actual provider usage retained;
price/currency not verified, monetary cost unknown, never zero by assumption.

One fetch invocation per attempt. Retry once after 5 seconds ONLY for incomplete
transport with timeout/transport_error or HTTP 408/429/5xx, provided local
pipeline closure and captured-prefix integrity are confirmed. Timeout cause
remains unknown, not automatically a provider fault. Retry uses identical
request bytes and routing, not altered prompts or partial output. At most 12
extra attempts and 60 calls; stop the whole batch if the retry also fails or
the allowance is exhausted. No silent denominator removal. The FIRST complete
response is the only response fed back and scored. Stop WHOLE batch on byte
limit, truncation/filtering, evidence write/integrity problem, freeze mismatch,
input bound or other transport errors. Protocol/state failures do NOT halt:
preserve their exact output in the next history to observe persistence. No
resume/replacement batch. One
engineering-repair batch was allowed by Owner but is not preauthorized by this
plan; if unused, report unused. No large-scale follow-on.

Persist exact request body before send; send intent and actual invocation event;
raw received chunks with boundaries/time; decoder content/reasoning; returned
terminal and usage when observed. Hash all files and verify independent raw
decode and exact closed-loop lineage. Interrupted evidence stays incomplete;
no invented successful terminal or receipt. This is local process-level capture,
not a crash/power-loss durability or arbitrary native-fault proof.

## Pre-output self-audit and freeze

Author/self-reviewer: Codex under explicit delegated Owner authorization, NOT
independent review. Audit checks public policy determines each oracle, source
quotes are unique and visible, C2 has no active snapshot, C3 has no old UUID,
new births consume allowed slots, all branches have a finite budget, and tests
catch reported/completed, reference drift, duplicate JSON, invalid frame and
lineage mutation. Generate immutable public corpus, private oracle, prompts,
plan, safe route descriptor and code dependency hashes. Commit freeze BEFORE
first live request. Any failed check blocks dispatch. No frozen files changed
after exposure. New verification/reports may be added without changing metrics.

## Stop at delivery

Archive raw inputs/outputs, capture, hashes, deterministic scores, error paths,
latency/usage and repository status. Scan ONLY new artifacts for selected secret
bytes and strong signatures before push. No raw credentials, private user data
or account mutation. Push research branch only, leave main untouched. The
missing requested RESEARCH-ARCHIVE.md is recorded; actual archive README exists
under evidence-archive/2026-11-16 and no archives were extracted or executed.
