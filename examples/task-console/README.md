# ACMI task console

This local example persists explicit task identity and bounded history using the
Graph Host and the pinned dsh JSONL writer. It is **not a chat client**. Native
events come only from the fixed `sample` command, are marked synthetic, and use
no Provider, model request, tool execution, or network service. Operator-entered
objectives and criteria are stored as Graph task metadata, not sent to dsh.

## Start and reopen

From the repository root, install with the pinned Node/pnpm versions and build:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Create three existing directories: one Workspace and two **new, empty** writer
roots. Pass their canonical absolute paths (on Windows use the drive and casing
returned by `realpath`). The directories must be distinct and non-overlapping,
with no symlinks and no overlap with a dsh Home. For example, after creating
the directories under `/tmp/acmi-console-demo` on POSIX:

```sh
node examples/task-console/run.mjs \
  --workspace /tmp/acmi-console-demo/workspace \
  --journal /tmp/acmi-console-demo/journal \
  --graph /tmp/acmi-console-demo/graph --init
```

Inspect the displayed roots and enter exactly `yes` at the initialization
prompt. Any other answer, blank input, or EOF cancels; no directories are
created by the console. Startup without `--init` never provisions roots, and
initialization refuses existing data. Compression defaults to `none`; use
`--compression zstd` if desired, and keep the same choice on reopen.

Reopen with the same command **without** `--init`. Each process verifies the
pair, takes both writer leases, issues fresh Workspace-scoped read/write/operator
grants, and reconciles only registered Journal sources. It shows status and
the first receipt index page before accepting commands. On success the process
creates a fresh native Session, with no Binding inherited from the old one.

## Use the console

| Command | Effect |
| --- | --- |
| `tasks` / `tasks next` | List up to 16 tasks by exact UUID; `tasks` resets pagination. Titles are not identifiers. |
| `create` | Enter one objective line (up to 4,096 characters), 1–16 criterion lines (up to 1,024 each), then a blank line. Inspect the preview and confirm. This creates a UUID but does not bind it. |
| `continue <task-uuid>` | Preview the Task, its revision, the current Binding, exact Session/incarnation, and native/Graph sequence boundaries. Confirm to bind this Session and display limited history. |
| `leave` | Preview and confirm unbinding this Session. Does not close the Task or remove history. |
| `session new` | Checkpoint, drain, and close the current Session before creating a new unbound Session. |
| `status` | Show the exact Session, Binding, recovery reason, reconciled source/event counts, and pending events (`null` means unknown). |
| `history <task-uuid>` | Read task metadata and up to 64 recent assigned native event coordinates, with attribution and original call sequence where present. Does not bind, resume, or show message/tool payloads. |
| `sample` | Append and checkpoint one fixed synthetic turn. Run this while bound to see its metadata in Task history. |
| `receipts` | Restart the read-only receipt index: up to 16 rows with exact Session/incarnation, ordinal, operation ID, kind, and Task UUID. |
| `receipts <session-uuid> <incarnation> <after>` | Continue the receipt index with the three values returned in `next` (ordinal is exclusive). `next: null` ends the index. |
| `receipt <session-uuid> <incarnation> <ordinal>` | Read one exact committed receipt, including before/after Binding and its effective sequence. |
| `help` / `exit` | Show commands / close the console. EOF and Ctrl+C also stop input and request shutdown. |

For example: `create` → confirm → copy `taskId` → `continue <task-uuid>` →
confirm → `sample` → `exit`. Reopen and use `tasks`, `receipts`, and
`continue <same-task-uuid>`; the new Binding has revision 1 and a new receipt.
An old receipt is evidence of a commit, not current authorization. If the
process disappeared after a confirmation, check `receipts` before retrying.

Wait for the confirmation prompt before typing `yes` and pressing Enter. The
console rejects a confirmation line it buffered before the current prompt.
Any other line, blank, or EOF cancels. The in-memory preview expires after 120 seconds;
on expiry or drift, rerun the command and confirm its new preview. Output is
one `label JSON` line at a time, with terminal control and format characters
escaped. Embedded control sequences are never executed by the console.

## Recovery and shutdown limits

- `identity_ready` means the current Session has a committed Binding.
  `identity_unbound` is expected after startup or rotation. `history_ready`
  means the bounded read is current, even if no visible events exist;
  `history_incomplete` means recovery, reconciliation, or a history read did
  not complete. `model_context_not_enabled` is always shown in status.
- A missing, changed, truncated, or inaccessible registered source can cause
  `recovery_blocked`. The console refuses mutation and sampling, but still
  allows verified reads and exit. It never enrolls a Journal left behind
  before registration, or replays a committed receipt.
- `busy` means a writer lease could not be acquired. Wait for the other writer;
  do not delete the owner sidecars. If root opening fails, `initialization_incomplete`
  is one possibility, not a diagnosis for every I/O error. A mismatched or
  partially initialized pair is rejected without repair. Existing data
  migration, repair, and bypassing the leases are unsupported.
- `shutdown` reports `{saved, pending, reason}`. `saved: true` is the only
  complete success. The shutdown observation window is 10 seconds; on timeout
  the console reports unsaved status (exit code 1) rather than forcibly exiting
  while cleanup has writers to stop. Both leases remain owned by the Host until
  teardown finishes. Pending counts Graph ingestion, not writer activity;
  `pending: 0` alone does not prove a successful close.
- The Store caps the Workspace at 64 Tasks and 256 registered Sessions,
  including fresh Sessions on reopen. This example is for isolated local
  use, not production recovery, existing dsh profiles, or restored model
  work context.
