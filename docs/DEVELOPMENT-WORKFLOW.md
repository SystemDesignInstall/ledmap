# LedMAP Development Workflow

Canonical branch: **master**.

Canonical UI workspaces, in workflow order:

```text
Composition → Mapping → Output Mapping → Hardware → Test → Export
```

Global project actions (always available, owned by the App Shell, not by workspaces):

```text
New | Open | Undo | Redo | Save | Save As
```

## Rules

1. All new development begins from current `origin/master`.
2. Short feature branches only: branch → PR → `master`. No long-lived product lines.
3. One coding agent = one branch = one dedicated worktree. Two agents never edit one worktree.
4. No parallel development outside an approved integration task for: `index.html`, `index.ts`,
   `style.css`, `canvas.ts`, project model, workspace navigation, mapping, hardware, signal, tests.
5. Every stage ends with green tests plus `typecheck` + `lint`.
6. Reference Test Cases 001–004 are the acceptance criteria of the math core.

## Mandatory preflight

Before changing production code, every agent runs the preflight from `AGENTS.md`
(show-toplevel, branch, HEAD, status, fetch, merge-base against `origin/master`).
A branch that is behind or diverged from `origin/master` must stop, not code.

## CI stale-base protection (required repository settings)

GitHub branch protection for `master` must enforce:

- Require pull request before merging
- Require status checks to pass (typecheck, lint, unit tests, build, smoke)
- Require branch to be up to date before merging
- Block force pushes

These settings are applied in the repository hosting UI; this document records them
as mandatory so a missing protection is treated as a defect, not as an option.
