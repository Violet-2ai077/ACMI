# Gate 2 preparation implementation plan

Execution: executing-plans and test-driven-development, inline; no subagents.

Goal: prepare provider-neutral scheduling and request boundaries without guessing a model, spending money, or weakening Gate 1.

Architecture: a deterministic development manifest produces ordered conversation blocks; a separate compiler exports only model-visible fields. A readiness check reports unresolved execution inputs. These modules have no transport, credential reader, or production writer.

Tech stack: existing Node ESM and node:test, built-in modules only.

Spec: E:/codex-prj/ACMI/deliverables/phase-0.9.19/model-native-task-attribution-research-design.md, R2 sections 2, 4, 5.5, 6 and 7.

## Scope and rulings

- Owner said to start. Continue implementation in the existing isolated worktree; do not ask again for generic permission.
- Model snapshot, route, monetary cap and human adjudication records remain unspecified. Do not invent them or interpret 576 proposed calls as an approved spend.
- Preserve Gate 1 source and evidence. New implementation lives under this gate2 directory; tests join the existing offline suite.
- Model-visible requests must omit evaluator metadata: category, difficulty, SM labels, identity visibility, family labels and oracle. C2/C3 must not receive C1 projections.
- Fixtures authored in code by an assistant are engineering vectors, not human-authored or human-adjudicated research Ground Truth. Do not relabel them as frozen research data.
- No commits, merge, push, live requests, dependency installation or independent review agents.

## Tasks

- [x] T1: write failing schedule tests: 6 families x 8 turns; 432 closed-loop + 72 replay + 72 diagnostic calls; stable seeded block ordering; D pairs adjacent; 18 difficulty/category cells; malformed manifests rejected. Implement planner, then verify.
- [x] T2: write failing request-boundary tests: exact original message order/content, source IDs, strict C1/C2/C3 allowlists, no evaluation metadata, C0 and D stages, immutable D1 text and stable request hash. Implement compiler, then verify.
- [x] T3: write failing readiness tests: missing model/route/cost/review/hash rejects; named synthetic complete inputs pass metadata checks only; no credential values accepted. Implement offline readiness CLI and blank config, then verify.
- [x] T4: run complete research suite, syntax and whitespace checks; preserve red/green logs and change hashes; deliver unresolved inputs and next implementation boundary.

## Later work, not claimed complete here

Choose and pin the actual provider contract only after route/model are supplied. Implement and test its raw streaming adapter, global durable budget reservation and evidence path isolation before any live run. Archive provider wire bytes separately from extracted model text. Pin price inputs including reasoning usage or conservatively reserve worst-case charge; unknown cost must stop rather than mean zero. Freeze human-reviewed corpus, prompt bundle and probe selection before the first call. The offline readiness report is not a live execution authorization or a verification of these future components.
