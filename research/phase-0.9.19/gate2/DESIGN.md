# Gate 2 preparation design decisions

Date: 2026-11-14. Scope: offline planning and compilation, not model experiments.

## 2026-11-15: approved protocol revision, offline implementation

Spec: protocol-revision-proposal-2026-11-15.md. The Owner approved the proposal
and separately authorized offline implementation/acceptance, not a live batch.

- Explicit `protocol_revision` binds version, diagnostic_policy, inline_profile
  and owner_authorization. Either policy can be selected independently; unknown
  fields/profiles fail closed. Absent revision retains legacy v1/v2/v3 semantics.
- B-inline-v1-ws1 uses one scanner for streaming and final evaluation, bounded
  ASCII layout only in frame-boundary states. Original bytes/provenance remain B.
  An AST bridge reuses frozen Gate 1 schema/reference validation without editing
  Gate 1. Expanded ASTs use its wire validator with an explicit byte allowance;
  the original B byte cap still applies. This is not JSON repair or regeneration.
- D-180-LOCAL-v1 has a fixed 180000 ms generation deadline plus at most 5000 ms
  local cleanup. An owned read continuation archives delivered bytes before the
  deadline race can discard them. Cleanup-only bytes are archived, not decoded
  into a successful answer. Unknown closure seals callbacks and stops globally.
  Cancellation EOF does not prove remote response completion. Local abort does
  not prove server-side computation/billing stopped.
- The v4 ledger audits request, D1 hash, raw wire/delivery order, prefix digests,
  decoder state, terminal facts and cleanup before diagnostic_censored settlement.
  Audit repeats on replay. The terminal and settlement remain distinct durable
  events: a crash between them prevents resend and continuation. No old halted
  journal is migrated. Writer locks and hash chains retain the existing trusted
  local filesystem boundary; they are not protection against a fully privileged
  actor replacing all evidence and pins.
- Reports distinguish schedule exhaustion from successful generation, keep D
  outside GO and retain all dispatched censored attempts in availability rates.
  Missing terminal after request is dispatch-unknown, not a free/unattempted call;
  affected rates are null rather than a fabricated complete denominator. Successful
  and censored latencies are separate. Unknown usage/cost remains unknown.
- Synthetic freezes now bind execution/report source, revision test vectors and
  the proposal/approval record, in addition to source/runtime materials. Study
  prompts, corpus, oracle, seed/order and 576 planned slots are unchanged.
- Guarded live execution explicitly rejects the new revision. Removing this gate
  requires subsequent Owner freeze/run authorization and review. No credentials
  are needed for acceptance; all injected transports are synthetic.

## Current integration amendment

The later integration-report.md supersedes the earlier "not yet connected" statements
below. send-boundary.mjs now connects frozen materials to the ledger and single-send
transport, with an explicit offline/live mode and no default credential reader.
The CLI remains read-only; no live experiment has been executed by this batch.

Review binding v3 covers public/oracle/plan/prompts/runtime/evaluator bytes, rather
than only the corpus. A separate pin is written before any live outputs. The guard
also checks the exact executing research dependency list and hashes; it executes no
packaged JavaScript. This is trusted-local integrity, not remote attestation.

The guard reserves final HTTP body bytes before credential resolution, then rechecks
the freeze and reservation immediately before Fetch. It rejects skipped, duplicate,
in-flight or out-of-plan coordinates. v3 ledger adds reasoning and transport channels
and binds offline-boundary-test versus development-model-run evidence kinds.
An invalid marker stays in raw CLOSED-LOOP history; no oracle repair is performed.
FROZEN-REPLAY uses declared authored common A-envelope history, a context bias that
must be disclosed separately from CLOSED-LOOP. D2 reads only its own persisted D1.

Full oracle development and self-review do not establish independent semantic
validity. State exact-match uses literal evidence references; finite lexical answer
predicates are diagnostics only. Alternative equivalent references can be penalized.
Model alias provenance, live dialect compatibility and billing remain unverified.
The optional offline-verification driver reads oracle explicitly on the test side;
it is never imported by the guarded sender and is not a live model evaluator.

## Separation

The Gate 1 runner remains registered-fake-only. No new module imports the Gate 1 runner/ledger, provider SDK or production Host. The planner and compiler share only contract constants/hash utilities. CLI reads one explicitly named JSON file and writes only stdout/stderr; it never resolves a credential or contacts an endpoint. The separate run-ledger module writes only the Gate 2 evidence root and uses synthetic evidence manifests in this version.

The source packet contains evaluation labels for offline scoring. Forwarding it wholesale to a provider would leak condition-specific identity visibility and difficulty/SM labels. The compiler therefore builds a fresh allowlisted body instead of deleting known sensitive keys. Raw historical messages remain unchanged. C1 projections must originate from schema-validated model proposals; this compiler is not a second schema evaluator.

## Reproducibility

R2 planning fixes 6 x 8 base turns, three independent contexts, A/B/C0 closed loops, two frozen probes per family, A/B replay and D diagnostic pairs. A seed hashes stable block identities to determine order. It never shuffles turns inside a block. Full input metadata, manifest hash, actual compiled bytes and prompt hash remain distinguishable.

Compilation is provider-neutral, so its request hash is not yet a hash of transmitted HTTP bytes. An adapter must separately persist actual wire bytes and preserve role/source mapping. No prompt hash or script fixture establishes that human Ground Truth was frozen.

The freeze verifier reads an explicitly selected development bundle under the Gate 2 root. It requires an externally supplied manifest digest and checks actual file sizes and SHA-256 before interpretation. Role partitions and link rejection provide physical separation; a review-binding record references exactly the public/oracle/probe-plan versions. None of this authenticates a human reviewer or validates semantic Ground Truth.

Verified public bytes are retained behind an in-process WeakMap handle and returned as fresh copies. Export never rereads mutable disk files or exposes oracle contents. This prevents accidental check/use substitution through this API, not a malicious local process with filesystem access. The verifier executes no packaged evaluator code and does not claim dependency-closure validation.

Optional corpus preflight consumes public/oracle wrappers from those same pinned buffers. It checks declared per-condition schedules, source availability, canonical identity/state consistency, birth coordinates and adjacent-turn SM opportunities. Counts are stratified by condition and difficulty. Raw state collections are canonicalized for comparison only; neither stored bytes nor oracle values are repaired. Structural and support success remain separate from semantic truth, family independence and actual identity provenance.

## Budget limitations

Readiness checks either finite declared limits or an explicit Owner-authorized uncapped policy with a finite experimental schedule. Uncapped pricing may remain unknown; it is never zero by implication. A separate run-ledger implements global durable reservations and exclusive cross-process access; it is not yet connected to a provider. Provider billing verification, token-price conversion and enforcement at the actual send boundary remain pending. Config completeness cannot enable live execution. All remaining gates are explicit in the report.

## Threat model and known gaps

- Trusted local authoring workflow, not adversarial multi-user execution. Endpoint checks prevent accidentally embedding credentials in ordinary URL user/query fields; they are not an SSRF defense because no request exists.
- Unknown config fields fail without echoing values. The readiness checker does not read environment values. The separate, explicitly invoked DSH inspector checks the selected managed credential ref and same-name environment fallback; neither value is returned or archived. Operator-supplied prompt strings and raw conversation remain data and are not executed locally.
- Compiler checks source IDs/maps, stages and relevant metadata; it is not a full public-corpus validator, prompt injection defense, token counter or provider schema translator.
- Schedule metadata validates category/difficulty counts, not SM evidence, human review, recovery points, source provenance or semantic truth. Those need the separately frozen corpus preflight.
- The original 576-call design is the only supported plan in this preparation version. A smaller run requires an explicit revised design, not silent omission of rows.
- No fabricated author/reviewer identities, prices, model versions or corpus hashes in the actual template. Synthetic tests carry no research evidence.
- Ledger events include exact request-body bytes and separate provider-wire/model bytes. The chain starts at the pinned manifest digest. Lock contention and unfinished reservations reject new work; there is no retry or automatic stale-lock removal.
- In bounded v1, successful known-cost settlements release unused reservations, while unknown/error/overrun halts the run. Explicit uncapped v2 allows successful unknown-cost settlements while preserving null totals and an unknown count; transport errors/unknown outcomes still halt. Counters and money use safe integers, not floating-point currency arithmetic. No reservation is erased after completion.
- Journal truncation inside a record and altered hashes are detected; deletion of a complete valid suffix cannot be detected without an independent external head receipt. This is not an adversarial anti-rollback store. File flush is requested but power-loss durability of the filesystem and directory entries is not certified.
- Frozen bundle integrity needs an independently retained manifest pin. Hashing the candidate manifest immediately before verification is not historical freeze evidence. Synthetic package purpose and false semantic/authenticity/live flags remain explicit in successful reports.
- Corpus preflight is not a semantic oracle. Tests intentionally include repeated engineering skeletons and a mechanically consistent but semantically wrong state trace; successful structural/support checks must not certify these as research Ground Truth. No formal corpus or human review identity is generated by the implementation.

## Owner-delegated review amendment

Owner explicitly delegated Ground Truth review to this assistant on 2026-11-14.
owner-amendments.md supersedes the earlier human-review prerequisite for development.
Freeze v2 requires exactly one authorization artifact, outside public inputs, and binds
its exact bytes to a v2 review record. Scope, reviewer, delegated-model authority and
deterministic-only scoring must agree. Same-author review is allowed only in this mode.
No identity/authenticity or independence is inferred from these declarations. Frozen
labels are the operational scoring authority, not proof of external human validity.
Earlier plans and v1 artifacts are historical and are not silently reclassified.

## Streaming transport boundary

transport.mjs serializes compiled public requests and accepts an explicitly injected
single-send transport plus synchronous evidence sink. It does not resolve credentials
or import a network client. Raw application body bytes, content, reasoning, finish and
usage remain separate. Unsupported events are failures, not repaired markers. Protocol
failure drains the remaining raw body within deadline/byte bounds; transport or sink
failure may leave partial evidence and cannot be relabeled complete.

The send component is not a freeze/authorization boundary and cannot enforce an
external sender's hidden retries. Actual run-coordinate reservation, plan membership,
freeze verification, provider tokenization and persistent session restoration must be
integrated before live use. Capture latency is client-observed and includes sink work.

## Verification contract

### Binary frame and streaming full audit correctness candidate

R-E/R-A are opt-in offline v6 only; v1-v5 evidence is never migrated. The binary
physical hash covers domain/header/exact payload bytes, independently of every
logical digest/state transition. Framing bounds follow existing nonempty captures,
four 4 MiB channel caps and bounded logical fields; they are not new live limits.
The broad maximum frame bound is NOT a viable writer allocation/RSS guarantee.

The reader uses 64 KiB file I/O blocks and one logical record buffer, retains the
current attempt for unchanged diagnostic-censor checks, and folds settled attempts
to verified metadata/D1 hashes. Every existing audit boundary still reads all bytes.
Selective materialization adds a full audit tied to the original private token's
allowed IDs, fingerprint and dual heads; no persistent index/checkpoint authority.
Legacy full snapshot semantics remain. No throughput or RSS pass is inferred.

R-C retains counterexamples: finite byte admission does not bound a delivered read,
metadata can exceed its channel, and valid-semantic format bounds do not close
transaction materialization or full-run resource budgets. Oversized unarchivable
delivery must report incomplete evidence and halt, never claim a verified prefix.

### Offline raw-first transactions (2026-11-15)

The opt-in v5 physical journal wraps ordered logical hash-chain events in a second
transaction hash chain with attempt identity and sequence ranges. Each physical
frame is appended with a requested flush. Partial frames are preserved and rejected;
a write/flush exception poisons the v5 writer. No success or resend follows an
in-flight reservation. Audits retain both logical and physical heads. Old journals
are not migrated, and a new manifest necessarily produces a new chain root.

The transport first commits a read's delivery metadata and raw bytes, then commits
its emitted deltas. Even decoder errors retain any emitted prefix. Critical reserve,
pre-send, terminal and settlement boundaries are not coalesced. The live boundary
does not opt in. R-O distinguishes Fetch-body bytes, decoded JSON payloads and
physical storage; bounded observation overflow is unknown, never parser approval.

The extra physical frame costs bytes and full-audit CPU; fewer flush requests alone
do not establish an overall performance pass. Fixed paired trials retain failures.
The existing 4 MiB channel cap provides no overshoot headroom for a 4 MiB raw
admission candidate. No capacity value is promoted without a closed resource vector.

Tests cover plan counts and ordering, malformed manifests, input canaries, history preservation, C0/D stage separation, configuration failures and offline CLI rejection of live flags. Ledger tests additionally cover byte retention, global limits, D answer digests, child-process recovery, two-process competition, torn journals and path isolation. Original Gate 1 tests continue to run. This is self-checking, not an independent review and not a mechanism GO.
