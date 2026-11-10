# Evidence-grounded Proposal v0.1

A protected source is separate from the runtime fact row and from model
output. The trusted synthetic Host records an optional exact excerpt, its
UTF-16 half-open range and digest, the stored fact's actor/type/turn/step and
Workspace/Task/Session/incarnation, and an append-only generation. Revision
and hash must match at stage and again inside the review transaction.
Revocation/replacement invalidates old links without editing native history.
Receipts show the exact claim hash, role and protected source coordinates, not
the raw excerpt. The dedicated local SQLite root is the protection boundary;
there is no claim of at-rest encryption, identity proof or production privacy.

An accepted Decision needs an exact user confirmation of the named topic and
choice (not a question, conditional approval, or assistant suggestion), or an
independently attested Host confirmation of the exact change hash. A normal
reviewer's accept button alone is not a source. Rationale and alternatives
cannot silently add unsupported assertions. Explicit rejections and the
existing decision supersession invariants prevent last-write-wins.

Tool metadata alone cannot support a Result summary. An exact complete line
from a protected result excerpt can support an **unverified** observation.
Truncated partial boundary lines, invented summaries and obvious instruction
payloads are withheld. Subagent completion cannot stand in for output
content or acceptance. Dependencies use directional explicit clauses,
reference scope and projection/topology validation. Mixed/ambiguous claims
can abstain. Qualification retains the existing no auto-closure/no auto-Join
semantics, and a qualified Store cannot reopen into legacy review mode.
