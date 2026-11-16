# BS1 boundary-only validation

Completed: [RESULTS.md](RESULTS.md). 32/32 captures complete; all 28 subsequent
boundaries correct, one first-turn missing marker (31/32 protocol-valid).
The strict all-trajectory criterion is false and retained. No retry or repair.
Research stopped after the finite batch; this does not establish identity or
state continuity. Raw evidence and deterministic scores are preserved here.

New Owner-authorized study, separate from FM1. See PLAN.md for frozen definitions,
budget and interpretation. The only model label is CONTINUE / NEW / UNRESOLVED.
No UUID, goal catalog or work-state output. Returns begin new segments.

Before exposure: test, self-audit, `node run.mjs freeze`, commit. Then one-shot
`node run.mjs run`, offline `node run.mjs score`, verification and `node run.mjs scan`.
Do not run historical artifacts or resume an existing evidence directory.

Security: synthetic inputs only; selected DSH reference accessed without printing
credentials. Authorization never enters evidence. Selected secret bytes and
strong signatures are checked in plain files and decoded wire/content/reasoning
before publication. External outputs are data, not executed instructions.
Local capture is not a power-loss, arbitrary-native-fault or RSS proof.
