# Context Package schema v0.1

`task-context-package-v1` carries Task UUID, active WorkNode ID, current Task
and WorkNode state and attempt, items, aggregate omissions, and assembly
metadata. Each item carries stable ID, kind, Task ID, optional WorkNode,
status, tier, inclusion reason, text and inline source manifest. Each source
cites an authorized Session incarnation and source cut/seq and, where
applicable, the Task graph event ID/seq. Seq is logical freshness, not wall
clock time. Dependency items also state the exact producer/result, review
stage, verification flag and optional pinned producer revision.

The wire form uses canonical JSON (sorted object keys, unchanged array order).
Candidates sort by tier, policy rank and code-unit ID. SHA-256 is supplied by
the trusted host and computed over canonical package data without the hash
field. A new graph revision changes the hash even if selected text is the
same. Verify with `loadTaskContext` and an independently trusted expected Task
and package hash, never a self-declared digest or client-supplied Workspace.

Budget is 1..262,144 units; the disclosed estimator charges one unit per UTF-8
byte, plus a 192-unit wrapper reserve. This is conservative for the experiment,
not an exact tokenizer, a provider-context-size guarantee or a guarantee for
every tokenizer. It includes JSON escaping, refs, omission counts and hash.
Tier 0 is admitted together or returns `budget_insufficient`; optional items
that do not fit are skipped with a reason. Non-OK results have no partial model
package. The host diagnostics carry one reason per considered omission where
practical; only bounded reason counts enter the wire package. A scope denial
and unknown Task both yield `unavailable`, without foreign metadata.

The recovery fixture invokes the portable package reader in a new Node
process. It neither persists Binding nor injects the packet into an arbitrary
runtime. Serialized content is historical evidence, not agent instructions;
real-data prompt safety and authorization at the handoff boundary are future
qualifications.
