# Gate 2 frozen-material integrity plan

Execution: executing-plans and TDD, inline; no independent reviewer agents.

Goal: verify actual development-package bytes against an externally pinned manifest and bind the declared review to those exact corpus/probe versions. Do not author research Ground Truth, fabricate human approval, execute packaged code or connect models.

## Boundaries

- Read only an explicitly selected package under the Gate 2 evidence root. No directory-wide search, credentials, network, production writes or Gate 1 changes.
- Manifest version gate2-freeze-v1; split dev only. Distinguish synthetic-test from development purpose. Require public/oracle/prompt/plan/runtime/evaluator/review roles in separate path partitions.
- Verify byte lengths and SHA-256 before parsing contents. Manifest itself must match a digest supplied independently by the caller; never derive the expected digest from the same file and call that a verified pin.
- Review records reference exactly the public, oracle and plan bytes. Check declared author/reviewer are distinct and decision is approved; do not claim human identity, signature authenticity or semantic truth verification.
- Reuse createPlan for structural matrix checks only. Verify declared model identity in runtime metadata matches manifest. Do not claim evaluator dependency closure, corpus completeness, valid prompts or real configuration readiness.
- Return a report and an in-process verified public-input accessor. Accessor accepts only a genuine verification handle, returns copies of verified bytes, and never reopens files or returns oracle bytes. This is a logical boundary, not an OS sandbox.
- Reject duplicate JSON keys, unsafe/aliased/linked paths, nonregular files, oversized packages, stale review bindings, missing/duplicate singleton roles and mixed splits.
- CLI verify-freeze is read-only and never sets live_execution_ready=true.

## Tasks

- [x] F1: write failing integrity/isolation tests and interface stubs; implement strict manifest and byte verification.
- [x] F2: test stale review references, runtime/model mismatch, structural schedule errors, safe source export and adversarial path cases; implement binding and verified public accessor.
- [x] F3: test read-only CLI with expected external digest, rejection of missing pin and credential/live flags; expose verify-freeze without changing existing check/plan semantics.
- [x] F4: run full research/repository tests, inspect source bounds and Gate 1 hashes, update current docs and preserve evidence.

## API and package format

verifyFreezeBundle({ manifestPath, expectedManifestHash }) -> frozen report object; readVerifiedPublicInputs(report) -> [{ path, sha256, bytes: Buffer }]. A deserialized or forged report cannot authorize access.

Manifest fields: version, split, purpose, generator_version, protocol_version, model_snapshot, files. Each file entry has path, role, bytes, sha256. Role directories: public/, oracle/, prompts/, plan/, runtime/, evaluator/, reviews/. Plan/runtime/review each occur once. Public/oracle/prompt/evaluator require at least one entry. The plan file contains a createPlan-compatible manifest. Runtime JSON declares model_snapshot; full runtime validation remains separate.

Review fields: version=gate2-review-binding-v1, author, reviewer, decision=approved, reviewed=[{path,sha256}] exactly covering public/oracle/plan entries. Test fixtures use synthetic identities and engineering payloads; they are not a formal frozen corpus.
