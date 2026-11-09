# ACMI Observer

The standalone Observer is a **read-only** HTML snapshot of an authorized
timeline. It shows Task UUIDs, Session groups, Session-local binding revisions,
source cuts and positions, unresolved entries, and proved causal references.
It contains no JavaScript, controls, network resources, or Registry/Binding
write surface. It is not a native `dsh-context` tab.

After `pnpm build` at the repository root:

```sh
node examples/synthetic-demo/dist/index.js --html > observer.html
```

Open `observer.html` in a browser. The snapshot contains only deterministic
synthetic metadata and needs no server.

For host integration, call `renderObserver({ authority, scope, workspaceId,
readTimeline })` from `@acmi/observer`. Derive both scope and Workspace identity
on the trusted host, never from browser-supplied workspace IDs or paths. The
callback must read a Workspace-filtered timeline from the authorized query
service, return bounded normalized `ObserverEntry` metadata, and attach causal
references only when proved. The renderer checks the grant before the callback
and again before returning markup. It does not authorize each source query on
the host's behalf. A saved HTML file has no live authorization or revocation;
do not publish real history exports.
