# Composition scope review — 2026-10-06

Status: reviewed and verified; publication as a Composition commit and PR was authorized by the user on 2026-10-06. Branch `feat/composition-scope-review` at `21946babfe404036d28041d59121b2ac2ff6c6dd`, current `origin/master` at the time of preflight (`0 0` ahead/behind). Worktree: `C:\Code\LedMap-composition-review`. Source WIP in `C:\Code\LedMap` was read and copied, not edited or cleared.

## Scope retained

43 source, test and specification files from the existing WIP were selected (28 modified, 15 new), covering:

- Composition Screen drawing, Canvas parity, Clean View, Test and Live Output through one chart frame;
- Screen authoring, transient preview, atomic Create and local presets;
- Cabinet display labels separate from physical IDs and signal order;
- PNG and SVG drawing/mask export, including a generic export-file extension boundary;
- versioned chart settings in `.ledmap` extensions with Save/Open, Undo/Redo and recovery;
- pure `selectCompositionGeometry` used by Composition read paths, without changing the project schema.

The selection follows `docs/specs/LEDMAP-COMPOSITION-CHART-001.md`, `LEDMAP-COMPOSITION-PIXL-001.md` and `LEDMAP-CABINET-LABELS-001.md`, which record prior user approvals. Additional review edits correct the README architecture link, tighten export and PNG logo validation, and make the Electron export smoke wait reliable. Details are recorded below.

## Scope held outside this worktree

- `data-planning-panel.ts`, `data-planning.ts` and new capacity/wiring/diagnostics/power/catalog/history/coordinate modules and tests: their project integration and product semantics need separate contracts.
- `resolume-native.ts`, `core/resolume`, its tests and the `Export native Resolume XML` button: no target-generated Arena fixture verifies the claimed native format. The existing LedMAP-specific slice XML export from `origin/master` remains available and is documented as unverified for native Resolume/Hippo import.
- Third-party notices/audit drafts and the broad upstream integration report: review their provenance in a separate license/security stage.
- The unrelated `hardware-workspace.ts` planning-panel change and `data-planning.test.ts`.

The mixed `export-workspace.ts` was copied and its new native Resolume import, function and button were removed in this isolated worktree. No original WIP file was deleted or reset.

## Verification

| Check | Result |
|---|---|
| `npm.cmd ci` | passed; existing lockfile still reports one high dev dependency advisory |
| `npm.cmd test` | 106 files, 1646 tests passed after review fixes |
| `npm.cmd run typecheck` | passed, both workspaces |
| `npm.cmd run lint` | passed |
| `npm.cmd run build` | passed |
| `npm.cmd run test:smoke` | passed in Electron, including pixel-exact PNG and deterministic exports |
| `git diff --check` | passed |

No package dependency or `.ledmap` schema was changed. The desktop smoke covers the Composition flow but is not a full manual UX review. The transitive `source-map-js@1.2.1` advisory and real-format Resolume validation remain separate P0 work.

The full Composition UI diff was reviewed against the three approved specifications. The review traced Create preview and atomic commit through Undo/Redo, Save/Open and recovery; per-Screen drawing to Composition, Test, Live Output and PNG/SVG; Cabinet label editing, duplicate checks and resize; and the export file boundary. The Electron smoke covers creation, pixel colors, drawing controls, custom labels, SVG/XML escaping, PNG masks and document persistence.

The review found and fixed three export preflight defects in `png-export.ts` and `chart-settings.ts`: Current scope with Composition bypassed fixed-frame clipping, an oversized saved Screen logo could pass individual drawing export after a Screen shrank, and a mask could be blocked by a logo it does not draw. It also tightened chart logo validation to reject malformed PNG headers, excessive decoded size and dimensions that disagree with the saved metadata. Focused unit tests cover these paths. No change was made to the source WIP.

The first post-review Electron smoke run timed out in `runExport` while waiting to observe the brief disabled state of an export button. The helper now records that state transition with `MutationObserver`, so fast exports cannot evade the wait. The rerun passed.

Remaining limitations: desktop smoke is not a complete manual usability review; chart extension validation checks PNG signature and header metadata but does not fully decode its image data on Open; SVG uses the same scene primitives as PNG, but exact raster parity varies with the consumer's font and SVG renderer. These are review findings, not claims of native third-party format compatibility.

## Next integration gate

The user instructed continuation of the proposed commit and PR step on 2026-10-06. Publish this reviewed scope as one short PR targeting `master`, verify CI and retain the source WIP for future stages. Merge remains a separate repository action.
