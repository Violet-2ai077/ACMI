# Harness Adapter conformance

Run `runConformance(fixture)` from `@acmi/conformance`. Its report contains
`level`, `passed`, and named checks. Reports do not include raw events or
adapter exception text. A failed check fails conformance and awards no level.
Set `observationOnly: true` to grade Level 1 without running the ACMI binding
projection fixtures. Declared runtime capabilities are still checked.

| Level | Evidence |
| --- | --- |
| 1: Session & Message Observation | Versioned honest offer; payload-free normalized committed messages; distinct stable Session incarnations; foreign/forged Workspace scope denied; cancellation and unsupported causality honored. |
| 2: Task Attribution | Core projects binding inheritance, switching and fresh Session-local binding revisions on observed Session identities. No adapter write or automatic binding is tested or enabled. |
| 3: Tool Causality | Both a proved Tool Call/Result pair and an unpaired result are present. A reused raw call ID does not prove the edge. A foreign/forged grant or cancelled request cannot read the edge. |
| 4: Cross-Session Continuity | Level 3 plus an independent reopen of the same persisted source, stable references and deterministic replay, and Task History across explicitly bound Sessions. |
| 5: Context Injection / Controlled Integration | Reserved. Never awarded by this release. |

Provide an `AdapterFixture` with the adapter, its versioned SDK profile, two
`SessionFixture` entries, one authorized opaque grant and one valid grant from
a different Workspace. Prefer exercising reused Session IDs with different
incarnations; the fixture's expected events must be authored independently,
not copied from the adapter output under test. Use a fixed source cut and
strictly increasing Session-local positions in each stream. Include a committed
message from each Session and at least one example of each claimed event
family. For `causalToolResults`, include both a valid edge and an unproved
result; use a colliding Tool Call ID in the negative fixture. For
`persistentHistory`, supply `reopen` to open a new adapter over the same durable
source. Tests rely on this fixture being truthful; cloning an in-memory adapter
is not production durability evidence.

Conformance applies only to the fixture's adapter and runtime versions and
exercised source behavior. It does not certify a storage backend, transport,
deployment, or untested event families. Partial, message-only adapters may pass
without Tool Causality; no causal edge is invented to earn a higher level.

After building the workspace, `pnpm demo:adapter` runs a complete synthetic
Level 2 example without dsh. See the [adapter template](../../examples/custom-agent-adapter/).
