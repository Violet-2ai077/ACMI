# TH1: synthetic task handoff

Read the [pre-registered plan](PLAN.md), [results](RESULTS.md) and
[original scores](evidence/end.json). The recorded end-to-end outcome was
**0/2**. Passing the offline checks confirms the capture and the scores, not
that the mechanism passed its gate.

From the root of a checkout of this research commit, run:

```sh
node research/phase-0.9.19/th1-handoff/replay.mjs
```

Use Node 24. No dependency installation, provider account, network or live
model run is needed. The wrapper restores the original relative directory
layout in a temporary directory and uses the hashed transport sources from
this checkout. It runs the original eight scoring tests and the original
24-response offline verifier, then removes its temporary copy. The frozen
runner is retained as evidence, not as a suggested live command.

All 115 files of the original run are retained byte-for-byte, including the
synthetic requests, stream events and model outputs. The README, Git attributes
and offline replay wrapper were added for publication after the run.
