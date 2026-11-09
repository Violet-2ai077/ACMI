# End-to-end persistent recovery

1. Host explicitly opens Task streams and attaches the first stock dsh
   Session. A scripted in-process Adapter runs real turns and a tool.
   Native append notifications produce bounded metadata only. A/B/A uses
   explicitly authored native Binding fixture records (never auto Binding).
2. The host creates a graph checkpoint; the observer is unloaded.
   After a native suffix lands, a newly registered observer detects the
   cursor gap and reconciles only that selected Session. A second source
   Session contributes more events to the same Task.
3. The host explicitly accepts a next-action proposal. An independent
   process opens the persisted SQLite store, restores the exact checkpoint
   plus suffix cut, and exits. A new dsh Session receives a package from
   the reopened graph, not inherited chat. The source Journal hash is
   unchanged by recovery.
4. A separate test runs two actual stock child Agents via the public
   factory and checks the two parent execution links. The parent can
   continue before a separate host-confirmed wait; child completion does
   not resume it or create accepted results. A synthetic persistent
   benchmark family separately tests failed execution/retry, inspected
   and consumed output, acceptance, explicit join and advancement.

The 160-case benchmark is fully synthetic and agent-labelled. It records
normalization, late causal links, duplicate/gap behavior, same-revision
proposal checks, checkpoint recovery, child attempts, context budget and
scope. Real process crash/corruption and real request-cache expiry/revoke
are integration tests, not inflated into 160 native-runtime runs. See
the packaged logs for counts and the explicit residual risks.
