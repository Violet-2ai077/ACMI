# Provider-neutral Model Evaluation Harness v0.1

The adapter contract receives a frozen bounded packet, system/developer
prompt versions, closed JSON Schema and a cancellation signal. The Host
records parse status, schema and semantic failures, response SHA-256 when
bounded, scoped candidate/evidence revisions, timeout/retry, and optional
usage/cost receipts. It does not retain raw output or give the adapter a
graph writer, reviewer grant, paths, credentials or an apply callback.

The shipped runner has no network transport and rejects a provider-marked
adapter before invoking its callback. Modes: deterministic rules, scripted,
adversarial malformed, bounded structured mock, and abstention-first.
Scripted receipts are `scripted_not_model_output`. Retrying is limited to an
explicit transient failure; a timed-out uncooperative callback is not
launched again. Tool bodies are not included. Guard checks the latest
authorized user reference, graph/candidate/source revisions, exact evidence,
structural invariants and a read-only reducer preview. Raw evaluation and
guard results have separate denominators.

A future Provider evaluation requires separately approved provider/model,
request and token/spend limits, data scope, retention policy and an isolated
credential/configuration boundary. The shipped configuration template is
not a runnable network adapter.
