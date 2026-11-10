# ACMI Phase 0.9 delivery

- reports / architecture / runbooks: implementation, decisions and boundaries.
- benchmark: 350 versioned synthetic cases, four modes, measured distributions and label provenance.
- environment: verification commands and exit codes, native Source/Built and isolated clean-clone reproduction.
- push: the completed historical branch gate.
- source: local commits, changed-files manifest and exact patch from Phase 0.8.2.
- integrity: payload SHA-256 manifest relative to this archive root.

Reproduce with Node 24.16.0 and pnpm 11.28.5. Run `pnpm install --offline --frozen-lockfile`,
`pnpm check`, then `node scripts/phase-0.9/benchmark.mjs <empty-output-directory>`.
Set `ACMI_TEST_BUILT=1` to select compiled ACMI entry points in native dsh tests.
This is an offline synthetic experiment. No installed dsh, real Provider,
automatic Binding, production injection, Phase 0.9 Push or Release.
