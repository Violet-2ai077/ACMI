# Context snapshot lifecycle

A prepared snapshot binds Workspace partition, Task UUID, exact Session
identity/incarnation, stream revision, projection and source revisions,
assembly policy, budget, active node, package hash, created time and expiry.
The snapshot ID hashes these fields. A repeated preparation with an
unchanged valid cut reuses it; an expired/revision-stale one does not.
The callback checks the live Agent, authorized grant, TTL and warm
revision before each reuse. Registering for a new Agent requires a new
host action. One prepared snapshot per registration; metrics are bounded.

On dispose, revoke, expiry or invalidation the contribution stops on
future callbacks. dsh may still retain an older `runtime-context` snapshot
as ordinary history. The Phase 0.8.1 stock request test **observed the old
package hash in a later request after revocation**. This is not effective
retroactive revocation. ACMI cannot safely scrub the old bytes via this
hook, and does not edit the target Journal, replace Compact, or attempt
automatic deletion. The portable package is not separately copied into
ACMI's SQLite graph store. Host TTL metadata is in the live registration;
the native historical message does not gain enforcement metadata.

Keep the experiment synthetic and off by default. Treat a target Session
that ever held now-disallowed context as retired for sensitive continuation;
start a genuinely fresh authorized Session rather than reusing it. No
production data handling claim is made until dsh supplies a supported
request-history revocation/retention mechanism or an approved alternative.
