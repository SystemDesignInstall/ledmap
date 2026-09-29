# LEDMAP-EDITABLE-PROJECT-001 — Phase 8 P0A Editable Project Source Model

**Version:** 1.0 draft implementation contract
**Scope:** canonical editor source-of-truth for multi-screen and incomplete projects.

## 1. Problem

Accepted `.ledmap` schema v1 intentionally stores one complete InputCanvas/Screen/Grid/Region profile with explicit HardwareTopology. Successful `serializeProject()` and `loadProject()` require semantic validity. The Phase 8 desktop editor already has a multi-screen Project Canvas and must preserve work before Mapping Region or hardware assignment are complete.

The editor therefore must not make `ValidateProjectInput` its source-of-truth and must not hide extra project configuration inside root `extensions`.

## 2. Source-of-truth

P0A introduces `EditableProject` in pure `@ledmap/core`.

```text
EditableProject
  ├── inputCanvas?                  0..1
  ├── screens[]                     0..N
  ├── cabinetGrids[]                0..N
  ├── mappingRegions[]              0..N
  ├── hardwareTopology
  │   ├── cabinets[] / modules[]    may exist before hardware assignment
  │   └── processor/port/receiver   may be empty while editing
  ├── rules[]
  └── editorLayout.screenPositions[]
```

Existing domain entities are reused. P0A does not introduce parallel Screen, Grid, Cabinet, Module, Processor, Port or Receiver DTOs.

Derived data is not part of the source model: cabinet/module/pixel logical indexes, signal path, PixelMap, Remap output, capacity usage, validation reports and reverse indexes remain engine results.

## 3. Partial state

Partial means a workflow stage may be absent while existing objects remain internally coherent.

Allowed examples:

- empty project;
- Screen + CabinetGrid before MappingRegion exists;
- Cabinets and Modules before Receiver assignment exists;
- Processor and Port before receiver order is complete;
- project with multiple Screens at signed composition coordinates.

Integrity diagnostics reject corrupted source relationships such as unknown references, parent mismatches, duplicate physical cells, contradictory module placement, duplicate project placement and one Cabinet assigned to more than one Receiver.

Missing Mapping or hardware assignment is not itself an integrity error. Completeness for Mapping/Hardware/Remap is evaluated later by engine projection and validation.

## 4. Composition coordinates

Project composition placement is separate from `MappingRegion.position` and Cabinet physical `origin`.

```ts
interface EditorPoint {
  readonly x: number
  readonly y: number
}

interface ScreenPlacement {
  readonly screen: ScreenId
  readonly position: EditorPoint
}
```

`EditorPoint` accepts signed safe integers so the Project Canvas can place Screens at negative coordinates. Existing non-negative domain Point/PixelCoordinate semantics are unchanged.

Exactly one committed ScreenPlacement is required for each Screen. Camera, selection and transient pointer gestures remain app session state and are not added to `EditableProject`.

## 5. Integrity boundary

`inspectEditableProject(project)` is a pure errors-only source-integrity check.

It checks:

- duplicate entity IDs inside each entity namespace;
- Screen ↔ CabinetGrid and Screen ↔ MappingRegion references in both directions;
- Cabinet → Grid, Module → Cabinet, Port → Processor and Receiver → Port/Processor references;
- safe integer geometry needed to keep committed editor source representable;
- Cabinet/Grid and Module/Cabinet cell bounds and duplicate cells;
- Module local position and tiling invariants already defined by the domain model;
- duplicate assignments/orders that would make one source relationship ambiguous;
- exactly one signed Screen placement per Screen.

It intentionally does not require:

- a MappingRegion for every Screen;
- complete Cabinet assignment to Receivers;
- complete processorOrder/receiverOrder;
- Mapping semantic validity such as source rectangle bounds;
- capacity success;
- successful Remap.

Those belong to P0B projection and the existing engines.

## 6. v1 bridge

`editableProjectFromValidatedProject()` detaches a single-profile `ValidateProjectInput` into immutable editor source and creates one Screen placement at `(0, 0)` by default. A signed placement may be supplied by the caller.

The bridge copies nested arrays/records and freezes the result so later caller mutation cannot change editor state.

The bridge is the P0A building block for P0C migration:

```text
schema v1
  → existing strict v1 load/validation
  → editableProjectFromValidatedProject()
  → EditableProject
```

Schema v1 itself is not modified by P0A.

## 7. Next gates

P0B projects one ready MappingRegion from `EditableProject` into the existing `ValidateProjectInput`/Mapping pipeline without changing engine mathematics.

P0C introduces editable serialization v2 and v1 migration. v2 may persist incomplete projects; root extensions remain opaque metadata rather than a configuration escape hatch.

P0D replaces the current renderer demo authority with `EditableProject`; `ScreenView` may survive only as a derived presentation snapshot.

## 8. P0A acceptance

- Empty editable project is valid editor source.
- Multiple Screens and signed layout coordinates are representable.
- Screen/Grid source is valid before Mapping or hardware assignment exists.
- Broken references and ambiguous primary assignments are diagnosed.
- Existing valid v1 runtime source can be detached into immutable editor source.
- No accepted Cabinet/Hardware/Mapping/Remap algorithm changes.
- No Electron, fs, DOM or app dependency is introduced into core.
