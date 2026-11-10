# Adjudication protocol v0.1

The coordinator verifies two independent reviewer identities out of band.
Compare intent, target, graph changes, unresolved reasons and cited turns.
Record raw agreement, intent agreement and Cohen's kappa (null when
undefined). Disagreement is not automatically resolved by the provisional
label, model answer or majority vote.

A third human with a distinct identity receives the relevant case and both
submissions after independent annotation. Record their explicit choice or
unresolved state, the exact reasons and source IDs. A resolution file has
`packetId`, `reviewerId`, `provenance: human_attested_adjudication`, and
`annotations` in the same entry format, one per disagreement.

```sh
node scripts/phase-0.9.1/annotation.mjs adjudicate packet-a.json disagreements.json resolution.json
```

Preserve the original labels and record provenance/version of any final set.
No unresolved disagreement becomes an accepted graph mutation. No human
submissions or adjudication occurred in this phase.
