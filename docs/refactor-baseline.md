# Xtreme-style editor refactor baseline

Date: 2026-09-25

## Repository state

- Starting branch: `master`
- Starting HEAD: `6ea15c06cdce08f4794fbe25a2af40019196d68d`
- Starting relation to remote: `master` was one commit ahead of `origin/master`
- Working branch: `refactor/xtreme-editor`
- Node.js: `v24.19.0`
- npm: `11.17.0`

The Windows PowerShell execution policy blocks `npm.ps1`, so all recorded npm checks use the equivalent `npm.cmd` executable.

## Architecture found

`packages/core` is a dependency-free deterministic TypeScript package. It owns the domain model and the Cabinet, Hardware, Mapping, Remap, Validation, and Serialization subsystems. `packages/app` owns Electron and Canvas UI concerns.

The pre-refactor Mapping Engine already reused `addressPixel()` and `locatePixel()` and returned a compact immutable snapshot. Its accepted profile was one selected InputCanvas, Screen, CabinetGrid, and MappingRegion. `MappingRegion` stored only `position + size`, targeted the complete Grid at Screen origin, and required Region, Screen, and Grid pixel dimensions to be identical.

Serialization used a closed `.ledmap` schema v1 and did not provide a migration to a newer schema.

## Baseline checks

| Check | Result |
|---|---|
| `npm.cmd test` | PASS: 43 files, 1087 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` | PASS; electron-vite reports the existing non-fatal missing preload config warning |

## Protected invariants

- Cabinet physical coordinates remain independent from signal order.
- Cabinet, Module, Receiver, Port, and Processor ownership remains in the existing engines.
- Mapping continues to call Hardware Engine addressing APIs.
- Resolved pixel maps remain derived, compact, and absent from project files.
- REF-001 remains the golden hardware/mapping fixture.

## Phase 0–3 scope

This implementation slice adds spatial domain contracts, migrates MappingRegion to input/destination rectangles and independent transforms, implements deterministic forward/reverse mapping, and upgrades project serialization with a v1-to-v2 migration. Slice generation, Resolume conversion, editor state refactoring, and UI interactions are later phases.
