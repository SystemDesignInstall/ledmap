# Project Model v2 convergence: C4 direct Layout and Mapping mutations

C4 moves the current Layout and Input Mapping commands from the `EditableProject` mutation bridge to direct `LedMapProjectV2` transforms. `ProjectSession<LedMapProjectV2>` remains the only document owner. `Project` and `ScreenView` are derived reads. The Hardware workspace retains the temporary legacy mutation bridge until C5; Test, Live Output, and Export continue to use the existing read projections. The Save/Open wire format remains `schemaVersion: 2` and the main-process writer and IPC are unchanged.

## Ordering boundary

- `GridOrdering` determines logical Cabinet traversal within a Screen/Grid.
- `PortReceiverOrder` determines Receiver order on a Port.
- `SignalRoute` determines Cabinet order within a Receiver hardware chain.

Changing `GridOrdering` may change derived `ScreenView` cabinet indices, but does not change `HardwareAssignment`, `PortReceiverOrder`, `SignalRoute`, or perform hardware rerouting. Hardware readiness is recomputed from the unchanged hardware topology. Test and Export hardware addressing continues to use HardwareAssignment, PortReceiverOrder, and SignalRoute rather than inferring the hardware chain from GridOrdering.

## Mutation boundary

One command receives the current V2 project and returns a candidate V2 project. The session boundary validates V2 contracts and editor structure, checks current projection diagnostics, compares semantic document values, and either publishes one immutable session with `revision + 1`, returns the unchanged session for a no-op, or throws without publishing. Layout and Mapping commands do not convert V2 to `EditableProject` to mutate and patch it back. Hardware remains on the C3 bridge.

Direct Layout commands cover Add, Duplicate, Rename, Move/Set Position and batch position changes, Cabinet Grid resize, Cabinet geometry and ordering configuration, and Screen deletion. Direct Mapping commands cover Input Canvas configuration, Mapping Region create/update/delete, and explicit Map from Layout. Selection, camera, output mapping, media output, and enable/disable are not C4 document commands.

## Identity and dependencies

Grid resize preserves Cabinet IDs by surviving `(gridId, column, row)` cells. Modules preserve IDs by surviving `(cabinetId, column, row)` cells. New cells receive new IDs; cells outside the resulting grid are deleted. Cabinet ordering affects derived logical indices, not IDs. A resize or Screen deletion that would remove a Cabinet named by HardwareAssignment or SignalRoute is blocked before publication. C4 does not mutate or reroute hardware. Screen deletion cascades to its MappingRegions and their order membership, Cabinet Grids, Cabinets, Modules, and CompositionPlacements. It is blocked if the Screen is referenced by Stage or OutputMapping. InputCanvas deletion and Region reference reassignment are not current workspace commands. InputCanvas resize preserves ID and links; out-of-bounds Regions remain editable and diagnosable.

The current schema-v2 wire format has no persisted Cabinet ID allocator or tombstones. C4 preserves every surviving ID and uniqueness of existing IDs in a Project, but does not guarantee that a historical deleted Cabinet ID cannot be reused after Save/Reopen. Permanent historical non-reuse is a separate future persistence/model requirement and does not authorize a schema change in C4.

## Acceptance

Differential tests compare old legacy mutation results with new V2 command read projections for Layout geometry, positions, identities and order, InputCanvas links, MappingRegion geometry, and ScreenView. Additional tests cover no-op revision behavior, dependent resize/delete rejection, Screen-to-Region cascade, invalid transaction atomicity, Save/Reopen parity, out-of-bounds Mapping diagnostics, and GridOrdering versus hardware route independence. Root test, typecheck, lint, build, PNG parity probe, and Electron smoke gates must pass. C5, hardware commands, schema v3, main-process writer, IPC redesign, and UI redesign are out of scope.
