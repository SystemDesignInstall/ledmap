# LEDMAP-EDITABLE-SERIALIZATION-002 — Phase 8 P0C Editable Project Document v2

**Version:** 1.0 accepted implementation contract

## 1. Goal

Schema v2 is the persistent source document for the editor workflow. Unlike schema v1, it can represent an empty, partial or multi-screen project before Mapping or Hardware is complete.

```text
format: "ledmap"
schemaVersion: 2
```

## 2. Root document

The root field order is canonical:

```text
format
schemaVersion
project
extensions
```

`extensions` remains opaque JSON metadata. It is not a storage channel for editor source fields.

## 3. Project payload

The canonical v2 project field order is:

```text
inputCanvas
screens
cabinetGrids
mappingRegions
hardwareTopology
rules
editorLayout
```

`inputCanvas` is either an InputCanvas record or `null`. All collections are present as arrays, including when empty.

`hardwareTopology` retains the accepted source collections:

```text
processors
ports
receivers
cabinets
modules
processorOrder
receiverOrder
```

These collections may describe partial hardware. Existing references and assignments must be internally consistent, but completeness is not required.

`editorLayout.screenPositions` is first-class persisted project data. It contains exactly one signed safe-integer Composition position for every Screen. Negative X and Y are valid.

## 4. Incomplete versus corrupt

An incomplete project is valid v2 source and can be saved. Supported states include:

- an empty project;
- Screen/Grid layout without Cabinets;
- layout with Cabinets and Modules;
- Mapping without Processor, Port or Receiver;
- partial Hardware configuration;
- a complete project.

A corrupt project is rejected on save and load. `inspectEditableProject()` is the semantic integrity gate. Its diagnostics cover duplicate IDs, dangling references, parent mismatches, invalid source numbers, out-of-range cells, duplicate Cabinet or Module cells, duplicate placements and conflicting Cabinet assignments.

P0C does not require `validateProject().valid` for schema v2.

## 5. Stored source only

Schema v2 stores source configuration only. It does not store:

- Cabinet, Module or Pixel logical indexes;
- resolved geometry or PixelMap cells;
- signal paths or `dataIndex`;
- capacity usage or remaining capacity;
- allocation proposals;
- validation reports or diagnostics;
- reverse indexes or caches;
- selection, camera, hover or rendering state.

Module `localX` and `localY` remain derived from Module column, row and physical size and are reconstructed on load.

## 6. Additive editor API

The schema v1 API remains v1-only and unchanged:

```ts
parseProject()
loadProject()
serializeProject()
```

P0C adds:

```ts
parseEditableProjectDocument()
loadEditableProject()
serializeEditableProject()
```

`parseEditableProjectDocument()` accepts structurally valid schema v1 or v2 and returns a deeply immutable versioned document.

`loadEditableProject()` returns immutable `EditableProject`, root extensions, the source schema version and an empty integrity diagnostic list. It rejects corrupt v2 source with `SERIALIZATION_PROJECT_INVALID` and exposes the P0A integrity diagnostics on the error.

`serializeEditableProject()` always emits canonical schema v2.

## 7. V1 migration

The editor loader processes schema v1 through the existing strict pipeline:

```text
v1 schema document
→ reconstructProject()
→ validateProject()
→ editableProjectFromValidatedProject()
→ EditableProject runtime source
```

The migrated Screen placement is `(0,0)`. Existing IDs and source ordering are preserved. No random entity or document ID is generated. Root v1 extensions are returned unchanged and can be passed to the next v2 save.

The next editor save after loading v1 emits schema v2. The legacy v1 serializer continues to emit schema v1.

## 8. Determinism

Serialization has no timestamps, random IDs, paths or OS-specific fields.

- Equal source values produce byte-identical UTF-8 JSON text.
- Save → load → save produces identical canonical text.
- Record fields use the schema-defined order.
- Extension object keys are recursively ordered by UTF-16 code unit order.
- Source arrays retain their caller-defined order.
- Negative zero is normalized by JSON output.
- Output ends with one newline.

## 9. Schema boundary

Unknown root, project or entity fields are rejected. Unsupported schema versions use `SERIALIZATION_UNSUPPORTED_VERSION`. JSON duplicate keys, invalid syntax, numeric overflow and non-JSON runtime values preserve the existing Phase 7 serialization boundary.

Schema parsing is structural. Integrity is enforced by `loadEditableProject()` and before `serializeEditableProject()` returns text.

## 10. Acceptance

- Empty, layout-only, layout-with-Cabinets, Mapping-only, partial-Hardware, complete and multi-screen projects round-trip.
- Signed Composition placements round-trip as project data.
- Nonempty remap source descriptors round-trip without requiring Phase 7 execution support.
- Schema v1 migrates through strict validation with stable IDs and `(0,0)` placement.
- V1 extensions survive the v1→v2 workflow.
- Source array order is preserved.
- Save → load → save is byte-identical.
- Derived and runtime-only fields are absent.
- Unknown fields and unsupported versions are rejected.
- Duplicate, dangling and conflicting source is rejected with integrity diagnostics.
- Existing schema v1 tests and public API remain green.

## 11. Exclusions

P0C does not add Electron IPC, filesystem access, Open/Save dialogs, recent files, dirty state, autosave, recovery, UI changes, vendor export or undo/redo. Those belong to P0D/P1.
