# Architecture decisions for the spatial editor refactor

## ADR-025: XtremeLED is a behavior and UX reference

Status: Accepted.

XtremeLED informs interaction concepts, terminology comparison, and observable file behavior. It is not a replacement codebase for LedMAP.

## ADR-026: LedMAP Core remains the source of truth

Status: Accepted.

Cabinet geometry/order, Hardware topology/addressing, Mapping, Remap, Validation, and serialization remain LedMAP-owned domain subsystems. Renderer code consumes these APIs.

## ADR-027: Screen and OutputSurface are separate entities

Status: Accepted.

`Screen` models logical/physical LED geometry. `OutputSurface` models a media-server/output destination. Neither ID nor lifecycle is shared implicitly.

## ADR-028: SlicePlan separates FinalRemap from export formats

Status: Accepted for the future Slice phase.

Export adapters consume a derived `SlicePlan`. They do not inspect Cabinet or Hardware Engine internals and do not generate slices directly from topology.

## ADR-029: Resolume is an external adapter

Status: Accepted for the future format phase.

Resolume DTO parsing and serialization will live outside the core LED domain. The adapter boundary is `SlicePlan -> Resolume DTO -> XML`.

## ADR-030: XtremeLED reimplementation is clean-room

Status: Accepted.

No XtremeLED source is copied or mechanically translated. LedMAP uses independent TypeScript implementations based on documented LedMAP contracts and observable behavior. No copied XtremeLED code was found in the inspected LedMAP tree.
