# Single-generation streaming transport plan

Execution: inline, tests first, no agents. Preserve Gate 1 and production code.

1. Serialize the already compiled public request into the selected DSH route's
   openai-completions / DeepSeek-thinking dialect. Preserve original content/order;
   carry source IDs in a separate metadata system message. Require explicit original
   assistant reasoning history rather than inventing it. Pin final request bytes.
2. Incrementally decode SSE and strict UTF-8 across every byte boundary. Retain raw
   bytes independently; distinguish content, reasoning, usage, finish and DONE.
   Reject duplicate JSON keys, tool execution, multiple choices, missing termination,
   inconsistent identity and malformed usage. Never repair generated markers.
3. Implement one injected HTTP send, no default network transport, no SDK or Host.
   Record request before send; disable redirects. Abort deadline/read failures,
   evidence-write failures and size violations; no retries or continuation calls.
4. Test errors and success with synthetic streams and injected send functions only.
   Verify full research suite, source guards and repository tests with the previously
   documented single-worker diagnostic setting. Do not erase default-concurrency failures.

Ruling: this is a transport component, not live-run authorization. No credential reader
or CLI send command is added. Frozen plan membership, actual corpus/prompt freeze,
provider liveness and durable-ledger send integration remain explicit follow-up work.
Protocol rejection is an observable experiment failure, never permission to retry.

Local protocol reference inspected: installed @earendil-works/pi-ai/dist/api/
openai-completions.js, DeepSeek thinking mapping and stream usage request. Reuse the
wire dialect, not the SDK's retry configuration or DSH's agent loop.

Completed this batch: all four component steps, 16 transport tests / 118 research tests,
41 syntax checks and 276 repository tests with the documented single-worker setting.
No default-concurrency success is claimed. Full RED and GREEN logs are preserved.
Additionally authored/reviewed the six-family narrative source, not a frozen executable
corpus; its remaining materialization/audit requirements are explicit in that document.
