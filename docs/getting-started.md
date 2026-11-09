# Getting started

Use the Node version range and pinned pnpm release in
[`package.json`](../package.json). Run these commands in the ACMI checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

The synthetic scenario creates Task A, binds it in Session 1, switches that
Session to Task B, and resumes Task A in Session 2. Look for a Tool Result
linked to its Tool Call, one unresolved event, and Task A's history across
both Sessions. The input is deterministic. The demo does not call a model or
require the dsh CLI or a running dsh host. Run `pnpm test` to verify the
workspace from source.

To view the same scenario as a read-only HTML timeline, run after building:

```sh
node examples/synthetic-demo/dist/index.js --html > observer.html
```

Open `observer.html` in a browser. The export is a static demonstration, not a
server or a native dsh tab. Review the [Observer notes](../apps/observer/README.md)
before handling real history.

- **Integrate with dsh:** follow the [dsh Quick Start](../examples/dsh-quickstart/README.md)
  for version, local root setup, explicit Binding, history, and shutdown.
- **Write an adapter:** start with the [Adapter Authoring Guide](adapter-authoring.md).
- **Troubleshoot:** if the demo cannot find `dist`, run `pnpm build` from the
  repository root. Use [Support](../SUPPORT.md) for reproducible problems.
