# Security limitations

| Boundary | Alpha behavior |
| --- | --- |
| Host and storage | Only use a trusted local host and an isolated, explicitly initialized Storage Root for one Workspace. Do not grant other users or untrusted processes write access. |
| Compressed data | dsh v4 Zstandard history is conditional on the pinned runtime, supported Node environment, and isolated root. Do not use the reader as a decoder for arbitrary uploaded files. |
| Legacy data | Storage Root v2 is not a migration tool. Do not add a marker to a legacy or shared root to bypass admission checks. |
| Filesystem races | File and scope checks do not guarantee resistance to hostile Windows reparse-point or rename races. Do not run with a hostile local writer. |
| Binding | Only explicit trusted Binding is supported. Proposals and offline heuristic output must not persist Binding. Unsupported or ambiguous input must stay unresolved. |
| Observer | Read-only view built from a host-derived scope. It does not write Task Registry, Binding, or Attribution Revision, and is not a native dsh-context tab. It omits raw payloads by default, but displayed metadata and exported HTML can still identify work. |
| Exposure | No production multi-tenancy, remote access-control service, or isolation between mutually untrusted local principals is claimed. |

Keep all reproduction data synthetic when reporting a bug. Follow the
[security policy](../SECURITY.md) for private reporting guidance.
## Phase 0.8.2 experimental controls

The Host snapshot guard quarantines covered ordinary and Compact adapter
requests; it does not erase native history, control third-party routes,
cancel in-flight requests, or recall disclosed data. Do not mount legacy
unguarded recovery in a production Host. Keep writer and policy authority
out of model tools. See the [retirement runbook](runbooks/phase-0.8.2-snapshot-revocation.md).
