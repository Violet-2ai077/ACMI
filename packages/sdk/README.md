# Adapter SDK

`@acmi/sdk` validates and negotiates payload-free adapter metadata. It has no
runtime, transport, browser, or filesystem dependency. Public types such as
`AdapterCapabilities`, `HarnessAdapter`, `RuntimeSessionRef`, and
`NormalizedRuntimeEvent` live in `@acmi/contracts`.

- `parseAdapterCapabilities(value)` validates the version-1 declaration. Bind
  it to a specific adapter ID/version and runtime version. Unknown declarations
  or missing fields fail closed. Context injection and Task Binding hooks are
  not supported in this release.
- `capabilityOffer(profile)` emits a protocol 0.1 Harness offer. Any normalized
  observation stream offers `observe-session`; proved Tool Call/Result
  pairing may also offer `causal-tool-pair`. Storage offers are separate.
- `parseRuntimeSessionRef`, `parseEventRef`, and `parseNormalizedEvent` return a
  typed, allowlisted copy or `null`. Validate your runtime's envelope first,
  explicitly select the allowed metadata, then validate the normalized event.
  Do not copy raw envelopes or promote deltas to committed messages.

In the profile, `sessionEvents` means Session lifecycle events, `messageEvents`
means committed user/assistant events, `toolCallEvents` means Tool Call/Result
metadata, and `subagentEvents` means observed Agent lifecycle events.
`stableSessionIdentity` requires adapter, instance, Session ID and incarnation;
a reused Session ID alone is not stable identity. `eventReplay` promises the
same normalized output from a fixed source cut. `persistentHistory` also
requires replay and stable identity across reopening the source.

Scope and capability are separate. Check the host-issued Workspace grant
before any source read; honor cancellation while streaming. Use `null` for
unproved causality, even when the runtime repeats a Tool Call ID.

See the [custom runtime example](../../examples/custom-agent-adapter/) and
[conformance runner](../conformance/) before declaring support.
