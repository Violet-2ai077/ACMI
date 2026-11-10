# Phase 0.9.1 model evaluation harness

The offline harness runs five modes with a frozen read-only packet and an
untrusted closed response envelope. The adversarial mode selects malformed
and forbidden outputs from the packet digest, not from ground truth. It
tests validation, not understanding quality. The other mocks are fixed local
rules/fixtures, not model measurements. Raw and rejected claims are counted
separately. No credential, endpoint, account or external inference is used.

The report contains per-mode confusion, guard reasons and token-estimator
units. Offline token/cost values are null unless supplied as synthetic
receipts; they do not report real billing. Real Provider requests: 0.
Q3 remains pending explicit authorization and actual evaluation.
