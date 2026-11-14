# Gate 1 ledger - plan: E:/codex-prj/ACMI/deliverables/phase-0.9.19/gate-1-implementation-plan.md

Owner approved starting Gate 1. Live experiments and integration remain unapproved.
Base: 9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d.

## Rulings and preflight

- Native worktree tooling allocated C:/Users/SiChuchen/.codex/worktrees/model-native-attribution-research/acmi rather than the suggested E: path. Use the attached isolated checkout; main remains unchanged.
- Keep this execution ledger inside the research module rather than skill-specific shell helpers: the approved scope limits source changes to this module, and the host is Windows.
- Serena is bound to an unrelated Soma project; do not read its memories or modify that project. New ACMI files use apply_patch.
- No independent reviewer or subagent: Owner's explicit review boundary overrides skill defaults.
- Task 1 -> 2/3/5: InputPacket contains public messages/sourceMap only; oracle is separate.
- Task 2 -> 4/5: parsed proposals are structurally validated but not semantically repaired.
- Task 3 -> 6: condition/arm/track/split mandatory; D diagnostic-only.
- Task 4 -> 5: reserve attempts before generation; immutable raw records survive failures.
- Task 5 -> 6/7: report reads archived raw, never trusts parsed predictions.
- No commits, merge or push requested. Retain uncommitted implementation for Owner review.

## Tasks

- Task 1: complete; context tests RED (missing module) -> GREEN (3).
- Task 2: complete; wire tests RED -> GREEN (4), every single-byte split and byte-at-a-time.
- Task 3: complete; evaluator/state tests RED -> GREEN (9).
- Task 4: complete; ledger tests RED -> GREEN (3), separate-process recovery included.
- Task 5: complete; runner tests RED -> GREEN (4), D stages and timeout included.
- Task 6: complete; report tests RED -> GREEN (3).
- Task 7: complete; final research suite 37/37, Node syntax 21/21, eight-turn three-condition two-protocol traces, separate-process recovery and byte-identical CLI rescoring verified.

## Findings and corrections

- Historical phase-0.9.16 baseline could not load integrations/dsh/dist/assignment-inline.js. Offline frozen pnpm install failed on missing cached tarballs; no network fallback. Full-repository regression remains unverified.
- Existing model-transport baseline passed 7 tests using its own synthetic loopback HTTP server; no live model route or formal Host. Research tests use fake transport only.
- Parser null-prototype dictionaries normalized to ordinary JSON objects after validation; no raw bytes or fields repaired.
- Self-audit RED tests found non-standard whitespace, missing active-target invariant, late request persistence, resettable call budget and unpinned oracle digest. Integrity/runner/end-to-end GREEN (8) after fixes.
- Semantic RED tests found lifecycle-only false completion undercount and extra-memory overcredit. Semantics/end-to-end GREEN (5) after fixes, including contamination counts.
- End-to-end traces: eight turns, restart after turn four, deliberately stale C3/B state on turn eight. Correct identity does not mask stale state.
- Fixtures are explicit code test vectors, not a human-adjudicated confirmation dataset. No model experiment or research GO.
- Replay regression found missing prior birth mapping for a single frozen C3 probe. Evaluator now uses frozen prior-birth coordinates plus visible original historical markers; no Host/model input is corrected. RED -> GREEN.
- Ordered-action regression found set scoring accepted swapped actions. Preserve action sequence while canonicalizing unordered fields; RED observed before fix.
- Bundled module scanner sees README/DESIGN, but quality/security scanners report zero .mjs files. Their apparent PASS is not code coverage; use Node syntax checks, module import/write-boundary inspection and directed regression tests instead.
- Closed-loop fallback regression: ordinary schema-invalid responses must persist without adoption and continue on the next scheduled turn; only transport/limit/prefix failures halt. Added RED test, withheld invalid workState, and retained C1's last valid projection without adding one to C2/C3.

## Final verification

- Logs: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/acceptance-49e565c823/
- Final raw traces: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/e2e-au7XOa/
- Final test log: research-tests-acceptance.txt in the acceptance directory.
- Two independent CLI evaluations: SHA-256 AB4B44E363E2FC740ED2C70AAAC2A7FEE7CF4296AE37F1322FA5096253A8EF93.
- Existing model-transport tests re-run: 7/7.
- Main clean at original base; only research/phase-0.9.19 added. Intent-to-add index entries allow diff review; no source content staged, commit, merge or push.
- Gate 1 stopped for Owner review. No live adapter, credentials, model evaluation, confirmation corpus or production integration.
