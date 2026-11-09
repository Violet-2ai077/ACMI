# Changelog

Dependency security baseline: Vitest 4.1.12 and Zod 4.6.6; older transitive
Zod is overridden in the workspace. No installed dsh dependency was changed.

## 0.1.0-alpha.1 (release candidate)

- Split the runtime-neutral Core and Contracts from dsh-specific integration.
- Added SDK capability negotiation, fixture conformance checks, and a custom
  adapter example that demonstrates honest partial support.
- Added a deterministic Synthetic Demo and read-only Observer companion.
- Targeted dsh `0.2.2-rc.1` for explicit binding, normalized events, and scoped
  history without patching upstream dsh.

Known limitations: automatic persistent Binding is disabled; the dsh scoped
reader assumes a trusted local host and an isolated single-Workspace root; no
legacy store migration, native dsh-context tab, or multi-tenant guarantees.
See [the Alpha release notes](docs/releases/v0.1.0-alpha.1.md).
