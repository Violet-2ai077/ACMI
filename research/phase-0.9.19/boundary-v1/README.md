# BS1 boundary-only validation

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
