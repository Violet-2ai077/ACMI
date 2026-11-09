# Contributing to ACMI

Use the Node version range and pnpm version specified by [`package.json`](package.json).
From a checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm demo
```

Keep public contract types in `packages/contracts` and runtime-independent
behavior in `packages/core`. The SDK validates adapter-facing inputs. Keep
dsh, Cordis, Node filesystem operations, and UI dependencies out of Core and
Contracts. Put dsh persistence and lifecycle details in `integrations/dsh`;
keep Observer read-only.

For an adapter, start with the [authoring guide](docs/adapter-authoring.md).
Declare only capabilities exposed by the tested runtime version. Include
deterministic conformance fixtures for any level claimed and verify failure
paths for capabilities that are not supported. Do not attach real session
transcripts or model prompts, even in test fixtures.

Open a pull request with a focused description, test commands and results,
compatibility impact, and any relevant issue. Update affected documentation and
examples alongside changes to public behavior, and add a changelog entry for
user-facing changes. Record the source, license, and modifications for copied or
adapted third-party material; do not add files of uncertain origin.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities via
[Security](SECURITY.md), not in a public pull request or issue.
