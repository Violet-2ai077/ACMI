# Phase 0.9.3 dsh Runtime Shadow witness

**Result:** The isolated shadow produced a validated `objective-refined` draft on both integration Source and Built paths. It never applied the draft. The next, negated turn produced no draft. Both modes passed the same three integration tests; the Core incremental-state suite passed 16 tests independently.

## What ran

- Node 24.16.0, Windows x64, stock dsh packages `0.2.2-rc.1`. Source means the dsh integration loaded from TypeScript; Built means its emitted JavaScript. Both used the same pinned stock dsh runtime dependencies.
- Fresh synthetic Work, Journal, SQLite Graph, `DSH_HOME` and `DSH_AGENTS_HOME` directories. The stock agent loop emitted real accepted `turn/start`, `user/message`, tool and `turn/end` events using an in-process scripted `LlmAdapter` and local tool. The test Host drained native events to committed facts and flushed the Journal **before** each shadow snapshot. These are setup writes in the disposable fixture, not writes by the shadow.
- The shadow validated source identity, completion and stored fact coordinates, read the prepared Graph cut and scoped candidate window, ran layered interpretation and claim validation, and compared all filesystem and logical snapshots before and after. No installed dsh, real user Session or production Context Injection was touched.

| Mode / observation | Journal SHA-256 before = after | Logical Graph Cut SHA-256 before = after | Input bytes / estimated tokens | Candidates / facts / drafts | Illustrative latency |
|---|---|---|---:|---:|---:|
| Source / refinement | `f7a3b92270b7f173a46d8acdc23b5c2312d0b6ca2cdfac7c4905ad256651e1ef` | `2d98b7659915fe8ae95510189797cccfef40ea18d2e5e4ce81b5465ed770bc1c` | 2097 / 525 | 2 / 2 / 1 | 11.07 ms |
| Source / negated follow-up | `74449a483a35f4b1c1ec2dcfd2c6e88c2cf52824ed23793c025ae98c09354d72` | `6e22de1847d164063314ef369907336b41b481bd3ac4d14dbbc6801850c2432f` | 1350 / 338 | 2 / 0 / 0 | 4.09 ms |
| Built / refinement | `06e19488f07fd71e0a97ef2de7b1996745978eef57fdb7cbdec32c5114577a12` | `ec64c7840018b49b6908c36656f42210fb1992ea3d4f3e58322d8568e968b708` | 2097 / 525 | 2 / 2 / 1 | 9.75 ms |
| Built / negated follow-up | `abcc06440fd3fcfad9661e11ef0cd1c3fc9b0e36365d75c5ca7d2b74c4bc5fb4` | `52c507fc20d29570956e3b89454a6de6b36f89fba488c6352ebd982cef91f3d5` | 1350 / 338 | 2 / 0 / 0 | 3.69 ms |

Within every window, the full file inventory and the hashes of all Journal and Graph files (including SQLite sidecar) matched; current Task and Binding revision `1` did not change, both Task proposal counts remained `[0,0]`, and additional Graph replay was `0`. The test recorded `0` socket connects, `0` fetches, `0` real Provider requests and `0` local fixture adapter calls during shadow observations. L5 remained `no_operation`. Different runs use different temporary fixture identities and timestamps; compare the two sides of each window, not hashes between runs. The witness also tests default-off, cross-Workspace denial, wrong source coordinate, duplicates, concurrent single flight, revocation/revision drift during async lookup, cancellation, and Host metadata skip/sample with an ungated comparator.

## Reproduce and inspect

```powershell
pnpm --filter @acmi/contracts build
pnpm --filter @acmi/core build
pnpm --filter @acmi/dsh-integration build
pnpm exec vitest run packages/core/tests/layered-state.test.mjs
pnpm exec vitest run --reporter=verbose --silent=false integrations/dsh/tests/layered-shadow.test.mjs
$env:ACMI_TEST_BUILT = '1'
try { pnpm exec vitest run --reporter=verbose --silent=false integrations/dsh/tests/layered-shadow.test.mjs }
finally { Remove-Item Env:ACMI_TEST_BUILT }
```

The `ACMI093_LAYERED_SHADOW` line contains both snapshots with exact per-file hashes, inventory digest, Graph cut, Binding, proposal counts, provider counters and measurements. It omits raw Session data and absolute temporary paths. The latency samples are local fixture measurements, not production SLOs. This adapter maps committed tool-call, tool-result and binding facts, but does not project protected result excerpts, result causality or full Decision supersession lineage from the legacy Graph. It cannot qualify those operations. The native fixture does not establish intent accuracy, semantic trigger recall in production, or model performance.
