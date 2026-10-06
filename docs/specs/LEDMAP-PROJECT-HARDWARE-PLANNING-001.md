# LEDMAP-PROJECT-HARDWARE-PLANNING-001 — P0-2

Status: plan authorized by the user's instruction to proceed on 2026-10-06 after PR #16 review/merge and the proposed project-bound wiring/capacity stage.

## Contract

- LedMapProjectV2 is the source of Cabinet, Receiver, Port and Processor identities and assignments. No coordinate-generated IDs or demo topology enter the calculation.
- Cabinet traversal uses each Screen's Cabinet Grid order and the existing independent Numbering, Direction and Snake transforms. Physical position and logical signal order remain separate.
- Auto Allocate fills only unassigned Cabinets. Every existing assignment, its ID, locked/origin metadata and manually ordered route prefix are preserved, including unlocked manual assignments. New auto assignments use locked=false and origin=auto.
- A Cabinet that cannot fit stays absent from assignments and routes and is reported as unpatched. An overloaded existing assignment stays assigned and receives an independent overload issue.
- Capacity uses the project's declared Receiver pixelCapacity, Port receiverCapacity and Processor portCount. Receiver pixels are Cabinet pixelWidth × pixelHeight, with safe-integer arithmetic. Per-Port and per-Processor pixel limits and vendor transport modes have no persistent V2 contract; their capacity/headroom remain unknown. No manufacturer packing, refresh-rate or transport efficiency is inferred.
- Unknown Receiver pixel capacity is reported and is excluded from new automatic placement. Existing assignments to such a Receiver remain intact.
- Hardware load selectors and allocation planning are pure core functions. Diagnostics use the existing ProjectDiagnostic and ProjectValidationReport contract, with a V2 input to validateProject. Legacy validation behavior remains compatible.
- The existing Hardware workspace consumes the core plan and report. Partial allocation is previewed explicitly; applying it is one document transaction. Stale or modified previews fail atomically. Capacity overload or structural errors block Apply; remaining unpatched Cabinets are permitted as an editable project state.
- Existing .ledmap schema versions 3–5 remain unchanged. Only assignment/route intent persists; loads, headroom and reports are recalculated. Save/load and undo/redo preserve manual metadata.

## Acceptance

Reference cases 001–004 remain green. Add fault fixtures for insufficient capacity, oversized Cabinets, mixed pixel sizes, locked overload, unknown capacity, missing/duplicate references and order entries, aggregate overflow, non-positional IDs and route-prefix stability. Test partial allocation, stale/modified preview rejection, metadata round-trip and undo/redo. Complete tests, typecheck, lint, build, license/audit checks and Electron smoke.

## Provenance

This stage is independently implemented from LedMAP's existing model, Cabinet Engine, hardware allocator and serializer. Candidate WIP wiring/capacity/diagnostics files are inspected for requirements and defects and are not imported. No external code, fixtures, vendor data or B.L.I.N.K material is copied.

## Rollback

Revert the stage commit(s), or the squash merge commit after integration. No data migration is needed because the existing assignment and route schema is retained.
