# ACMI Phase 0.8.1 delivery

- `experiments/`: final report, capability matrix and validation evidence.
- `architecture/`: runtime facts, persistent store, proposal gate, and
  dynamic snapshot lifecycle.
- `benchmark/`: historical baseline reference, 160 synthetic labels and results.
- `environment/`: build, regression, fresh clone and native dsh witnesses.
- `source/`: exact commits, changed paths and complete patch against Phase 0.8
  at `d534aaabee4748d2b3e7d8f72cab53754945609e`.
- `integrity/SHA256SUMS.txt`: each payload file, relative to this directory.

Reproduce in the local repository with pinned Node/pnpm:
`pnpm install --frozen-lockfile`, `pnpm check`, then
`node scripts/phase-0.8.1/benchmark.mjs <output-directory>`.
Set `ACMI_TEST_BUILT=1` for the compiled dsh experiment entry points.
No real provider, production profile, automatic Binding, Push or Release.
Level B does not replace native Compact or revoke previously retained history.
