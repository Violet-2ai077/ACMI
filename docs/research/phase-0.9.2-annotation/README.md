# Phase 0.9.2 annotation artifacts

- **Open dry run:** `reviewer-a.json` and `reviewer-b.json` show the same 12 independently written synthetic cases in different deterministic orders. Each contains only visible inputs, no expected labels or predictions. Hand each reviewer only their own packet, [label guide](label-guide.md), [empty template](submission-template.json) and [schema](submission.schema.json). The template is deliberately incomplete and does not validate until filled by a real reviewer.
- **Current status:** [review-status.json](review-status.json) records pending human review, zero human submissions and zero adjudications. There are no gold labels, evaluation scores or model outputs. This pilot is open, not a qualification holdout, and will never become one.
- **Separate internal reserve:** `reserved-research-inputs.json` contains eight independently written research inputs with raw-byte SHA-256 freeze in `reserved-research-manifest.json`. The reserve was not included in reviewer packets, not passed to any prototype or evaluator for scoring, and not labeled; hash checks are integrity-only. It is delivery-visible, not externally escrowed, not a qualification holdout, and must not be represented as blind. Phase 0.9.3 requires a distinct, externally held final set.
- **Coordinator:** [adjudication.md](adjudication.md) defines the review and audit flow. See [human annotation plan](../phase-0.9.2-human-annotation-plan.md) for validation and agreement.

From the repository root, regenerate the two reviewer packets into a fresh destination:

```sh
node scripts/phase-0.9.2/annotation.mjs <empty-output-directory>
node --test scripts/phase-0.9.2/annotation.node-test.mjs
```

The generator reads only `pilot-inputs.json`, never old benchmarks or the internal reserve. It writes no submissions and refuses to overwrite existing packets. The tests compare packet bytes against the checked-in exports, validate case identity/order and answer-free fields, and verify the reserve freeze.
