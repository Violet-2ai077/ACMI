# ACMI Phase 0.9.1 deliverables

- `reports/`: qualification report and technical experiments.
- `architecture/`: versioned contracts, boundaries and design.
- `annotation/`: two blind packets, schema, workflow and pending status.
  Send only one packet and the guides to each reviewer; the corpus carries
  the provisional labels and must not be shared during blind annotation.
- `benchmark/`: complete corpus, mode results, confusion matrices, ranking,
  timing and one-shot holdout freeze/consumption receipts.
- `environment/`: all verification and historical-regression logs.
- `source/`: local commits, changed paths and exact Phase 0.9 patch.
- `integrity/SHA256SUMS.txt`: hashes of payload files relative to ZIP root.

With Node 24.16.0 and pnpm 11.28.5, install the frozen lockfile offline, run
`pnpm check` and `node scripts/phase-0.9.1/benchmark.mjs --open <output>`.
Use `--verify <archived-benchmark-directory> <open-reproduction>` to verify
the held-out result without rerunning that split. Do not consume another
holdout run for this milestone. The delivered results are AI-provisional,
not human annotations, and all mock modes are offline.
