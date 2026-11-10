# Offline double annotation workflow v0.1

Only hand a reviewer their packet (A or B), this guide and the empty
annotation template/schema. Do not share the combined corpus, labels,
predictions or a second reviewer's packet. Packets share an integrity ID
but present different case order. Inputs contain no expected label. The
curator must isolate the benchmark directory from reviewers.

After annotating all cases independently, reviewers supply their own stable
operator ID and attest `human_attested_annotation` with status
`submitted_unverified_identity`. The tool checks coordinates, completeness,
duplicate IDs and targets. It cannot prove the person is human or their
identity. A synthetic workflow test is not a submission.

```sh
node scripts/phase-0.9.1/annotation.mjs check packet-a.json submission-a.json
node scripts/phase-0.9.1/annotation.mjs compare packet-a.json submission-a.json packet-b.json submission-b.json disagreements.json
```

Keep original packets and submissions unchanged. Use the adjudication
protocol before claiming human-reviewed or adjudicated status.
