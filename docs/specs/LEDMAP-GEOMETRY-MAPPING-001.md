# LEDMAP-GEOMETRY-MAPPING-001 — Phase 8 P0B Geometry Mapping

**Version:** 1.0 accepted implementation contract
**Scope:** additive geometry projection before hardware addressing.

## 1. Product sequence

The editor workflow is:

```text
Layout → Mapping → Hardware → Test → Export
```

Geometry Mapping must therefore resolve before Processor, Port or Receiver entities exist.

```text
InputCanvas → MappingRegion → Screen → CabinetGrid → Cabinet → Module
```

Hardware addressing remains a separate stage:

```text
Cabinet/Module pixel → Receiver → Port → Processor → dataIndex
```

## 2. Architectural boundary

P0B adds a geometry-only API to `@ledmap/core`. It consumes InputCanvas, Screen, CabinetGrid, MappingRegion, Cabinets and Modules. It does not consume or synthesize Processor, Port, Receiver, processor order or receiver order.

Cabinets and Modules remain stored in `EditableProject.hardwareTopology` as the accepted P0A source container. Selecting Cabinets and Modules for one Grid is a geometry projection, not hardware-topology trimming.

Hardware addressing always resolves from the complete `EditableProject.hardwareTopology`. A Screen-local subset must never be passed to `resolveHardware()`, because removing earlier Cabinets or Receivers would change Port-local `dataIndex`.

## 3. Geometry API

The public additive API is:

```ts
resolveGeometryMapping(input): ResolvedGeometryMapping
mapGeometryInputPixel(mapping, inputPixel): GeometryMappedPixel
unmapGeometryCabinetPixel(mapping, cabinetPixel): GeometryMappedPixel
unmapGeometryModulePixel(mapping, modulePixel): GeometryMappedPixel
```

`GeometryMappedPixel` contains Input, Screen, Cabinet and Module coordinates. It never contains a hardware address.

`ResolvedGeometryMapping` is immutable and compact. Its size depends on Cabinet and Module counts, not pixel count. Each Cabinet cell stores the validated module layout and row-major Module IDs needed for lookup.

Forward and reverse geometry lookups are symmetric for every valid pixel.

## 4. Editable project projections

```ts
projectEditableGeometryMapping(project, regionId)
projectEditableHardwareMapping(project)
```

Both functions return a discriminated result:

```text
ready      → resolved immutable value
incomplete → null value plus structured diagnostics
```

Geometry projection selects one MappingRegion, its Screen and Grid, then selects only the Cabinets belonging to that Grid and their Modules. It supports multiple Screens and does not require hardware assignment.

Hardware projection resolves the complete project topology without filtering by Screen. Missing or invalid hardware is an explicit incomplete state and does not prevent geometry projection.

`inspectGeometryInputPixel()` preserves the geometry result when hardware is incomplete and exposes hardware status separately.

## 5. Composition

When full hardware is ready, the public composition API is:

```ts
addressGeometryPixel(hardware, pixel): MappedPixel
mapInputPixelWithHardware(geometry, hardware, inputPixel): MappedPixel
unmapHardwarePixelWithGeometry(geometry, hardware, key): MappedPixel
```

Composition verifies that geometry and hardware agree on Module identity and Module-local coordinates. The supplied `ResolvedHardwareMapping` may contain Cabinets from any number of Screens. Hardware offsets are never recomputed in the geometry layer.

## 6. Compatibility

The accepted Phase 7 API remains supported without signature or semantic changes:

```ts
resolveMapping()
mapInputPixel()
unmapHardwarePixel()
```

Its single-profile rules and REF-001 results remain unchanged. P0B does not alter Cabinet ordering, hardware addressing, Port-local `dataIndex`, global remap index, serialization v1, Remap, HardwareProfile or vendor encoding.

## 7. Validation

Geometry resolution validates:

- InputCanvas, Screen, Grid and MappingRegion references;
- source bounds and safe-integer arithmetic;
- complete and unique Cabinet cells;
- uniform Cabinet pixel dimensions for the selected Grid;
- complete and unique Module cells for every Cabinet;
- Module physical and pixel tiling;
- symmetric Cabinet-local and Module-local lookup bounds.

Failures use `MAPPING_*` `DomainError` codes. Editable projections convert such failures into structured incomplete diagnostics instead of requiring fake hardware.

## 8. Acceptance

- Geometry resolves with zero Processor, Port and Receiver entities.
- Multiple Screens resolve their MappingRegions independently.
- Forward and reverse Cabinet/Module geometry are symmetric.
- REF-001 geometry matches the accepted Phase 7 result for every pixel.
- Missing Cabinet or Module cells produce `MAPPING_INCOMPLETE`.
- Two Screens sharing one Port preserve the real full-stream `dataIndex`.
- Geometry remains available with explicit hardware-incomplete status.
- Existing Phase 7 tests remain green.
- `test`, `typecheck`, `lint` and `git diff --check` pass before commit.

## 9. Exclusions

P0B does not implement UI, serialization v2, migration, persistence, Hardware editor, allocation UI, Mapping transforms, Remap changes, export or optimization around the current Alpha `ScreenView`.
