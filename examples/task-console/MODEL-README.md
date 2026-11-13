# Explicit local model continuation console

This is a separate, opt-in experimental entry point. The original `run.mjs`
remains an offline scripted console. This entry point uses the pinned native dsh
Agent Loop for a real, text-only local model response after explicit task selection.
It is **for isolated synthetic fixtures only**, not existing personal dsh profiles,
production data, automatic task routing, or a general-purpose assistant.

An `ask` sends the current prompt, selected Task objective/criteria, and bounded
historical plain text to the displayed loopback server. Previous user text,
assistant text, and eligible tool-result text can be included. The console does
not execute tools, load cloud credentials, call paid APIs, discover arbitrary
histories, or automatically call a model on startup/binding. Local servers may
retain requests in their own logs; loopback is a destination constraint, not a
confidentiality or model-behavior guarantee. Use made-up data throughout.

## Prepare and start

Use the repository's pinned Node 24.16.0, pnpm 11.28.5, and dsh 0.2.2-rc.1.
No new package dependencies or additional runtime versions are supported here.
From the repository root:

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node --test examples/task-console/tests/model-console.node-test.mjs
```

Offline installation requires the pinned packages already in the local pnpm
store. A missing package is an installation failure, not permission to silently
change versions.

Start your separately installed local text-only OpenAI-compatible server using
your existing model files and an unused loopback port. For a pinned llama.cpp
installation, a command template is:

```sh
llama-server --model /absolute/path/to/model.gguf --host 127.0.0.1 --port 8080
```

Model-specific settings still matter: the response must be a final plain-text
assistant message, not a tool call, truncated completion, or nonempty separate
reasoning response. Configure the local model accordingly before using the
console. The console does not download weights, start/stop your server, or alter
its configuration. The example command is not a claim that every model passes
the response or semantic gates.

Create three dedicated, existing directories: a Workspace and two **new, empty**
Journal/Graph writer roots. Use canonical absolute paths, distinct and
non-overlapping, without symlinks or overlap with any dsh Home. Windows paths
must use the drive/casing returned by `realpath`; quote paths containing spaces.
Do not reuse old experiment stores to try initialization.

```sh
node examples/task-console/model-run.mjs \
  --workspace /absolute/acmi-model/workspace \
  --journal /absolute/acmi-model/journal \
  --graph /absolute/acmi-model/graph \
  --endpoint http://127.0.0.1:8080/v1/chat/completions \
  --model synthetic-local-model --init
```

The command is POSIX shell syntax; in PowerShell use one line or backticks
instead of trailing backslashes. Set `--model` to the model identifier your
server accepts. `--endpoint` is the **full** completion URL, not a base URL.
Only plain HTTP on numeric loopback `127.0.0.1` or `[::1]`, with exact path
`/v1/chat/completions`, is accepted; credentials, query, fragment, remote hosts,
and redirects are rejected. The transport connects directly without proxy
environment handling. `--compression none|zstd` defaults to `none`; preserve
the same choice when reopening. `--help` opens no runtime or storage.

Inspect the displayed roots, then type exactly `yes` when prompted to initialize.
The console creates no directories and refuses existing writer data. Reopen with
the same roots/compression **without `--init`**. Each open creates a fresh,
unbound Session; it does not inherit the previous Session's Binding.

## Explicit workflow

1. `create`: enter a synthetic objective, at least one acceptance criterion, then
   a blank line. Inspect the preview and confirm with a freshly entered `yes`.
   Copy the committed Task UUID. Creating a Task does not bind it.
2. `continue <task-uuid>`: inspect the Task/Session/Binding preview, then type a
   fresh `yes`. Exact UUIDs, not titles, select Tasks. Limited history is shown.
3. `ask Remember that the synthetic valve label is VIOLET-7. What is the next check?`
   Inspect the destination, model, Task UUID, prompt, and context budget. Only a
   fresh exact `yes` sends the request. The answer, context digest/coordinates,
   and resulting native sequence boundary are displayed.
4. For another turn, run **`session new`**, then **`continue <same-task-uuid>`**,
   confirm again, and only then `ask What label did we record?`. Do not repeat the
   historical fact in the new prompt when testing continuation.
5. `exit`: inspect `shutdown`. Only `saved: true` means the close completed.
   Reopen without `--init`, use `tasks` to locate the same UUID, explicitly
   `continue` and confirm, then `ask` and confirm again.

Each Session supports at most one model invocation. This avoids accidentally
using a live in-memory conversation as evidence of restored historical context.
Cancelled confirmation does not consume the Session. The Host also verifies
freshness and authorization; CLI prompts are not the security boundary.

Wait for **each** confirmation prompt before typing `yes` and Enter. `YES`, spaces
around `yes`, blank input, EOF, Ctrl+C, or a line buffered before that prompt
does not approve the operation. Do not pipe an entire pre-approved transcript.
Input prompts are single-line and bounded; terminal control/format characters
in output are escaped, not executed.

| Command | Purpose |
| --- | --- |
| `tasks` / `tasks next` | Page through Task UUIDs, 16 at a time. |
| `create` / `continue <task-uuid>` / `leave` | Preview and explicitly confirm Task creation/binding/unbinding. |
| `session new` | Checkpoint and close the current Session; open a fresh unbound Session. |
| `ask <one-line prompt>` | Confirm exactly one local model request in a fresh, bound Session. |
| `status` | Show Session, Binding, recovery and pending-work status. |
| `history <task-uuid>` | Show up to 64 assigned fact coordinates, not raw historical message bodies. |
| `receipts` | Show the first page of lifecycle commit receipts. |
| `receipts <session-uuid> <incarnation> <after>` | Continue a receipt index using its returned cursor. |
| `receipt <session-uuid> <incarnation> <ordinal>` | Inspect one exact lifecycle commit receipt. |
| `help` / `exit` | Show commands / request clean shutdown. |

The old `sample` command is deliberately unavailable here. Task lifecycle
receipts prove lifecycle commits, not a model response or semantic correctness.

## Bounds and failed requests

- Context uses the latest **64 assigned facts**, not necessarily 64 messages and
  not complete history. From those facts, eligible plain text is read only from
  the registered Journal coordinates for the selected Task. Attachments,
  reasoning, and tool arguments are excluded. Older evidence can be outside the
  window even if it remains on disk.
- The CLI sets a **16 KiB UTF-8 serialized context budget**, including metadata
  and evidence. Overflow fails before model execution; text is not silently cut
  to fit. The Host API can accept a smaller or larger explicit budget up to
  32 KiB, but this CLI exposes no budget flag. The prompt and model's own context
  window are separate constraints. A local server may reject oversized input.
- A request allows at most 512 output tokens and 120 seconds, with bounded
  response bytes. Missing/invalid usage, non-text responses, truncation,
  redirects, and invalid response framing fail. There are **no automatic retries**.
- After any invoked `ask` fails, the CLI conservatively labels its outcome
  **unknown** and blocks further asks in that process, even after Session
  rotation. This is not a claim that the server did or did not generate text.
  Cancellation/timeout may leave native records. Inspect `history`, `status`,
  and `receipts`; `exit`, verify clean close, reopen the same pair, and explicitly
  bind again before deciding whether a new request is appropriate.
- On `recovery_blocked`, use verified reads and exit; do not force mutation,
  delete a Journal, clear a lease sidecar, or rerun initialization. Generic errors
  deliberately omit raw exception text and request contents.
- Shutdown observes cleanup for 10 seconds and reports unsaved status on timeout;
  it does not force process exit while the Host still owns writers/leases.
  `pending: 0` alone does not prove successful persistence. Resource limits remain
  64 Tasks and 256 registered Sessions per Workspace, including reopen Sessions.

## Storage handling and evidence limits

No backup/restore protocol, data migration, automatic repair, or production
recovery guarantee is provided. If making an experimental copy, first stop all
writers and wait for successful close; keep the paired Journal and Graph roots
together with their markers and Workspace identity. Do not copy live roots or
mix snapshots from different times. A copy is not a tested portable restore and
must not be used to bypass path, identity, or lease validation.

The deterministic CLI tests exercise argument/confirmation boundaries using a
fake Host; they do not prove native persistence or model semantics. Native
integration tests and the separate frozen real-model experiment provide those
other evidence layers. A fluent answer is not evidence of correct task isolation
or complete history. Keep those result categories separate when reporting a run.
