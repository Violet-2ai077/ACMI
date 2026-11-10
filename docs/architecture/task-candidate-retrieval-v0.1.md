# Bounded Task Candidate Retrieval v0.1

The local Host seeds or updates a revisioned, Workspace-scoped catalog.
Upsert validates scope; every query rechecks Task access and excludes closed
entries. Sources in rank order: literal authorized reference, explicit
current Binding, exact Session-incarnation recency, title/objective lexical
match, and Workspace recency. Scores and matching fields explain ranking;
they do not confer identity or permission. Closed/excluded/missing references
do not become candidates even if explicitly named.

The query reads at most 12 term postings of 32 entries, at most 32 workspace
and 32 same-session recent entries, eight explicit hints, and a current
binding. It emits at most eight ranked Tasks. The in-memory index is bounded
to 2,048 records; no vector store or Workspace-wide query per turn.
Recency and posting caps can omit the correct Task, especially with many
near-duplicate titles; a valid reference outside the available set is not
guessed. The benchmark reports top-1/3/8 separately from unauthorized
exposure, including old, closed, similar and missing cases.
