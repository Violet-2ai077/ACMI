# Architecture

ACMI separates identity and read-only continuity from the runtime that supplies
events. The same Core can consume deterministic synthetic input or events
normalized from a supported dsh runtime. It does not schedule agents, store
general memories, or guess a task when input is ambiguous.

```text
Runtime -> Harness Adapter -> normalized events + declared capabilities
                                      |
                                      v
         explicit Task Binding -> ACMI Core -> scoped Task history -> Observer
                                      ^
                                      |
                          Storage Adapter (read-only queries)
```

`@acmi/contracts` defines the event, provenance, identity, capability, and
storage query shapes. `@acmi/core` applies Task identity and Session-local
Binding revisions to events, preserving explicit unresolved states and tool
causality. A Tool Result with a known causal call belongs with that call, not
automatically with whichever Task is active at result arrival. A Task UUID is
scoped to its Workspace and distinct from any runtime Session ID.

`@acmi/sdk` handles adapter input and capability negotiation;
`@acmi/conformance` runs synthetic fixtures that exercise the advertised
behavior. Adapters must not invent missing data. Integration and app code own
host-specific dependencies, I/O, and rendering. Contracts and Core cannot
import dsh, Cordis, React, browser APIs, or Node filesystem internals.

The dsh Plugin connects supported host APIs to the dsh Harness Adapter. The
dsh Storage Adapter separately handles eligible journal reads behind a scoped
query. Compatibility is limited to the documented version and root layout;
stock dsh owns writes and migration. See [dsh integration](../integrations/dsh/README.md).

Observer renders a read-only timeline grouped by Session with Task UUID,
Session-local Binding Revision, unresolved items, and provenance. The host
must derive scope before providing a view; a request parameter or page control
cannot grant access. Raw event payloads are not part of the default display.
See the [security model](security-limitations.md) and the
[extraction decision](decisions/0001-extraction-boundary.md).
