# Phase 0.9.19 complete evidence snapshot - 2026-11-16

This research-branch archive preserves all 52,136 regular files beneath
`E:/codex-prj/ACMI/verification/phase-0.9.19` at packaging time: 2,189,583,192
original bytes, compressed to 326,301,166 bytes. It includes Gate 1, Gate 2,
live runs, frozen datasets/prompts/oracles/plans, source snapshots, failed runs,
static reviews and previous main-integration logs. No research was rerun.

The archive is intentionally not merged into main. Engineering proposals and
unclosed qualifications are retained for provenance, not activated as contracts.
P-G FAIL, live 1 MiB and all original results/gates remain unchanged.

## Contents and integrity

- `manifest.json`: every original regular-file path, byte length, SHA-256 and
  archive location; original directories and all 87 junctions with their targets.
- `verification.json`: full decompressed entry verification and packaging notes.
- `gate-1.zip`, `main-sync-20261115.zip`, `main-sync-workers4-20261115.zip`:
  directly readable ZIP archives.
- `gate-2.zip.part001` through `gate-2.zip.part007`: consecutive binary slices of
  a single ZIP, each at most 48 MiB. Concatenate in numeric order before reading.
  The manifest records each part and reconstructed ZIP hash. These are ordinary
  Git blobs, not LFS pointers or links to files that exist only on one machine.

All 52,136 ZIP entries were decompressed and checked against their source-file
hashes. The reconstructed Gate 2 ZIP hash was also checked after splitting.
Original evidence was neither edited nor deleted. Junctions are preserved as
metadata, not followed: their targets are not duplicated or used to escape the
snapshot root. Directory metadata is provided separately, including empty
directories. This is a content/provenance archive, not a full NTFS disk image.

## Safe restoration

Use a new destination, never the active/original evidence directory. Concatenate
the seven Gate 2 parts byte-for-byte to a new `gate-2.zip`; verify its SHA-256
against `manifest.json`, then extract the four ZIPs to that destination. Each
entry already contains its top-level directory (`gate-1/`, `gate-2/`, etc.).
Verify every extracted regular file using the manifest before analysis.

Do not automatically recreate junctions or execute archived scripts. Historical
absolute paths and pins remain unchanged, so relocation alone does not make old
execution commands safe or authorized. Analysis must resolve paths explicitly;
restoration is not permission to rescore, refreeze, rerun models or retry calls.

## Public-repository review

Known credential/private-key signature scans found no strong secret matches.
All 145 `credentials.yml` files matched the exact synthetic fixture payloads in
the existing DSH tests. Other credential-value pattern hits were owner approval
labels and `SYNTHETIC_CREDENTIAL`. Original file bytes are preserved, not redacted.
This is a bounded scan and source-based fixture check, not a universal guarantee
that every possible secret format is detectable.

The packaging metadata initially failed to serialize because a PowerShell
boolean lacked its `$` prefix. Full ZIP verification was repeated successfully;
the failure is recorded in `verification.json`. This was packaging work, not a
model request, evaluator execution or research retry.
