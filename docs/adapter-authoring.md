# Adapter authoring

Start with the [custom adapter example](../examples/custom-agent-adapter/README.md).
It uses a deterministic runtime and does not depend on dsh. Replace the
synthetic input with the events your runtime actually exposes. Preserve the
source event identity and order; use a runtime's stable Session ID only when
the runtime guarantees it. Validate input at the adapter boundary.

1. Depend on the public `@acmi/contracts` and `@acmi/sdk` surfaces, not on
   another integration's internals. Declare the adapter version, tested runtime
   version, and capability contract version.
2. Declare the available Session, message, tool, subagent, history, replay, and
   stable-identity capabilities truthfully. Validate the schema-version-1
   profile with `parseAdapterCapabilities` and convert it with `capabilityOffer`
   for negotiation against the caller's requirements. A message-only runtime
   is a valid partial adapter. Set `contextInjection` and `taskBindingHooks`
   to `false` for this Alpha; the read-only adapter cannot offer either.
3. Normalize events with provenance. If the host does not expose a causal Tool
   Call ID, leave the Tool Result unresolved; do not link it to the latest Tool
   Call or synthesize identifiers to pass conformance.
4. Keep attribution and persistence separate. A Task UUID is not a Session ID;
   only explicit trusted input may change Binding, and each Session owns its
   own Binding revisions. A history-capable adapter must scope reads using
   host-derived Workspace and storage identity before returning any data.
5. Add deterministic fixtures and call `runConformance(fixture)` from
   `@acmi/conformance`. Check the result and the individual checks, not just
   whether the runner completed. Negative fixtures should cover malformed input,
   capability denial, missing or ambiguous links, and attempted cross-Workspace
   reads wherever relevant. Use `pnpm test` from this workspace to run the
   examples and fixture tests.

## Conformance levels

Report an implemented level only for the tested adapter/runtime combination and
only after passing its fixture checks. The table explains what each level means;
refer to the [suite](../packages/conformance/README.md) for implemented checks.

| Level | Evidence expected |
| --- | --- |
| 1: Session and message observation | Normalized Session and message events, stable scoped identity, Workspace isolation, cancellation, and honest unsupported responses. |
| 2: Task attribution | Explicit Binding and Session-local inheritance; events without sufficient evidence remain unresolved. |
| 3: Tool causality | Match a Tool Result to its proved originating Tool Call, and leave an unpaired result unresolved. Also test late results after a Binding change. |
| 4: Cross-session continuity | Reopen the persisted source, replay deterministically, and find the same Task explicitly bound in two Sessions without leaking history across Workspaces. |
| 5: Controlled context injection | Reserved; the Alpha suite does not award this level. An eventual implementation needs explicit host policy with authorization, denial, and isolation tests. |

## Compatibility matrix template

| Adapter version | Runtime version or commit | Capability contract | Conformance evidence | Limits and operating conditions |
| --- | --- | --- | --- | --- |
| Your version | Exact tested version | Declared version | Highest level passed and test command | Unsupported capabilities, host/storage constraints |

Do not claim support for a version range merely because its first version
passes. Document unsupported operations, how callers detect them, and whether
history is unavailable, partial, or backed by a tested storage profile.
