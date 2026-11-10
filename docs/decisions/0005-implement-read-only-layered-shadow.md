# ADR 0005: Implement bounded layered understanding as read-only Shadow

Status: Implemented in an isolated, default-off Phase 0.9.3 path; not production-qualified.

Keep the Layered Understanding Context separate from execution Task Context. State is ephemeral, revision-aware, scoped, and never a graph. Bindable and historical candidates have separate budgets and handles. Only trusted typed metadata may skip semantic analysis; completed user text cannot be suppressed by lexical gates. Graph change suggestions are bounded, evidence-checked review drafts and have no writer.

Keep the current trusted explicit Host operations unchanged. No production router, Global Memory, network analyzer, automatic Task operations, or qualification claim. See [qualification](../experiments/phase-0.9.3-qualification-report.md).
