# TC5 - implicit ambiguity and recency controls

See [frozen plan](PLAN.md). Two 12-turn synthetic CLOSED-LOOP stories, 24 primary
calls, at most 28 including environment retries. No full-state maintenance.
Strict oracle and potential recency interpretation are declared before output.
`run.mjs`: freeze/run/score/check-freeze/scan, no resumption of existing evidence.

Completed: [results](RESULTS.md). Implicit ambiguity clarification 1/4;
strict local criterion FAILED, 21/24 canonical outcomes. Resolved return and
continuation markers correct; basic answers 20/24, including one extra content
question after identity recovery. 24 calls, no environment failures/retries.
