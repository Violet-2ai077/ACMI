# Work lifecycle and joins

WorkNodes begin planned. The common path is planned -> ready -> running ->
completed. Work may block, return to ready, fail, cancel or be superseded.
A failed node returns to ready only when its prior executions are terminal;
it gains a new attempt. Dependency edges gate entering running until the
required WorkNode is completed. Historical results remain associated with
their original attempt and cannot satisfy a new join attempt.

Executions start running and may wait for explicitly named live child
executions, idle, resume or terminate. A wait does not block a logical
WorkNode; a child completion does not resume its parent. The same Agent ID
can execute multiple distinct WorkNodes using different execution IDs.
Progress updates and execution transitions advance the stream without changing
the node state. A host can reconstruct exact order from the event stream; no
clock duration is inferred from delivery time.

```text
branch runs -> result produced -> available -> inspected -> consumed -> accepted
            -> branch completed                      (separate signals)
both conditions met -> explicit join-satisfied event -> explicit mainline advance
```

The join policy is all configured local branch nodes completed with at least
one verified and accepted current-attempt result each, plus all explicitly
required external receipts accepted by this join attempt. A result may exist
without a review, or be consumed but not accepted. Neither case satisfies the
join. Requirements cannot be added to an already satisfied join. Mainline
advance is a separate event over a `continues_as` edge from a completed
predecessor; an unsatisfied join cannot become the mainline position. The
join remains a separate node and does not collapse branch history.
