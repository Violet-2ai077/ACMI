# Workspace and branch organization

## One stable main checkout

Use `E:/codex-prj/ACMI/acmi` for `main`. This directory also owns the common
`.git` database: do not move it or delete it while linked worktrees exist.
Open this directory as the default project in the editor or Codex. It shows
merged code, not unfinished feature work.

Implement a feature in its own worktree. The explicit continuation work uses
`E:/codex-prj/ACMI/acmi-phase-0.9.17` on `acmi/phase-0.9.17`. Do not switch the
main checkout to that branch or copy feature files over main to synchronize it.
Changes reach main only through an explicitly approved merge or pull request.
The initial main relocation did not merge, push, publish, or advance main.

## Local directories

| Directory | Role |
| --- | --- |
| `acmi/` | Stable main checkout and common Git database |
| `acmi-phase-0.9.17/` | Existing active feature worktree |
| `acmi-phase-0.8.2/`, older `acmi-phase-*` worktrees | Historical checkouts; not active development targets |
| `worktrees/` | Suggested location for future short-lived feature worktrees |
| `deliverables/` | Existing packaged delivery artifacts |
| Existing `*-evidence`, `*-run`, `*-verification`, `*-internal-custody` | Historical experiment artifacts; preserve paths and access boundaries |
| `deepseek-harness/` | Separate upstream source; not an ACMI worktree |

`acmi-main/` was renamed to `acmi-phase-0.8.2/` when branch assignments were
corrected on 2026-11-13. Old reports keep their original historical paths;
do not rewrite frozen evidence just to match today's directory layout.
Not every sibling directory is a worktree. Use `git worktree list`, not a
filename pattern, to identify managed checkouts. Do not bulk-move or delete
experiment directories: reports, manifests, and local runtime settings can
contain path references and material excluded from Git.

## Routine workflow

Check location before editing:

```powershell
git -C E:/codex-prj/ACMI/acmi worktree list
git -C E:/codex-prj/ACMI/acmi-phase-0.9.17 status --short --branch
```

For a new, approved feature, use the desktop's native worktree workflow when
available. Otherwise a Git fallback is:

```powershell
git -C E:/codex-prj/ACMI/acmi worktree add -b codex/feature-name E:/codex-prj/ACMI/worktrees/feature-name main
```

Keep one worktree per active branch; preserve existing `acmi/phase-*` branch
names instead of renaming historical branches. Never check out `main` in a
second worktree using force or ignore-other-worktrees options.

After switching branches or relocating a worktree, reinstall the pinned
dependencies and rebuild. Generated `dist` and `node_modules` are not Git
snapshots and can be stale or contain old workspace links.

```powershell
pnpm install --offline --frozen-lockfile
pnpm check
```

If packages are not cached, use the normal frozen install with authorized
network access. Use Built dsh and offline Node regression suites separately
where required by the feature's plan; `pnpm check` does not run both of them.

## Retiring historical worktrees

Keep the branch or a deliberate archival tag; a worktree is a checkout, not
the only copy of committed history. Removing a worktree must be a separately
approved cleanup, not part of a feature implementation.

Before removal, verify all of the following for that exact directory:

1. It is listed by `git worktree list` and is not the primary `acmi` directory.
2. No active editor, shell, agent, server or experiment depends on it.
3. `git status --porcelain=v1 --untracked-files=all` is empty.
4. Inspect ignored files with `git ls-files --others --ignored --exclude-standard`;
   copy any unique evidence or local data to a reviewed archive first.
5. `git merge-base --is-ancestor <branch> main` exits zero, or unmerged work has
   been explicitly retained and reviewed. Verify a retained branch/tag exists.
6. Use `git worktree remove <exact-path>` without `--force`; stop if Git refuses.

Do not use recursive filesystem deletion, `git clean -fdx`, forced resets,
or bulk branch deletion as an organization shortcut. No historical worktree
was deleted during the main checkout correction.

## Project status versus research history

- README: supported entry points and honest capability boundaries.
- ROADMAP: active priorities and capabilities not yet qualified.
- CHANGELOG: user-visible changes; experimental results are not releases.
- `docs/experiments/`: immutable research reports and evidence indexes.
- `docs/runbooks/`: operations and development continuation checkpoints.
- `docs/superpowers/specs/`: approved feature designs and implementation plans.

Phase numbers describe development or research milestones, not package
versions. Do not infer production support from a later phase number or from
tests passing on a feature branch.
