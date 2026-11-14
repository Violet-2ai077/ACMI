# Required routing-header amendment

On 2026-11-14, development-r1 made one real request and received HTTP 400,
MissingSessionID. No content/reasoning/usage or model identity was returned.
Its ledger is halted and retained; there was no retry. This is an experimental
transport-adapter defect, not a task-attribution or model-capability failure.

Owner explicitly approved correcting the transport contract and starting a new
batch. Prompt, oracle, public corpus and plan bytes must remain unchanged.

The service requires a stable conversation header, x-opencode-session, and an honest
client User-Agent. Sources: captured response, installed pi-ai opencode-headers.js,
and https://opencode.ai/docs/console/go/#where-can-i-use-it . No credential or account
policy is changed; the client is not impersonating DSH or another approved client.

Frozen policy opencode-conversation-v1:
- User-Agent is acmi-attribution-research/0.9.19.
- Session key hashes freeze/run/family/condition/arm/track/session identifiers.
- CLOSED-LOOP turns in the same session share a key. A true session handoff uses a
  new key; identity recovery still depends on explicitly supplied history.
- FROZEN-REPLAY probes have distinct keys. Each D1/D2 diagnostic pair shares a key.
- Different arms, conditions and runs never intentionally share routing identity.
- Logical task UUID is not used as routing identity or exposed in the header.
- The two allowlisted non-secret headers and digest are archived before credentials,
  rechecked immediately before Fetch, and verified again by the report importer.
- Authorization remains transient, not part of evidence or a configurable header map.

No original attempt is erased or reissued in its old ledger. The new frozen bundle
and new run are a separately authorized transport revision, not silent regeneration.
Both batches must be included when reporting experimental engineering failures.
After code changes, the original source-closure guard intentionally refuses live
reuse of r1. Its archived code, bundle, pin, journal and completed report remain intact.
