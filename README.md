# ACMI

[简体中文](README.zh-CN.md)

ACMI (Agent Context & Memory Infrastructure) gives agent runtimes a way to
identify work across sessions. A Task keeps the same UUID as a session switches
tasks or a later session resumes it. ACMI records explicit bindings and serves
read-only history with provenance. It is not an agent harness, an automatic
task recognizer, or a long-term memory engine.

**Alpha:** run the deterministic Synthetic Demo without a running dsh host or credentials.
The first official integration is [DeepSeek Harness (dsh)](integrations/dsh/README.md),
targeting `0.2.2-rc.1`; see the [dsh Quick Start](examples/dsh-quickstart/README.md)
for setup and compatibility. To connect another runtime, start with the
[Adapter Authoring Guide](docs/adapter-authoring.md) and the
[custom adapter example](examples/custom-agent-adapter/README.md).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

The demo shows Task switching and resumption, a causal Tool Call/Result pair,
an unresolved event, and read-only cross-session history. Use the
[Getting Started guide](docs/getting-started.md) to open the Observer timeline.

**Safety:** automatic persistent Binding is disabled; attribution heuristics
are offline research only. dsh history requires a trusted local host and an
isolated Storage Root for one Workspace. Windows hostile filesystem races,
multi-tenant service, and the Claude Code and Codex adapters are not supported.
See [Security](SECURITY.md) and [Security Limitations](docs/security-limitations.md).

## Workspace

| Area | Responsibility |
| --- | --- |
| [`@acmi/contracts`](packages/contracts/README.md) | Task, Session, Binding, provenance, and adapter contracts |
| [`@acmi/core`](packages/core/README.md) | Runtime-neutral Task identity, explicit Binding, attribution, and read-only history |
| [`@acmi/sdk`](packages/sdk/README.md) | Adapter-facing validation and capability negotiation |
| [`@acmi/conformance`](packages/conformance/README.md) | Fixture-based adapter conformance checks |
| [dsh integration](integrations/dsh/README.md) | dsh Plugin, Harness Adapter, and Storage Adapter |
| [Observer](apps/observer/README.md) | Read-only companion view, not a native dsh-context tab |

The workspace pins Node and pnpm in [`package.json`](package.json). Run
`pnpm test` for the test suite. See [Architecture](docs/architecture.md),
[Roadmap](ROADMAP.md), [Alpha release notes](docs/releases/v0.1.0-alpha.1.md),
[Contributing](CONTRIBUTING.md), and [Support](SUPPORT.md).

ACMI-original material is [MIT licensed](LICENSE). See
[Third-party Notices](THIRD_PARTY_NOTICES.md) and
[Source Provenance](docs/source-provenance.md) for exceptions and upstream reuse.
