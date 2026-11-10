# Host-owned ingestion supervisor

The trusted Host explicitly opts in and supplies separate Workspace read/write
grants and a Session allowlist function. Startup consults live Agents only;
`agent/created` sees later creates and resumes. The same live Agent/Session,
cwd, backend identity and unchanged authority are required before processing.
Authorization is not Task Binding. Optional work assignment is supplied by
trusted Host policy and revalidated without changing existing binding records.

The public append listener takes references to already immutable native rows
without reading payloads or touching disk. The global/per-Session queue defaults
to 2048/256 and drops notifications, not durable events, on overflow. The
first/last missing coordinates and count remain observable. Round-robin
quanta share one transaction lane. Defaults: 16 Sessions (max 32), 20 ms
debounce, 100 ms max wait, 1000 ms metadata probe, 32 rows or 16 ms per
commit quantum, four bounded backoff retries. Caps are local process controls,
not a latency SLA; an individual synchronous transaction cannot be preempted.

The bounded watchdog uses indexed cursors and live head positions, no cold
read absent a gap. On shutdown stop new admission, seal the known heads, drain
until the deadline, cancel, detach, and report pending work. The Host closes
its Store after stopping; ACMI never owns or closes the native Journal writer.
