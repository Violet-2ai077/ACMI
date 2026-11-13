# Explicit model continuation design and trust boundaries

## Decision

The approved three-stage direction is implemented as an opt-in experimental dsh
path, not a change to the default provider-free console. The third-stage expansion
is usability and delivery readiness. New runtime adapters, general migrations,
automatic routing and production hosting remain deferred.

The Task UUID is authoritative only after an operator-confirmed Host binding.
A model never chooses the task or mutates the binding. Context is constructed per
request from registered Journal coordinates already assigned by the Graph store.
There is no new binding ledger or persistent prompt cache.

## Flow and ownership

1. The Host acquires the existing paired-root leases, reconciles registered
   sources, and opens a fresh, initially unbound Session.
2. Operator preview/confirmation selects an exact Task UUID.
3. `modelTurn` requires the explicitly enabled capability, a live idle Session,
   no previous native turn, current read/write/operator authority and a ready
   persistence boundary. Default hosts reject model requests.
4. `prepareContinuationContext` reads at most the latest 64 assigned facts.
   It checks registration and exact incarnation before/after asynchronous
   inspection and reading, compares normalized facts and extracts text with
   provenance. User/assistant text and tool-result text are eligible; failed tool
   results retain `isError`, and late results retain the original call coordinate.
   No attachment, tool argument, hidden reasoning or unrelated Task text is sent.
5. JSON includes task metadata, the bounded-window warning, evidence coordinates
   and text. Serialized UTF-8 size must fit the configured limit (16 KiB default,
   32 KiB ceiling). Exceeding the limit fails, rather than clipping text to fit.
   This is a byte budget, not a tokenizer estimate or a complete-history promise.
6. The runtime receives the context string and a short-lived synchronous
   authorization callback. It checks authority before native followup, immediately
   before transport dispatch, and after the response before accepting text.
   The Host checks again and invalidates the callback when the operation ends.
7. A stock pinned dsh Agent Loop emits the native prompt, assistant, usage and
   turn-end events. The transport ignores accumulated native prompt material;
   it sends only the bounded evidence and current user prompt, without tools.
8. The Host checkpoints/reconciles before returning. Another turn requires a new
   Session and explicit binding. Errors after native activity block mutation
   until an explicit reopen. There is no automatic retry.

## Threat model and limits

- Trusted components: local operator, Host composition, pinned dsh runtime,
  filesystem administrator and the explicitly chosen loopback model server.
  The injectable completion callback is a trusted test seam, not a user-supplied
  plugin or permission boundary. Default transport dispatch is synchronous until
  the HTTP request is created; arbitrary injected callbacks must honor cancellation
  and authorization requirements themselves.
- Untrusted material: historical message/tool text, model responses and terminal
  input. Historical text is labelled as data. This does not prove resistance to
  all prompt injection; no tools or operational authority are exposed to the model.
- The transport accepts only literal loopback HTTP and the exact completion path;
  rejects credentials, redirects and non-text/truncated/tool responses; bypasses
  proxy environment; bounds request/response bytes, output tokens and duration.
  The server still receives plain task data, so only isolated test data is approved.
- Cancellation cannot retract bytes already sent or prove the server did no work.
  It prevents accepting results and stops the owned native turn. A failed CLI ask
  therefore reports an unknown outcome and does not retry in the same process.
- No hostile-filesystem guarantee, multi-tenant isolation, live backup/restore,
  migration, arbitrary model compatibility or arbitrary tool execution is claimed.
  Existing root pairing, ownership and registration rules are unchanged.
- The context digest/source coordinates are returned and captured by the acceptance
  runner. Lifecycle receipts are not durable model-request receipts. The historical
  context package is deliberately not copied into the native conversation.

## Validation and alternatives

Test-first regressions cover default-off behavior, freshness, A/B separation,
scope revocation at async and transport boundaries, byte overflow, cancellation,
expired callback reuse and late failed-tool attribution. Native runtime tests
exercise actual dsh events with deterministic completions; real local-model runs
are separate evidence, never substituted by fake completions.

The original real fixture proved historical-value recovery but did not yield an
operational next step. Its result is preserved. A separate predeclared derived
command fixture and empty-history control establish only the narrower behavior
documented in the verification report; the generated command is not executed.

Reusing a live Session was rejected because old native prompt state would blur
task and authorization boundaries. Automatic task inference was rejected because
prior research gates did not qualify it. Adding another runtime now was rejected
because it would confound validation of the existing continuation path.

See the [implementation plan](../plans/2026-11-14-model-continuation.md),
[operator guide](../../../examples/task-console/MODEL-README.md) and
[verification report](../../verification/2026-11-14-model-continuation.md).
