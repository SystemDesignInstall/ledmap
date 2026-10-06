# P1-1 — Resolume import inspection, binding and preview

Status: implementation authorized by the user's instruction to execute the enumerated steps in order on 2026-10-06. Baseline: `e25e5cc753a65267e3c009abc90f855495bc1a6b`, merged P0-3 PR #18. Mandatory preflight passed in dedicated worktree `.worktrees/resolume-import-ui`, branch `feat/resolume-import-ui`. This specification is recorded before production changes.

## Operator flow

Add Import Arena XML in Output Mapping. A modal opens with a local XML file input; read only the selected File, at most 2 MiB, using strict UTF-8 decoding. No new IPC, filesystem path, network or dependency. Cancel/Escape close without project/history changes; a late file read cannot replace a newer selection or reopen a dismissed dialog.

Inspection shows filename, declared source version/Composition dimensions, output devices/raster sizes, enabled slices, original ordered corner values and source diagnostics. Unknown raster sizes require explicit width/height fields. Unsupported masks, transforms, warps, SoftEdging and unknown semantics remain visible and block application. At most 250 screen/slice items are rendered; larger documents are diagnosed and cannot be applied.

Every slice has a blank initial binding to an existing LedMAP Screen. Never guess bindings from names or geometry. Show editable Composition frame origin X/Y and width/height; initialize them explicitly from the current Composition chart frame, label their source and allow the operator to select/reset that frame. The chosen frame represents the Composition raster used by the imported XML; its dimensions must match the source document. The P0-3 adapter validates safe integer edges, placements, 1:1 pixel scale and whole-frame bounds.

Preview is a separate explicit action. Before a successful preview, Apply is disabled. Show read-only Composition input quads over project Screen placements and selected output quads/control lattice; original unsupported points remain visible. Keep preview canvas buffers bounded (720×240 per space), with a raster/output selector for multi-output sources. This is geometry inspection, not a decoded video or Arena render. Preview summary lists added Media Outputs/slices, source rectangles and resolved Screen-local crops.

The project is unchanged during file selection, inspection, binding, dimension edits and preview. Any edit invalidates the prepared proposal and disables Apply. Prepare against documentId/revision; a project change, Undo/Redo or document replacement invalidates the proposal. Apply rechecks the stamp, recomputes the canonical P0-3 import and confirms the resulting output intent matches the reviewed proposal. Exactly one `transactV2` appends Media Outputs/Output Mappings, then closes the modal. Rejection is atomic, leaves the original project/history unchanged and retains inspection so the operator can correct input.

## Architecture and compatibility

Use existing `parseResolumeAdvancedOutput` and `applyResolumeOutputImport` app adapters. Core remains pure and dependency-free; Mapping Regions, Cabinet/Module identity, Hardware topology and signal order are never inferred or changed. App owns a small preview/session coordinator, DOM/file handling and Canvas drawing. No .ledmap schema change or persistence of source XML, bindings, preview/session state or derived geometry. Existing v3–v5 serialization and output editing/export remain compatible. No new external source transfer; tests reuse the already audited fixtures with retained notices.

Load the dialog/controller and XML parser dynamically on first import-open. Invalidate an outstanding open request if the workspace is left before module loading completes. Draw the lattice in linear time in the number of controls and keep Canvas positioning local to the dialog, independent of global editor Canvas styles.

The user explicitly instructed **not to perform live Arena verification**. Preserve the unverified-Arena compatibility label. Reading known fixtures and geometry previews do not attest that a generated file loads in Arena. P1-1 closes only this narrow import UI stage, not the complete P1 product roadmap.

## Acceptance and verification

- Real selected-file flow, initial blank bindings, explicit unknown-raster dimensions and corrected bindings.
- Invalid UTF-8, oversized/malformed XML and unsupported warp/effects blocked without project/history changes.
- Cancel/Escape, replacement/late file selection, setting edits and stale document proposals cannot apply old data.
- Successful preview has exact Composition-to-Screen crop translation and original quads/control points, with bounded buffers.
- Apply adds output intent only, one history entry, Undo/Redo and save/reopen preserve it.
- Unit tests of the coordinator cover fresh/stale/tampered proposals and atomic failure; Electron smoke uses the actual file input and buttons.
- Full tests, typecheck, lint, production build, licenses, audit and Electron smoke pass. Visually inspect ready/blocked screenshots. Record production bundle-size delta and fixture-scale informational preview/apply timings with environment and scope.

Rollback: revert the P1-1 feature commit and rebuild. No dependency or project migration is involved; previously imported output intent remains ordinary project data.
