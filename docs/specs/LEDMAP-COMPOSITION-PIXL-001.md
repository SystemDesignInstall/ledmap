# LEDMAP-COMPOSITION-PIXL-001 — Screen authoring inspired by pixl Grid

Status: **Accepted for implementation**. On 2026-10-05 the user explicitly authorized the complete work, delegated implementation decisions, and requested the most complete practical pixl Grid-style workflow. Screen resolution remains derived from Cabinet Grid geometry.

## Reference and boundaries

The [pixl Grid listing by Video Walrus](https://apps.apple.com/us/app/pixl-grid/id1445330973?mt=12) describes multiple grids on one canvas, palettes, masks, live output, offset markers, PNG, half-height tiles and export to Millumin, After Effects and Resolume. Its version history also identifies hidden tiles, half columns, saved palettes, LED Types and grid defaults. Exact import/export compatibility needs files produced by the target application.

In LedMAP, one user-facing screen composition consists of a domain **Screen**, its physical **Cabinet Grid**, a Composition placement and app-owned **Screen drawing** settings. Mapping Region is a separate Input→Output relationship. A visual mask never deletes a physical Cabinet. Cabinet Engine and Hardware Topology remain separate.

Composition owns authoring and the immediately visible drawing. Test owns playback and Live Output. Export owns files. All three consume the same saved drawing definition; controls that change a Screen live in Composition.

## Target workflow

1. **Create:** `+ Screen` opens a simple form with name, Cabinet Grid columns/rows, Cabinet pixel width/height, Auto/Manual position and initial pattern/color. Calculated Screen resolution is shown before creation. Advanced module fields remain available; in Basic mode one module per Cabinet maps the entered Cabinet size into valid model geometry.
2. **Preview:** valid draft changes show a temporary Screen on the Composition canvas, including its proposed position, color/pattern and dimensions. Closing the form discards the preview. No project, extension, history or recovery mutation occurs before Create.
3. **Commit:** Create publishes the Screen, grid, cabinets, modules, placement and drawing settings atomically. It selects the new Screen and makes it visible in the viewport. Auto placement is deterministic, uses the final Screen width, leaves a visible gap and does not overlap existing Screens.
4. **Edit:** selection in the list and on the canvas stays synchronized. Drag, numeric position, cabinet-grid resize, rename, duplicate and delete use the existing document commands. Duplication copies the Screen drawing. Right inspector changes immediately update that Screen on the central canvas. Clean View hides editor overlays; Test, Live Output and PNG use the saved drawing.
5. **Persist:** Undo/Redo treats Create as one operation. Save/Open and recovery restore Screen geometry, placement, drawing and identity. Rendering never persists derived Cabinet order or PixelMap.

## Planned stages

| Stage | Deliverable | Main boundary |
|---|---|---|
| 1 — Screen authoring | Simple/Advanced Create form, draft preview, automatic non-overlapping placement, atomic creation with drawing, list/canvas feedback | App UI and existing V2 commands; no new physical geometry |
| 2 — Drawing controls and presets | Full per-Screen palette controls, saved custom palettes, offset markers, statistics, local LED Type/default Screen presets | Presentation and validated preset data; no hardware routing |
| 3 — Irregular physical grids | Half-height/half-width edge Cabinets, side selection, physically absent Cabinet cells | New core geometry, Cabinet identity, mapping and hardware validation, serialization migration |
| 4 — Output parity | Canvas mask options, mask offset, moving Live Output cursors and keyboard color overrides | Shared TestFrame, Test/Live Output/PNG behavior |
| 5 — Interoperability | Millumin, After Effects and Resolume chart exports; optional pixl Grid project import | Target-generated fixtures and format contracts required before adapter code |

Each stage ends with tests, typecheck and lint. Stage 3 must distinguish a missing physical Cabinet from a visually transparent or masked Cabinet. External format adapters in Stage 5 require verified target-generated fixtures; supported native exports can proceed independently.

## Implementation status — 2026-10-05

| Stage | Status | Delivered |
|---|---|---|
| 1 | Complete | Basic/Advanced creation, calculated resolution, transient central-canvas preview, automatic placement, initial drawing, atomic Undo, screen selection and existing editing actions. |
| 2 | Partial | Existing per-Screen palettes, labels, logo and statistics; local reusable LED geometry/drawing presets; offset markers. Separate multi-swatch palettes and preset management beyond save/select/delete are not implemented. |
| 3 | Partial | Built-in half-height and half-width Cabinet formats create separate uniform Screens with real Cabinet dimensions. The current core Mapping Region requires a complete uniform Cabinet Grid; physical gaps and mixed half-size edge Cabinets within one Screen require a new geometry and mapping contract. Visual mask offsets do not change Cabinet membership. |
| 4 | Partial | Saved mask offsets share TestFrame across Test, Live Output, PNG and SVG; Address Walk can play at selectable speed and keyboard shortcuts 0–4 select solid Test colors. Arbitrary moving cursor paths are not implemented. |
| 5 | Partial | Drawing/mask PNG and SVG, Generic Mapping JSON/CSV, and existing LedMAP-specific output-slice XML/CSV. The latter are not verified native Resolume/Hippo import formats. Millumin and After Effects adapters, native Resolume import, and pixl Grid project import await target-generated fixtures and verified format contracts. |

## Stage 1 acceptance

1. From an empty project, create two Screens using only Basic fields. The form shows each calculated resolution. Automatic placement keeps the Screens separate, and both saved colors/patterns appear together on Composition.
2. Cancel leaves project revision, Undo stack and recovery state unchanged. An invalid field blocks the entire Create operation and leaves the project unchanged.
3. Create adds one Undo step. Undo removes the Screen and its drawing; Redo restores both. Save/Open and recovery retain both Screens and their distinct drawing settings.
4. Manual position and Advanced module geometry remain available. Selection, drag, resize, duplicate and delete retain their current behavior. Creating a Screen does not create or move a Mapping Region.
5. Test, Live Output and PNG render the same committed Screen drawing. Draft previews never reach these outputs.
6. Existing reference tests remain green. Run root tests, typecheck, lint, build and Electron smoke, including a pixel check for two distinct Screen colors.

## Preflight record

The mandatory Git preflight completed on 2026-10-05: `feat/composition-calculation` at `21946babfe404036d28041d59121b2ac2ff6c6dd` is at `origin/master` (`0 0` ahead/behind). Existing uncommitted Composition work is preserved. No commit is authorized.
