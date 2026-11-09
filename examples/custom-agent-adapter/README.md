# Custom Agent Runtime adapter

This partial adapter reads **committed messages only** from a synthetic runtime.
It uses public ACMI contracts and SDK, no dsh imports. It does not claim
Session/Agent lifecycle events, Tool Call/Result causality, durable history,
Task Binding hooks, or context injection.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo:adapter
```

Expect a passing [conformance report](../../packages/conformance/) at Level 2:
Core can apply explicit Task Bindings to the observed Sessions, but the adapter
itself has no binding write access. Both fixtures reuse the same Session ID in
different incarnations. A synthetic streaming delta is not promoted to a
committed message.

To adapt your runtime:

1. Replace the `MessageSource.read` implementation in `src/index.ts` with a
   trusted host-side reader. Keep the `src/adapter.ts` boundary: authorize the
   Workspace before reading, confirm the full Session identity, and respect
   cancellation. Map the runtime's committed event state and stable source cut.
2. Select only normalized metadata. Never forward source message text, prompts,
   tool arguments, results, raw records, or arbitrary file paths.
3. Set the profile's `adapterId`, `adapterVersion`, `runtimeVersion`, and
   supported booleans based on observed behavior. Do not claim pairing without
   durable evidence of the original call reference.
4. Write independent expected `SessionFixture` streams for the actual runtime,
   including unsupported and foreign-Workspace cases. Run `runConformance` and
   use the result, not the declaration alone, to describe support.
