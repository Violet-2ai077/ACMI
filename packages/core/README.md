# @acmi/core

Pure deterministic attribution and continuity over normalized, already authorized events. Accept a single Workspace inventory and one cut per Session, with increasing local sequence. Only an explicit Binding changes state. A late Tool Result follows its proved original Call; ambiguous events remain unresolved. The Core exposes no I/O and no write methods. The caller must establish scope before feeding it a snapshot.

`pnpm --filter @acmi/core... build` builds contracts and Core; `pnpm test` includes the projection and guard tests.
