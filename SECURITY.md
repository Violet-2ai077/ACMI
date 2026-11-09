# Security policy

## Supported use

ACMI Alpha is for trusted local development on a host you control. Use a fresh,
exclusive Storage Root for a single dsh Workspace. Do not aim the reader at a
personal, shared, legacy, migrated, or attacker-writable session store. Storage
Root v2 validates scope under these assumptions; it is not a tenant security
boundary and does not migrate old data. Windows hostile filesystem races are
not ruled out. See [Security Limitations](docs/security-limitations.md).

Explicit Task Binding is a trusted operation. Automatic persistent Binding is
disabled. Observer is a read-only companion; it does not authorize writes or
serve as a production access-control system. Do not expose it as a public or
multi-user service. Treat any exported history or rendered HTML as sensitive
even when raw event payloads are omitted.

## Reporting a vulnerability

Do not post exploit details, tokens, or real session data in public issues. No
public security email or verified private reporting channel is documented for
this candidate. If you already have a private channel to a maintainer, use it.
Otherwise request private follow-up through [project support](SUPPORT.md),
without including the vulnerability details. Share a minimal synthetic
reproduction and the ACMI, dsh, Node, and OS versions once a private route is
established.

## Dependency baseline

The workspace locks Vitest 4.1.12 and Zod 4.6.6, with an explicit override for
older transitive Zod. This addresses the advisories found during Alpha
preparation; it does not update or attest dependencies of a separately
installed dsh instance. CI checks the registry audit and reruns the complete
fixture suite. Report newly discovered dependency issues through the same
process above.
