# Official dsh integration

`@acmi/dsh-integration` is the first official runtime integration, not a dependency of ACMI Core. Build it from the ACMI workspace. See the [dsh Quick Start](../../examples/dsh-quickstart/README.md) for a provider-free, isolated run and an opt-in Cordis patch.

| Boundary | Verified in this Alpha |
| --- | --- |
| Runtime | Published DeepSeek Harness packages `0.2.2-rc.1`, upstream baseline `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`; Cordis `4.1.0` |
| Plugin | Published Cordis lifecycle and real dsh Session, Storage Domain, projection, tool registry and JSONL writer modules; explicit UUID task creation/listing/binding; read-only history; clean unload |
| Harness | Committed human/assistant messages, turn and step boundaries, native tool call/result sequence edges. Level 4 on the dedicated v4 journal source, including reopening a new adapter over two stock-writer Sessions |
| Storage | Current-generation v4 plaintext or stock checksummed Zstandard; immutable read, source hash check, scoped discovery and snapshot validation, cursor invalidation; trusted local exclusive root only |
| Observer | Metadata-only HTML companion via host-authorized `ctx.acmiHistory.render`; not a native dsh-context tab |
| Host | Node 24.16+ within the Node 24 line; Windows tested. No validation of a pre-existing installed Desktop/TUI profile, multi-tenant root, or untrusted/mutable filesystem |

## Modules and data flow

- **Plugin:** dsh/Cordis `apply` reads host configuration, validates the exact dsh baseline and required services, checks the isolated-root marker, and installs the `acmiHistory` host service. Without `readOnly: true`, it also installs `acmi_task_create`, `acmi_task_list`, `acmi_task_bind`, and `acmi_task_history`. Create/list/history do not bind; binding applies only after its native plugin-record sequence. Repeating the current task does not allocate another revision. Task creation is idempotent across retries of the same Session incarnation/step/call identity; an argument-changing retry fails.
- **Harness Adapter:** translates native journal cuts to Core facts. It excludes inherited events, injected context, replacement edits, assistant attempts/deltas, and all message/argument/result content. A tool result pairs only with a single earlier source sequence whose Session, turn, step, and call identity agree. Reused tool IDs alone do not establish causality. No durable Session open/close or subagent lifecycle is synthesized from headers. No context injection or automatic binding hook is advertised.
- **Storage Adapter:** reads only the Workspace partition under an explicitly marked root. Native writer layout is unchanged; the adapter opens files read-only, checks header/path/descriptor identity, bounds input/output/decompression, and uses the published v4 format codec. It never calls native global discovery, migration, repair, or rewrite. The low-level journal API is privileged host composition, not a model/UI API; only projected metadata leaves the history/Observer service.
- **Observer:** passes the live caller's host-issued scope to the same history read service. A host can render a Task UUID timeline or the unresolved slice; raw payloads and write actions are absent. The embedding application owns authentication and maps a caller to a live Session before invoking the service.

## Operational boundaries

Workspace and journal roots must be absolute, canonical and on a trusted local filesystem. The journal root must be outside the Workspace and outside all dsh homes, start empty, and be explicitly provisioned for one Workspace/encoding. Point the stock writer at exactly that root. The native readable partition label is not an authority; the marker and header must match. No share with other Workspaces, processes that can replace local files, or users outside the host trust boundary. In particular, Windows pathname opens cannot provide a kernel-enforced adversarial namespace guarantee; checked identities and read-only opens are not a general-purpose sandbox.

The reader caps a cut at 16 MiB compressed or 32 MiB plaintext, 50× expansion, 4,096 events, 1 MiB per line, depth 48, six seconds per file/discovery, and 128 directory entries per inventory; history has a ten-second deadline and 16,384 aggregate events. The plugin serializes operations; concurrent independent decoders may return `ACMI_JOURNAL_BUSY`. Scope/format/change/limit errors fail closed. A cursor is bound to one authorized Session and one set of source revisions, the projection version and query; restart after a source append or reload. No implicit fallback or unverified compatibility.

`acmi_task_create`, `acmi_task_bind`, and `acmi_task_list` require a durable Session on the configured writer. Establish a normal durable checkpoint before using those tools. Explicit task records are appended through the stock host Session API; that write path is separate from the read-only history adapter and Observer. ACMI does not change dsh Agent Team Task IDs or enable model-driven attribution.
