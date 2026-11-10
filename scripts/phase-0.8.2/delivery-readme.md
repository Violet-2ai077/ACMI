# ACMI Phase 0.8.2 delivery

Start with `reports/phase-0.8.2-final-report.md`, the three operational
runbooks, and the recorded checks under `environment/`. Source changes apply
to `a0c1bc48efb534bebc67e7a008107ca3e48030da`. The benchmark contains
synthetic labels and measured metadata only; no native Journal, model request,
snapshot body, local database, or credentials are shipped.

To reproduce in a clean checkout: install the frozen lockfile, run
`pnpm check`, then run
`node integrations/dsh/tests/fixtures/phase-082-benchmark.mjs <empty-output-dir>`.
Use a separate temporary Workspace, published stock packages and the scripted
local adapter. Do not run the experiment against an installed dsh profile.
