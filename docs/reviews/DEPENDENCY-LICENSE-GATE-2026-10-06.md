# Dependency and license gate — 2026-10-06

Stage P0-1 was authorized by the user's instruction to proceed after Composition review/merge and the proposed dependency/license stage. Composition [PR #15](https://github.com/SystemDesignInstall/ledmap/pull/15) merged as `d27cad89ef615b70022dc1a4ace30f3e4813c561` with green CI and no open review threads.

Worktree: `C:\Code\LedMap-dependency-license`. Branch: `feat/dependency-license-gate`. Mandatory preflight started from current `origin/master` at `d27cad8`, with a clean worktree and `0 0` ahead/behind. The original uncommitted worktree is retained.

## Changes

`source-map-js` is a development dependency through the Vite/PostCSS build chain. The baseline audit reported one high finding, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): malformed indexed source-map offsets can block the event loop. The advisory identifies 1.2.2 as patched.

`npm update source-map-js --package-lock-only --ignore-scripts` changed only the version, tarball URL and integrity of `node_modules/source-map-js`: 1.2.1 → 1.2.2. Package manifests, application/core source, project schema and hardware data are unchanged.

The [source audit](../licenses/external-source-audit.md) pins repository commits and file/blob SHAs for inspected licenses and relevant geometry/snapping/export references. [Third-party notices](../../THIRD_PARTY_NOTICES.md) link to the complete MIT notice. Planned imports in the original WIP remain pending provenance review; no copied B.L.I.N.K implementation or asset enters this stage.

## Verification

| Check | Result |
|---|---|
| Baseline `npm audit --json --package-lock-only` | 1 high, 1 total |
| Updated full lockfile audit | 0 vulnerabilities |
| `npm ci` | passed, 0 vulnerabilities |
| Installed `source-map-js` and production audit | 1.2.2 via Vite → PostCSS; 0 production vulnerabilities |
| `npm test` | 106 files, 1646 tests passed |
| `npm run typecheck` | passed, both workspaces |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run test:smoke` | passed in Electron with pixel-exact PNG and deterministic exports |
| `git diff --check` | passed |

The retained MIT notice hashes to upstream blob `2854af553a2f331bbb806636494ff4a5921db848`.

## Rollback and remaining work

Revert this stage's commit and run `npm ci` to restore the previous dependency tree. No project migration is required.

The source register is a scoped review, not an authorship attestation for all historical code or the held-out WIP. A root distribution license for LedMAP has not been selected. Native Resolume compatibility, manufacturer-specific capacity and project-bound wiring remain separate contracts.

The next implementation stage is P0-2: Cabinet IDs and real hardware assignments from the V2 project; separate unpatched and overloaded diagnoses; preserved manual assignments; one validation report and regression fixtures. Its candidate code remains outside this PR.
