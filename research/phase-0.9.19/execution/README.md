# Frozen development execution

Current constraint (2026-11-16): [mechanism validation first](../RESEARCH-PRIORITY.md).
Engineering is limited to what trustworthy experiments require. The historical
execution instructions below are not renewed authorization; no active batch
may be resumed from them. New collection plans and any change to admission
scope require explicit approval; original evidence, scores and gates remain.

R4 result: 35 dispatched, 34 complete; request 35 hit response_byte_limit and
globally halted under the approved policy. No retries/replacements or active run.
See results-r4-2026-11-15.md. D2 censor continuation was not exercised live (zero
censors); old scores remain unchanged. Any later batch needs separate authorization.

R4 authorization (2026-11-15): Owner approved the offline R-D/R-B acceptance and
authorized one refrozen development batch. See r4-authorization.md. The live gate
now admits only its exact batch root/run ID, both approved policies and 576 original
slots, with no retry/resend. freeze-r4.mjs verifies unchanged study hashes and
launch regression before creating a fresh package. Later evidence/results are
separate from r1/r2/r3; earlier statements below are historical execution notes.

This orchestration layer does not change the frozen gate2 dependency closure,
prompts, oracle or schedule. Its own files are hashed and archived before live use.
The existing development-r1 pin remains authoritative. No second model, JSON
repair, retry, replacement run or output-dependent prompt change is permitted.

Run live.mjs with an explicit pin, evidence root and fresh run ID. It resolves only
the frozen DSH credential reference, inside the guarded post-reservation callback.
It runs the finite ordered schedule until completion or the first transport/evidence
failure. Marker failures remain evidence and do not cause regeneration. Credentials
are never printed or archived. Pricing remains unknown. No live call occurs on import.

report.mjs is a separate deterministic post-run reader. It verifies the frozen
oracle and journal before scoring. It never supplies oracle material to the sender.
Conditions, arms, tracks and difficulty stay separate; missing strata are explicit.
Incomplete/failed transport is not interpreted as evidence of model incapability.

Owner authorized controlled development execution on 2026-11-14. No confirmatory
8640-call study or production integration is included. No independent review claimed.

Execution results and both halted batches: results-2026-11-14.md. Owner approved a
separate routing-header revision after the first HTTP 400; the second batch stopped
at a sink-dominated timeout. No further live run is currently active.

2026-11-15: Owner approved sink repair and another frozen batch. See
results-2026-11-15.md and ../gate2/sink-repair.md. Offline real-fragment replay and
stress passed; r3 completed 28 requests and halted at a diagnostic D2 timeout on
request 29. No further run remains active. Original r1/r2 evidence is retained.
