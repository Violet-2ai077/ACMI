# ACMI

![ACMI wordmark with branching paths of different lengths](docs/assets/acmi-banner.png)

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

## Quick start

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

The demo shows Task switching and resumption, a causal Tool Call/Result pair,
an unresolved event, and read-only cross-session history. Use the
[Getting Started guide](docs/getting-started.md) to open the Observer timeline.

## Architecture

![ACMI data flow: the dsh integration and Synthetic Demo supply normalized events; Core combines them with explicit Task Binding and exposes scoped history to the read-only Observer](docs/assets/acmi-architecture.png)

The diagram shows data flow, not package dependencies. Core is independent of
dsh and keeps ambiguous events unresolved rather than guessing their Task.
See the [architecture guide](docs/architecture.md) for the component boundaries.

## What the Alpha tests verify

Release baseline: [v0.1.0-alpha.1](https://github.com/Violet-2ai077/ACMI/releases/tag/v0.1.0-alpha.1)
(`0531dbf`).

| Check | Verified result |
| --- | --- |
| [GitHub Actions run](https://github.com/Violet-2ai077/ACMI/actions/runs/42630365718) | Windows and Ubuntu jobs passed, including frozen dependency installation, dependency audit, and `pnpm check`. |
| Independent clean clones | **28/28 tests passed on each** of Windows x64 and Ubuntu 24.04 (WSL), across 9 test files. Both runs built the workspace and ran the Synthetic Demo, custom adapter, and dsh Quick Start. |
| [dsh integration tests](integrations/dsh/tests/dsh.test.ts) | With dsh `0.2.2-rc.1`, the dedicated v4 journal fixture passed [Level 4 conformance](packages/conformance/README.md): an independently reopened adapter recovered Task history across two Sessions. Reads left both plaintext and Zstandard journal files byte-for-byte unchanged in their respective fixtures. |
| [Observer HTTP test](examples/dsh-quickstart/tests/observer-http.test.mjs) | The local synthetic Observer served its read-only timeline and rejected write requests. |

To reproduce the build, tests, and demos, install the pinned versions from
[`package.json`](package.json), run `pnpm install --frozen-lockfile`, then run
`pnpm check`. These are controlled fixture and integration checks; they do not
validate live model traffic or establish production security guarantees.

**Safety:** automatic persistent Binding is disabled; attribution heuristics
are offline research only. dsh history requires a trusted local host and an
isolated Storage Root for one Workspace. Windows hostile filesystem races,
multi-tenant service, and the Claude Code and Codex adapters are not supported.
See [Security](SECURITY.md) and [Security Limitations](docs/security-limitations.md).

## Workspace

Phase 0.8 experiments are separate from the published Alpha baseline. After
building, run `node scripts/phase-0.8/benchmark.mjs <output-directory>` for
the deterministic Task Graph and recovery benchmark. See the
[Phase 0.8 report](docs/experiments/phase-0.8-final-report.md) for results and limits.

Phase 0.9 adds an isolated, default-off Task Understanding experiment:
bounded persisted deltas, five intent classes, graph proposal diffs and explicit
transactional Host review. The 350-case benchmark uses only synthetic evidence
and scripted mocks. See the [Phase 0.9 report](docs/experiments/phase-0.9-final-report.md).
It does not bind Tasks, accept Subagent results or satisfy joins automatically.

| Area | Responsibility |
| --- | --- |
| [`@acmi/contracts`](packages/contracts/README.md) | Task, Session, Binding, provenance, and adapter contracts |
| [`@acmi/core`](packages/core/README.md) | Runtime-neutral Task identity, explicit Binding, attribution, and read-only history |
| [`@acmi/sdk`](packages/sdk/README.md) | Adapter-facing validation and capability negotiation |
| [`@acmi/conformance`](packages/conformance/README.md) | Fixture-based adapter conformance checks |
| [dsh integration](integrations/dsh/README.md) | dsh Plugin, Harness Adapter, and Storage Adapter |
| [Observer](apps/observer/README.md) | Read-only companion view, not a native dsh-context tab |

See [Roadmap](ROADMAP.md), [Alpha release notes](docs/releases/v0.1.0-alpha.1.md),
[Contributing](CONTRIBUTING.md), and [Support](SUPPORT.md).

ACMI-original material is [MIT licensed](LICENSE). See
[Third-party Notices](THIRD_PARTY_NOTICES.md) and
[Source Provenance](docs/source-provenance.md) for exceptions and upstream reuse.
