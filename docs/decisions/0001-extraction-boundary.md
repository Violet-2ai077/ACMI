# 0001: Curated extraction, not a fork

Use the Phase 0.6.1 source and verified historical evidence as a comparison baseline, not as a dependency or a new Git history. Keep the published dsh surface at the adapter boundary. Import native format code only if necessary for a reviewed, bounded read path; never import the native writer into Core. Prefer an explicit conditional capability over an undocumented fall-through into global persistence.

Core consumes normalized facts, not model outputs, browser requests or storage paths. Derive read-only attribution from explicit binding events and exact causal references. Preserve unresolved events and session-local ordering. Proposals cannot write.

Validation order: provenance, isolated packages, dsh compatibility, demo/conformance, clean-clone CI equivalents, tree/history security audit, exact source archives. Publication is a separate gate and requires the designated account and actual repository write access.
