# P0-3 — coordinate spaces and Resolume Advanced Output

Status: implementation authorized by the user's continuation of the proposed P0-3 stage on 2026-10-06. Baseline: `239f1296f6596d3077436d16e3b206f0e8afb4e2`, PR #17 including its review corrective. Implement this contract before widening native interoperability.

## Spaces

| Space | Origin and units | Meaning |
|---|---|---|
| Input Canvas | upper left, integer pixels | Source sampled by Mapping Regions; unrelated to chart placement |
| Mapping Region | source position in its Input Canvas | Logical Input → Screen/Grid correspondence, never a Cabinet |
| Grid / Cabinet / Module | physical local coordinates and pixel coordinates explicitly distinguished | Existing geometry and Cabinet Engine transforms |
| Screen | upper left, integer screen pixels | OutputMapping.screenRect, before Media Output transformation |
| Composition | project placement coordinates | Screen chart placement; no Hardware signal order |
| Composition raster | Composition minus explicit exported frame origin | Resolume InputRect when the operator loads that Composition chart as content |
| Media Output | upper left, output raster pixels | Resolume OutputRect; one Arena Screen per LedMAP Media Output |
| Hardware stream | explicit Processor/Port/Receiver route order | Independent of all spatial translations above |

Pixel cells are half-open: `[x, x + width) × [y, y + height)`. XML vertices describe rectangle edges, so the lower/right edge is x+width/y+height, not the last pixel index. Pixel rotation/flip uses width-1/height-1 in the existing Output Mapping engine. Bijective round trip is required only for equal-size quarter-turn/flip mappings; resampling is not bijective.

Add pure core Screen-rect ↔ Composition-raster conversions with an explicit signed frame origin, safe-integer sums, bounds and an exact 1:1 check between chart geometry and Screen resolution. Fit and fixed chart frames use the same frame selected for Composition PNG export. No guessed origin, missing placement or physical-to-pixel scale. Existing Input/Mapping/Hardware math remains canonical.

## App format boundary

Parse real native `ScreenSetup` preferences and `XmlState` presets in app using a dedicated XML parser. Retain ordered corners, source IDs, names, enabled state, declared dimensions/version and warp information in an immutable inspection DTO. Missing device dimensions remain unknown. Unknown XML elements are tolerated and diagnosed when their semantics are outside the supported subset. Duplicate IDs, malformed required numbers/vertices and ambiguous repeated structural nodes are errors.

Limits: 2 MiB UTF-8 input, 50,000 raw markup opening markers before DOM construction, 25,000 elements, depth 64, 64 attributes per element. Element/depth/attribute checks use an iterative walk after bounded DOM construction. Export is additionally bounded to 250 total screens plus slices and 2 MiB. Reject DTD/entity declarations before parsing and abort on all parser errors/warnings. No external resource resolution, network, or XML in core. Add only the app dependency `@xmldom/xmldom`, pinned exactly after license/advisory review; preserve its complete MIT notice.

Supported application/export subset: rectangular, integer-edge slices, zero orientations/flips, composition input source, no masks/blend/changed lattice/homography or unsupported layer kinds. Identity Warper is valid and does not itself mean distortion. Parse unsupported geometry without flattening it, report it, and reject its application/export. Unknown output dimensions require explicit operator-provided values, never inferred from bounds. Screen/layer disabled state is retained.

SoftEdging and nonempty ScreenSetup parameters are diagnosed and blocked because their rendering semantics cannot be represented by the rectangular Output Mapping model. Inspection of otherwise valid preferences remains available, including its unknown-raster diagnostic.

Import adapter appends Media Outputs and Output Mappings only with explicit source-slice → existing LedMAP Screen bindings and the same explicit Composition frame. Apply is atomic and fits existing one-transaction history. Never create Cabinets, Modules, Receivers or signal routes from slice geometry. Independent disabled Arena Screen state cannot be represented by current MediaOutput intent, so project import rejects it; inspection/native DTO round trip retain it. A malformed/unsupported selected import rejects the entire operation; the original project and source inspection remain available. Native import UI with binding choices belongs to the next product UI stage.

Exporter uses Media Output mappingOrder, deterministic local unique IDs, stable UTF-8/LF XML and plain decimal formatting. Write preset `XmlState` only, virtual output devices, vertex lists, identity 4×4 Warper and identity Homography matching the pinned sample schema. Do not write to Resolume preferences or guess real device hashes. Refuse unsupported mappings, missing/ambiguous order, empty outputs, clipping and unknown references. Existing LedMAP slice reference XML/CSV stay available. Add a separate native preset export control with explicit readiness diagnostics.

## Evidence and compatibility

Primary format evidence: UnMapper commit `459e3319399a8570619af738e271d71a07c593c3` reader and actual Arena 7.27.0 revision 14395 preset/preferences; pixel-peeker commit `367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d` independent writer and its generated fixture. Record all source/destination paths, blobs, transfers, sanitization, modifications and tests; retain Stoatworks Labs MIT notice. B.L.I.N.K implementation/assets/data stay excluded.

User-visible report distinguishes sample-schema version / fixture-reading tests from live Arena validation. LedMAP's generated export has not been loaded in Arena: always label that fact; do not mark any Arena version as live verified. Synthetic warp and generated writer fixtures must be clearly identified.

No .ledmap schema change, derived XML/inspection/validation data or hidden extension state. v3–v5 serialization remains readable. Removing/disabling native export loses no project data.

## Acceptance

Core translation and existing Output Mapping inverse regressions; real Arena preset/preferences reads; independent pixel-peeker fixture; unknown nodes; identity and changed interior warp point; unsupported orientation/masks/source/blend; malformed XML/DTD/entities/size/depth/numbers/IDs; deterministic export golden; parseable native export; project export → read → explicitly bound import round trip, stable ordering, save/load, undo/redo and atomic rejection. Full tests, typecheck, lint, build, license/audit and Electron smoke must pass. Inspect the native export UI screenshot. Record fixture-scale informational parser/export timing without a live compatibility or release-scale performance claim.
