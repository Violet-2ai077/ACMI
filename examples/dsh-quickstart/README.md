# dsh Quick Start

This is an isolated run of the official ACMI plugin with published DeepSeek Harness `0.2.2-rc.1` modules, not the provider-independent Synthetic Demo. It does not install or alter an existing dsh profile. No provider key, model call, or dsh source patch is required.

From the ACMI checkout root, use Node `24.16.0` or newer on the Node 24 line and pnpm `11.28.5`:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @acmi/dsh-quickstart demo
```

The example uses the supported Cordis `ctx.plugin(Acmi, config)` mechanism to attach the built package to stock dsh Session, tool, projection and storage services. It creates a temporary Workspace, journal root and Task Registry. It calls `acmi_task_create` and confirms that creation did not bind. It explicitly calls `acmi_task_bind`, commits synthetic work, starts another Session, reads prior history without binding, then binds explicitly in that Session. The result reports one prior event, two total events and Session-local revisions `[1, 1]`.

Run the Zstandard variant or open the read-only Observer:

```sh
pnpm --filter @acmi/dsh-quickstart demo --zstd
pnpm --filter @acmi/dsh-quickstart demo --serve
```

Open the printed loopback Observer address. It exposes only the synthetic, payload-free timeline at an unguessable, ephemeral path. Press **Ctrl+C** to close the listener, unload the plugin and remove the temporary directories. Without `--serve`, the example cleans up on exit. Do not reuse the example listener to serve real Session history.

## Optional stock CLI/profile composition

Use a disposable **new** profile/home, not an installed daily-use profile. Build ACMI as above and use a separately audited, exact-version dsh binary (`dsh --version` must report `0.2.2-rc.1`). This workspace's lockfile does not patch or attest a separately installed CLI dependency tree. Prefer the provider-free, lockfile-pinned demo above if you do not already have an isolated compatible CLI.

1. Choose separate canonical absolute directories for `DSH_HOME`, `DSH_AGENTS_HOME`, the synthetic Workspace, the initially empty journal root, and registry storage. Set the two environment variables to the disposable homes before any dsh command. The journal root must not be in or contain a dsh home or the Workspace.
2. Explicitly provision the existing empty journal root from the ACMI checkout:

   ```sh
   pnpm --filter @acmi/dsh-quickstart prepare-root /absolute/disposable/acmi-journals /absolute/disposable/workspace none
   ```

   Use `zstd` instead of `none` only if every writer and reader configuration below also uses `zstd`.
3. Copy [`cordis.patch.example.yml`](cordis.patch.example.yml) into the disposable directory and replace every placeholder. Point the plugin row at the built entry point using an absolute file URL (for example `file:///C:/work/acmi/integrations/dsh/dist/index.js`), and use the same journal root and compression for the native writer and ACMI. Do not put the registry storage inside the journal root.
4. Check the isolated composition with `dsh --profile web --patch /absolute/disposable/acmi.patch.yml --dump-config`. A configured dsh host can use the same `--patch` when booting the disposable profile. Do not use a version exemption. Full interactive profile attach is not part of the provider-free quick-start test.
5. Keep the Session's original working directory equal to the canonical Workspace path. After dsh has durably checkpointed the Session, use the host tool registry to call `acmi_task_create` with a title, `acmi_task_bind` with its UUID, and `acmi_task_history` with the UUID for metadata only. No `task_id` selects unresolved events. In a trusted host, `await ctx.acmiHistory.query(liveSession, { taskId, limit: 20 })` provides the cursor API; `await ctx.acmiHistory.render(liveSession, { taskId, limit: 20 })` returns Observer HTML. Render unresolved via `{ unresolved: true, limit: 20 }`. There is no automatic network route or native dsh-context tab.
6. Stop the dsh process and discard only the disposable home, journal and registry directories you created.

## Troubleshooting

- `ACMI_DSH_VERSION` / `ACMI_DSH_CAPABILITY`: use the exact pinned runtime and base Cordis services.
- `ACMI_JOURNAL_SCOPE`: check canonical paths, separate homes, marker and exclusive Workspace; do not bypass the check or point at an existing dsh session root.
- `ACMI_DSH_JOURNAL_NOT_READY` / `ACMI_DSH_WRITER_MISMATCH`: checkpoint the Session; confirm both plugins point at the same journal root/encoding and the Session's original Workspace matches.
- `ACMI_JOURNAL_UNSUPPORTED` / `ACMI_JOURNAL_CORRUPT`: no legacy migration, torn-tail recovery, or silent encoding fallback is performed. Use a fresh dedicated v4 root.
- `ACMI_HISTORY_CURSOR` / `ACMI_JOURNAL_CHANGED`: retry after source activity settles, starting at the first page. Do not reuse a cursor from another Session or query.

See the [integration compatibility and security boundaries](../../integrations/dsh/README.md) before using any non-synthetic source.
