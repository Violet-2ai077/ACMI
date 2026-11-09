# Synthetic demo

From the repository root, run `pnpm install --frozen-lockfile`, `pnpm build`,
and `pnpm demo`. No dsh installation, credentials, running service, model
request, or real Session data is required.

Task A is created in a synthetic Task inventory and explicitly bound in
Session 1. The Session calls a tool, switches to Task B, then receives the
result. The result keeps Task A attribution through its proved original call
instead of inheriting the newer binding. An unproved result stays unresolved.
Session 2 explicitly resumes Task A, and the Task History shows both Sessions.

To open the same history in the read-only [Observer](../../apps/observer/):

```sh
node examples/synthetic-demo/dist/index.js --html > observer.html
```

Open the output file in a browser. It is self-contained and does not write to
the Task Registry, bindings, or attribution state.
