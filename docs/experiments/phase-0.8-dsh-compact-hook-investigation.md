# Phase 0.8: dsh Compact lifecycle

Audited source commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`,
published runtime packages `0.2.2-rc.1`, Cordis `4.1.0`. The machine's
global dsh manifest reports `0.2.1-rc.2` with no embedded gitHead. It was
not invoked or changed. The old source/evidence checkout remains at
`4a151189b8df6cdc558f355e889b6182edab56a1`.

| Pinned source | Observed contract/implementation |
| --- | --- |
| `packages/compaction/command-compact/src/index.ts:59-108` | Command registration delegates to `ctx.compaction.compactNow`. Idle maintenance owns the attempt, serializes later waking work and flushes it. |
| `packages/compaction/compaction-basic/src/index.ts:147-247,292-453` | Automatic pressure on `agent/pre-step` and changed route on `agent/request`; overflow recovery through `agent/request-error`. Canonical overflow retries only with a replacement-generation increase; cancellation wins. Pressure failures continue normally, model-switch failure preserves prior header. |
| `packages/llm/token-meter/src/index.ts:151`, `packages/compaction/compaction-basic/src/config.ts` | Durable route, estimated context/surface nodes, completion reservation and configured headroom/retain thresholds; optional tool-result pruning and repricing. |
| `packages/compaction/compaction-basic/src/region.ts:117,173,387,471` | Select a positional span with balanced tool pairing, retain recent tail, start lock, derive/revalidate the cut, price shrink, append summary and compact-checkpoint user message with replace op, then end. Log persists; replacement changes the visible surface. |
| `packages/compaction/compaction-basic/src/summarizer.ts:120-198` | Direct auxiliary `ctx.llm.stream` using replayed prefix/tools and summarizer instruction, configured route/cap and cancellation; summary framing retains text, durable summary can record raw output and usage. |
| `packages/compaction/compaction/src/index.ts:106,119` | Public singleton backend seam; `compaction/summary-error` is failure recovery, not an additive pre/post hook. `compaction/start,summary,end` are log records, not cooperative contribution hooks. |
| `packages/compaction/compaction-basic/src/index.ts:270` | Protected subclass `summarize` customization is documented, but involves owning/replacing the backend. Not used as a plugin-side augmentation. |
| `packages/core/system-prompt/src/index.ts:519,588`, `packages/core/agent-loop/src/agent.ts:294,446` | Public `SystemPrompt.context` registration and lifecycle disposal; admission refresh materializes dynamic context as native `runtime-context` user message, including after a prior snapshot was shadowed. No private callback or new custom message type needed. |

**Level A: not supported as additive hook. Level B: conditional GO in
synthetic harness.** Level C was unnecessary. Replacing default compaction,
intercepting internals or using summary-error to inject arbitrary payloads is
NO-GO. Published `0.2.2-rc.1` APIs are public on the pinned build, not a
cross-version stability guarantee. Session journal input and storage are not
changed by ACMI. The current Alpha plugin and Observer stay on their original
paths.

The stock basic backend and real agent loop, token meter and JSONL writer ran
with a scripted in-process LLM Adapter; there were zero provider/network
model requests. In two paired scenarios (accepted dependency and
produced-only dependency), the stock summarizer path received the A/B/A
conversation cut. The scripted output retained 1/6 markers and exposed
the unrelated marker. ACMI's fresh-session request kept 6/6, excluded that
marker and differentiated dependency accepted from unreviewed. The scripted
summary is intentionally lossy and only 64 bytes: it cannot establish an
effect size for an actual model. The portable package uses 6,138/5,119
estimated units of a 10,000-unit cap; the 64-byte fixture summary is shorter.

Source and Built each verified both scenarios, automatic pressure with a
real tool pair, too-small budget fallback, pre-cancellation, summary error,
append-only prefix and no new Binding records. Repeated native compactions
retain one effective task contribution with the same hash at each unchanged
source cut. New Session recovery leaves the source Journal byte-identical
after the native Compact append. Controlled tests use disposable isolated
homes, workspace and marked journal root. Headless Compact requires no
listener; Observer HTTP regression uses ephemeral IPv4 loopback.

Source/Built refers to the ACMI Integration entrypoint (TypeScript source or
compiled JS); both use the same unmodified published dsh binaries/modules.
Runtime tests execute manual and pressure paths. Route switch/overflow,
in-flight cancellation and backend persistence failure were inspected in
source, not separately fault-injected here. Per-run timing and package hashes
are recorded in the packaged dsh Source/Built witnesses.
