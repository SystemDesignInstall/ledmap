# Project Model v2 convergence: C1 contract

This contract applies to the core domain foundation and the one-way `EditableProject → LedMapProjectV2` adapter. C1 does not change renderer ownership or the `.ledmap` v2 document schema. The model foundation is adapted from P0A `e75567b`, with its Receiver cabinet ownership corrected before use.

## Hardware ownership and order

- `ProjectReceiver.legacyIndex` preserves the non-negative, user-editable `Receiver.index` value in existing v1/v2 projects. The current engine gives this number no addressing or ordering role; the canonical model therefore gives it no new hardware meaning. It is not required to be unique. A displayed signal-chain position is derived only from `hardware.receiverOrder[].receiverIds`.
- `HardwareAssignment` is the sole source of Cabinet-to-Receiver membership. Each assignment has an ID, a Cabinet target, a Receiver ID, `locked`, and optional `origin: 'manual' | 'auto'`. Assignment array position has no meaning.
- `hardware.receiverOrder` is the sole source of Receiver order on a Port. A Receiver may occur at most once across all Port orders and must belong to the stated Port.
- `operations.signalRoutes` is the sole source of Cabinet signal order within a Receiver. At most one route exists per Receiver. Its `orderedCabinetIds` is an explicit sequence; neither Cabinet physical position nor `GridOrdering` replaces it.
- For each Receiver, the set of assigned Cabinet IDs must equal the set of Cabinet IDs in its route. Neither set may contain duplicates. A Receiver with no assigned Cabinets may have no route or an empty route. A Receiver with assignments must have a route. The validator rejects route entries without matching assignments and assignments missing from the route.

## Screen reference order

The v2 editor also stores ordered `Screen.cabinetGrids` and `Screen.mappingRegions` lists. Their sequence can differ from the order of the global entity arrays; the first Grid is used by the current Layout projection. `ProjectScreen.cabinetGridOrder` and `mappingRegionOrder` preserve those sequences. Grid and Region `screenId` fields remain the source of parent membership. Validation requires each referenced entity to belong to the Screen and to occur exactly once in its corresponding order list.

## Legacy migration

For v1/v2 input, the adapter splits every ordered `Receiver.cabinets` list into independent assignments and one route preserving that list's exact sequence. Assignment and route IDs are deterministic functions of their source IDs. `Receiver.index` becomes `legacyIndex` unchanged. The adapter rejects a legacy project with integrity diagnostics instead of silently repairing it.

Existing documents do not record whether an assignment was manual or automatic, so migrated assignments omit `origin`. They use `locked: true` because the current `allocateHardware()` treats every already assigned Cabinet as fixed, preserving its Receiver and position in that Receiver's list. A migration compatibility test checks this behavior.

The adapter creates no persisted document and does not modify its source. Existing v1/v2 readers and the v2 writer remain authoritative for the running product during C1. A future v3 writer must store assignments and routes separately; it must not emit a new shape under `schemaVersion: 2`.
