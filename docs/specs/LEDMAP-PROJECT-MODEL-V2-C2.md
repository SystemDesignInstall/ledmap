# Project Model v2 convergence: C2 read parity

C2 adds pure selectors over `LedMapProjectV2` and a detached, frozen compatibility read model for current `EditableProject` and `ScreenView` consumers. The renderer does not import or use the new read model in its document flow. `EditableProject` remains the running document owner; `ProjectSession`, mutations, Save/Open, the existing `schemaVersion: 2` writer, and all production engines are unchanged.

## Source of truth and projection rules

| Question | Canonical source | Read projection |
| --- | --- | --- |
| Screen order, Grids and Regions | `design.screens`, each Screen's explicit Grid and Region order | Screen selectors retain explicit order. Cabinet lookup is physical row/column order. |
| Composition position | `design.composition.placements` | ScreenView `x`/`y` are derived. |
| Cabinet membership | `hardware.assignments` | Legacy `Receiver.cabinets` is reconstructed, never stored in V2. |
| Receiver order on Port | `hardware.receiverOrder[].receiverIds` | `legacyIndex` is copied for compatibility and has no signal-order role. |
| Cabinet signal order | `operations.signalRoutes[].orderedCabinetIds` | The reconstructed Receiver list follows the route, not assignment array order. |
| Mapping and Hardware readiness | V2 contract plus existing deterministic engines | Read-only projections return the same ready/incomplete result and diagnostics for representable projects. |

The compatibility projection rejects V2 features that the current editor cannot represent (multiple Input Canvases, Stage, Media Output, Output Mapping, Backup Route, Live Output Target). It also rejects assignment/route and reference-order violations. It never silently drops those values. Its output is disposable and deeply frozen; creating it does not change the V2 project.

## Validation comparison

| Old validation | V2 validation | Result |
| --- | --- | --- |
| `EDITOR_DUPLICATE_ID` | `PROJECT_DUPLICATE_ID` | Stricter |
| `EDITOR_UNKNOWN_REFERENCE` (Grid order) | `PROJECT_GRID_ORDER_PARENT_MISMATCH` | Stricter |
| `EDITOR_PARENT_MISMATCH` (Grid parent) | `PROJECT_GRID_ORDER_PARENT_MISMATCH` | Stricter |
| `EDITOR_DUPLICATE_REFERENCE` (Grid order) | `PROJECT_DUPLICATE_GRID_ORDER` | Stricter |
| `EDITOR_INVALID_NUMBER` | `EDITOR_INVALID_NUMBER` | Same |
| `EDITOR_OUT_OF_RANGE` | `EDITOR_OUT_OF_RANGE` | Same |
| `EDITOR_DUPLICATE_CELL` | `EDITOR_DUPLICATE_CELL` | Same |
| `EDITOR_DUPLICATE_PLACEMENT` | `EDITOR_DUPLICATE_PLACEMENT` | Same |
| `EDITOR_MISSING_PLACEMENT` | `EDITOR_MISSING_PLACEMENT` | Same |

The first four cases use a stricter V2 contract code; the other five retain the current editor diagnostic. Every case blocks in both models. V2 hardware ownership and route violations also block before legacy projection; the selector and readiness tests cover assignment/route mismatch.

## Parity gates

- REF-001: 196,608 port-local addresses compared old versus V2, including global index, reverse lookup, forward round-trip, complete coverage, and unique Cabinet coordinates. Geometry and full mapped PixelAddress are compared at Receiver, Port, Module, and Screen boundaries.
- Mapping: normal and offset REF-001, multiple Screens, multiple Regions on one Screen, and coordinate edges.
- Hardware: multiple Processors and Ports, several Receivers on one Port with reversed Receiver order, reversed Cabinet route, `legacyIndex` distinct from chain position, locked assignments, assignment membership, and partial readiness.
- Layout and Test: three-screen ScreenView plus resize/placement and a fully configured two-screen Test scene and all eight Address Walk pixels.
- Export: JSON and CSV are byte identical in unit tests. PNG plans and primitives are equal for the available Test patterns. After `npm run build`, `node packages/app/test/v2-png-parity.mjs` bundles a test-only probe into the built Electron renderer, renders six patterns through the production PNG function, and compares encoded bytes, dimensions, decoded RGBA pixels, and repeated renders. It deletes its temporary bundle after the probe.
- Product smoke: `npm run test:smoke` exercises New, Layout, Mapping, Hardware, Save, reopen, Test, Live Output, and Export against the built app.

The app's production renderer bundle and existing `.ledmap` v2 serialization are checked against the C1 baseline. No C3 document ownership or persisted-format migration begins in C2.
