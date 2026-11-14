# DSH binding and explicit uncapped policy

Execution: inline, tests first; no subagents, model calls, Host integration or main edits.

Owner input on 2026-11-14: reuse configured DSH; no call or monetary cap.

Ruling: this waives extra spending caps, not finite sample selection, frozen materials,
one generation per coordinate, no retries, transport timeouts or evidence integrity.
The 576-call matrix remains a proposal, not an instruction to run it immediately.

- [x] Resolve selected web profile model/provider from local data only. Do not execute
  profiles, mount plugins, read sessions or print credentials. Return allowlisted metadata.
- [x] Test explicit uncapped readiness and ledger policy; absent/null legacy caps must
  still fail. Preserve v1 manifests and historical bounded-ledger behavior.
- [x] Record DSH binding metadata, sanitized credential availability and alias caveat.
- [x] Run research and repository regression tests; verify Gate 1 hashes and main.

Default-concurrency repository testing reproduced one 5-second DSH integration timeout
twice; isolated DSH tests and the whole suite with one worker passed without code or
timeout changes. This is an unresolved concurrency-sensitive timing failure, not a
claim that the default command passes. All original logs are retained.

Credential source is proven by installed dsh-llm-pi-ai resolveApiKey and
dsh-credentials-local resolve: managed refs precede inherited environment.
No credential content, credential-file hash or raw config is an evidence artifact.
DSH route discovery is configuration evidence, not endpoint reachability or model-version
verification. A dedicated single-send streaming adapter remains a separate task.
