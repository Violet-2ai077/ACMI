# Source provenance

The Phase 0.6.1 source baseline is the read-only `deepseek-harness` repository
at `4a151189b8df6cdc558f355e889b6182edab56a1`. Its upstream merge-base is
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` (`0.2.2-rc.1`). Both revisions
contain the same root license blob `c1f7a78e89e4e4dc7b86664c3b3c76eb5eee1785`.
The standalone ACMI tree does not carry the old Git history. See
[Third-party Notices](../THIRD_PARTY_NOTICES.md) for the upstream MIT text.

## Candidate origins

These are provenance anchors, not a claim that each candidate file was copied.
Paths in this table are relative to the Phase 0.6.1 source tree.

| Candidate source | Introduction or upstream baseline | Treatment |
| --- | --- | --- |
| `packages/experimental/acmi-probe/tests/contracts/core-v0.1.ts` | `46cdbb96e7f86e68911a1b9b418221b0ad7bc02e` | ACMI-specific contract prototype; reference for independent contracts. |
| `packages/experimental/acmi-probe/src/attribution.ts`, `packages/experimental/acmi-probe/src/index.ts`, `packages/experimental/acmi-probe/src/records.ts` | `d94d5d17bbf7a43d714c36a87f836ee21b867d7c` | ACMI-specific Task and binding behavior; keep dsh lifecycle and persistence in the dsh integration. |
| `packages/experimental/acmi-probe/src/history-index.ts`, `packages/experimental/acmi-probe/src/history-view.ts`, `packages/experimental/acmi-probe/src/history.ts`, `packages/experimental/acmi-probe/src/observer.ts` | `e10ea97187829a8267ea3e860e2e35067a1aa646` | ACMI-specific history, projection, and observer candidates. Extract portable behavior; exclude host-specific internals from Core. |
| `packages/experimental/acmi-probe/src/web-companion-page.ts`, `packages/experimental/acmi-probe/src/web-companion.ts` | `c29118863b882da5fe66009721e8053ded8eb4a8` | Prior companion candidates; the Alpha keeps Observer read-only and leaves host authorization to the integration boundary. |
| `packages/session/session-persistence-jsonl/src/scoped-read.ts`, `packages/session/session-persistence-jsonl/src/scoped-decode.ts` | `939f7908efbfcc3f663337368521dd020480d8c9` | ACMI-specific scoped read and decode logic; keep in `integrations/dsh`. |
| `packages/session/session-persistence-jsonl/src/storage-isolation.ts` | `ac6e93e19a2e6a640cecbfbdbd96f2da17bc49ef` | ACMI-specific root identity and isolation logic; keep in `integrations/dsh`. |
| `packages/session/session-persistence-jsonl/src/format.ts` | `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`; Phase 0.6.1 adds a scanner header getter at `939f7908efbfcc3f663337368521dd020480d8c9` | Mixed candidate. Adapt only the narrow upstream format helpers needed by `integrations/dsh/src/journal-format.ts`; preserve the DeepSeek MIT notice. |
| `packages/session/session-persistence-jsonl/src/index.ts` | `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`; Phase 0.6.1 scoped integration changes at `939f7908efbfcc3f663337368521dd020480d8c9` and `ac6e93e19a2e6a640cecbfbdbd96f2da17bc49ef` | Mixed candidate. Do not vendor the backend or patch stock dsh. |
| `packages/experimental/acmi-probe/tests/benchmark/phase-0.6.1-audit.ts`, `packages/experimental/acmi-probe/tests/benchmark/phase-0.6.1-corpus.ts`, `packages/experimental/acmi-probe/tests/benchmark/phase-0.6.1-evaluation.ts`, `packages/experimental/acmi-probe/tests/benchmark/phase-0.6.1-rules.ts` | `8ad47fc371aa6815a4143571a1cfde6470eba6a4` | Prior offline research, not a production dependency or authorization for automatic Binding. Use newly written or reviewed synthetic test data. |

## How to classify files

For each shipped file, record its target path, category, source path and
revision when applicable, license, and how it was changed. Keep these
categories distinct:

- **ACMI original:** newly authored or extracted ACMI-specific work. Verify
  introduction and authorship; location under `acmi-probe` alone is not proof.
- **DSH upstream unchanged / modified:** compare against the pinned upstream
  blob, not just the Phase 0.6.1 checkout; retain the upstream notice for both.
- **Third-party:** name the source and version, preserve the applicable
  license, and distinguish copied content from separately installed packages.
- **Generated:** regenerate build output from source; do not copy caches or
  old build artifacts. A lockfile is a generated, checked-in dependency record.
- **Test/evidence:** keep synthetic, necessary, and sanitized fixtures only.
- **Private/local:** exclude private prompts, session and witness data, local
  profiles, credentials, and private paths from the standalone tree and history.

Useful checks in the source repository include
`git merge-base HEAD <upstream>`, `git diff <upstream> HEAD -- <path>`,
`git log --follow -- <path>`, `git blame <revision> -- <path>`, and
`git rev-parse <revision>:<path>`. Compare reused regions, not just file names.
Exclude or independently reimplement anything with unresolved provenance;
do not ship an essential file until its rights and notices are established.
