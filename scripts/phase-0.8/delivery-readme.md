# ACMI Phase 0.8 delivery

- `experiments/`: final report, Task Graph, Context Assembly, dsh Compact and
  fresh Session recovery evidence.
- `architecture/`: versioned domain, lifecycle, package and integration design.
- `benchmark/`: labelled synthetic scenarios and results, no raw Journals.
- `source/`: exact local commits, changed paths and a binary-safe patch
  from ACMI main `436b8b60b459eb9719e44947e4ad33b60c17fb60`.
- `environment/`: test gates, environment, sanitized witnesses and
  independently cloned reproduction.
- `integrity/SHA256SUMS.txt`: hashes relative to this archive directory.

The global dsh installation was not used or modified. No real model requests,
automatic Binding, public Push or release. To reproduce on the local branch,
use Node 24.16.0 / pnpm 11.28.5, run `pnpm install --frozen-lockfile`,
`pnpm check`, and `node scripts/phase-0.8/benchmark.mjs <output-directory>`.
Set `ACMI_TEST_BUILT=1` for the compiled ACMI dsh-recovery test entrypoint
after building. Do not enable the experiment in an installed user profile.

The package SHA-256 and byte size are in the separate handoff report and
outer `SHA256SUMS.txt`; a ZIP cannot contain its own digest.
