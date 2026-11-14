# Gate 2 durable ledger implementation plan

Execution: executing-plans with test-driven-development, inline, no reviewer agents.

Goal: implement the independent Gate 2 evidence ledger and global call/cost reservations using synthetic bytes only. Do not modify Gate 1 or connect any provider.

## Contract

- One run directory under E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2. A frozen-contract digest and explicit integer call/cost limits must match on every reopen. A run spans all C1/C2/C3 arms, not one budget per arm.
- Reserve once per family/condition/arm/track/turn/stage before sending. Persist exact request-body bytes and a maximum cost in currency micro-units. Count reservations permanently, including uncertain outcomes.
- Only one in-flight reservation globally. Interrupted reservations block new calls and are never automatically resent or forgiven.
- Append received provider-wire and extracted model bytes as separate, timestamped events before interpretation. This module supplies storage, not a network adapter or parser.
- Successful, known-cost settlements may replace a reserved bound with actual cost. Unknown cost or transport failure halts further calls. Record an overrun truthfully and halt, rather than rejecting the cost evidence.
- Exclusive file lock protects each read/modify/write operation; busy/stale lock rejects immediately. Never auto-delete another writer's lock or implement a hidden retry.
- Hash-chained JSONL, exclusive creation, flush on append. Torn journal, altered manifest, bad path or digest fail closed. These controls protect a trusted local experiment from accidental corruption, not malicious administrators or rollback of an entire valid archive.
- External model/route, cap authorization, pricing and human adjudication remain required; the tests do not supply real approval or billing evidence.

## Tasks and RED/GREEN checks

- [x] L1: add tests for global budgets across conditions, permanent call counting, duplicate coordinates, immutable request bytes and cost release. Implement reserve/snapshot.
- [x] L2: add tests for exact wire/model capture, successful/error/unknown/overrun settlement, D stage rules, request linkage and byte limits. Implement capture/settle.
- [x] L3: add tests for separate-process resume, interrupted reservations, concurrent-process lock rejection, corruption, foreign manifest and Gate 1/path-link isolation. Implement exclusive lock and strict replay validation.
- [x] L4: run full research tests, syntax, repository tests, path/hash checks; document capabilities and gaps; preserve new evidence without overwriting previous runs.

## API

openRunLedger({ root, runId, freezeHash, limits: { maxCalls, maxCostMicros, currency }, resume = false }) returns path, reserve({ coordinate, requestBytes, maxCostMicros, answerHash? }), capture({ attemptId, channel, bytes, elapsedMs }), settle({ attemptId, outcome, actualCostMicros }), snapshot(). Coordinate fields are family_id, condition, arm, track, turn_id and stage. D is replay-only with answer/marker stages; marker must follow the successful answer of the same pair and supply the digest of that answer's stored model bytes. No proposals or production Graph writes exist in this API.
