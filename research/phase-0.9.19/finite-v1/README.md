# FM1 research entry point

Scope and public policies: [PLAN.md](PLAN.md). This is a separate, prospectively
frozen reduced-protocol mechanism study, not a historical rescore or G1/P-G pass.
No independent reviewer or reviewer agent was used or claimed.

Run order: offline tests, `experiment.mjs freeze`, commit frozen materials,
`experiment.mjs run`, `experiment.mjs score`, inspect evidence, secret scan, report.
The run command refuses an existing evidence directory; it is not a resume tool.
Do not execute it from an archive to replay historical requests.

Pre-output self-audit found one synthetic source ambiguity: the `cold check`
anchor also occurred within the phrase "cold checking". The first test run was
40/41; changed that request sentence before freeze, without seeing any live
model output. This was a scenario-editing failure, not model or transport failure.

Security boundary: only the selected DSH managed credential reference is read.
The credential is supplied solely as an Authorization header to the inspected
HTTPS endpoint; neither header nor credential values enter records. No tool
execution or graph mutation from model output. Source and outputs are synthetic,
but external responses are untrusted data. Scan new files before publishing.
No universal secret-detection, OS-crash durability or immutable weight claim.

Full reproduction of scoring is offline; acquisition is intentionally one-shot.
Frozen source hashes include all recursively imported local transport components.
The system Node runtime and DSH catalog identity are recorded, not claimed
fully hermetic. Original returned reasoning is retained for provider-compatible
closed-loop history; it is never treated as the visible answer or task marker.
