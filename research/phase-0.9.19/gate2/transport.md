# Single-generation transport component

This component is offline-tested, not a live experiment runner. It imports no provider
SDK, DSH Host, credential store or default network sender. All tests use synthetic
Response streams and explicitly injected send functions. It does not change ACMI APIs.

## Serialization

serializeCompletion verifies that the provider-neutral compiled body still matches its
serialized bytes/hash. It creates a new request in the inspected route's dialect:
openai-completions, DeepSeek thinking enabled, explicit reasoning_effort/max_tokens,
stream=true and stream_options.include_usage=true. No SDK response-format constraint,
JSON repair, extra generation, tool or provider fallback is introduced for A or B.

The first system message is the original prompt. The second contains only compiled
metadata and the ordered source-ID mapping (and D2's own answer when applicable).
Original conversation message content/roles/order are unchanged after those two
messages. Source IDs are not silently prefixed into source text used by evidence quotes.
The trusted input to this low-level serializer is compileRequest output; it is not an
independent replacement for frozen-public-input validation or an adversarial capability.

For the configured route, every prior assistant message needs an explicitly provided
reasoning_content string. No blank reasoning is invented. Future closed-loop/session
restore must use its original recorded reasoning; frozen reference histories must
explicitly declare their reasoning context rather than borrowing another arm's output.
Reasoning is never parsed as a task marker or emitted as user-visible answer text.

Output-token settings are experiment parameters; the local declared model limit only
bounds configuration. Input tokenization and context-window checking remain unimplemented.
No claim about immutable server weights follows from a model alias in a request.

## Capture and decoding

performCompletion requires a synchronous record callback and a single-send fetch-like
function. It emits request bytes before invocation, then response metadata, each received
body chunk, content/reasoning deltas and a terminal result. No authorization header or
credential is included in records. Provider exception messages are not returned.

`wire` here means original application response-body bytes delivered by the fetch-like
transport. It is NOT a TCP/TLS packet capture or compressed HTTP framing capture; Fetch
may decompress a response. Content-Type/Content-Encoding and status are retained so the
archive does not falsely claim lower-level wire fidelity. Request bytes are the exact
serialized JSON body supplied to the sender; authentication material is deliberately excluded.

The SSE decoder supports UTF-8, LF/CRLF/CR, comments and multiline data across arbitrary
chunk boundaries. It rejects duplicate JSON keys, nonfinite numbers, multiple choices,
identity changes, tool/function deltas, unsupported finishes, invalid usage, missing
finish/DONE and additional data after DONE. It never corrects a malformed output.
Unknown usage remains null, not zero. Usage is a provider report, not verified billing.

After a protocol error, parsing stops but raw-body capture continues to EOF within the
deadline/byte bound. This preserves later bytes without treating them as a repaired
generation. Network/read/deadline/size/evidence failures may necessarily leave a partial
response; the result records that explicitly. The over-limit received chunk is offered
to the sink before the size failure; a sink may have its own smaller persistence bound.

## Outcomes and latency

- complete: valid terminal stream with finish_reason=stop; NOT marker-schema success.
- truncated: valid terminal stream with finish_reason=length; never continue/retry.
- filtered: valid terminal stream with finish_reason=content_filter.
- failed: protocol, HTTP, transport, cancellation, timeout or evidence-write error.

transport_complete means recognized SSE termination, not successful attribution.
response_body_complete means EOF was reached. evidence_complete requires EOF plus
successful record callbacks including the terminal callback. An exception in that last
callback cannot be retroactively archived; the caller must handle the failed return
and must not dispatch further work as if persistence succeeded.

Client-side latency reports first received body bytes, first content delta, first
reasoning delta, total duration and synchronous evidence-write time. Content TTFT is
not first user-visible A/B answer text (the marker parser determines that later).
Total and first-delta times include client capture/parse overhead; they are not pure
provider compute latency. Total stops before terminal-record persistence.

The deadline starts after request recording and covers send/body/parse operations.
Both an abort timer and monotonic checks are used: synchronous capture work can delay
a timer callback but cannot silently turn an expired request into a success. JavaScript
cannot preempt blocking callback code; the timeout is detected as soon as control returns.

## Limits and next integration

There is exactly one adapter invocation of the injected sender per attempt, or zero
when request recording/configuration/cancellation prevents it. redirect=error is passed.
The injected sender must itself be a no-retry HTTP primitive; an arbitrary injected SDK
could otherwise hide extra calls. Real provider request count still needs execution evidence.

This module does not itself reserve a durable run coordinate, prove schedule membership,
verify a freeze handle or reconstruct a session. Those checks belong to the next
send-boundary integration, before supplying any credential or actual network sender.
There is no live CLI command. Existing run-ledger evidenceKind remains offline-ledger-test.

Neither this module nor its synthetic tests establish model accuracy, protocol acceptance
by the real service, cost, actual model latency, streaming completion rate or research GO.
