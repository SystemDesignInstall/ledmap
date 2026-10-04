# Project Model v2 convergence: C5 direct Hardware mutations

C5 moves the current Hardware workspace mutation path to direct `LedMapProjectV2` commands. `ProjectSession<LedMapProjectV2>` remains the only mutable document owner. The workspace may use an `EditableProject` read projection and the existing schema-v2 writer, but does not mutate that projection and patch it back into V2. Test, Live Output, Export, allocator mathematics, IPC, and the wire schema remain unchanged.

## Independent ownership and order

- `HardwareAssignment` records Cabinet membership on one Receiver. Its array position is not signal order.
- `PortReceiverOrder.receiverIds` records Receiver order on a Port. `legacyIndex` is an attribute, not chain position.
- `SignalRoute.orderedCabinetIds` records Cabinet signal order inside one Receiver.
- `GridOrdering` records logical Screen/Grid traversal. Changing it does not reroute existing hardware.
- `processorOrder` records Processor order independently of all of the above.

The assignment set for a Receiver must equal its route Cabinet set. Assign, move, unassign, and auto-apply construct both parts in one candidate and publish through one `ProjectSession` transaction. The UI supplies an explicit ordered list for manual Assign. The current UI forms it from logical traversal at command time; the V2 command does not derive an existing route from `GridOrdering`. Unselected target Cabinets retain their route order and selected Cabinets append in request order, including when a selected Cabinet is already on that Receiver. Moving between Receivers removes the selected Cabinets from source routes. An empty route is removed.

## Lock, delete, and capacity

`locked` means protected from automatic allocation, not protected from an explicit user Assign/Move/Unassign. The existing allocator treats all already assigned Cabinets as fixed. C5 does not create `origin` values because schema v2 cannot preserve them. New compatibility assignments use `locked: true`.

Deleting a Processor with Ports, a Port with Receivers, or a Receiver with assignments or any SignalRoute is blocked. Empty Receiver, Port, and Processor deletion removes their corresponding explicit order entries. This intentionally differs from the old unconfirmed cascading deletion. No dependency is silently discarded. A future confirmed-cascade UX requires a separate stage.

Port receiver capacity limits Receiver count; Processor port count must cover existing Port indices; manual Cabinet assignment and Receiver capacity edits respect current pixel usage. An existing over-capacity document may be not ready, but unrelated commands do not auto-unassign or reroute it. Preview does not mutate the document. Auto-apply requires the same `documentId` and `revision`, verifies its proposal against the current allocator result, and commits assignments/routes atomically.

## Schema-v2 compatibility identity

The schema-v2 wire format does not store Assignment or SignalRoute IDs. The existing V2 conversion reconstructs them deterministically from domain identity:

```text
Assignment ID = "assignment:" + Cabinet ID string length + ":" + Cabinet ID
SignalRoute ID = "route:" + Receiver ID string length + ":" + Receiver ID
```

The length prefix avoids ambiguity for arbitrary IDs. Neither ID depends on array position, signal order, or serialization order. C5 uses the same algorithm for new records. The compatibility Save guard also requires schema-v2-representable assignment metadata and canonical array order; it rejects V2-only state rather than writing a lossy file. Save/Reopen therefore reproduces the same compatibility IDs, membership, Receiver order, and routes.

## Acceptance

Direct commands retain differential parity with legacy Hardware operations except the approved dependent-delete block. Tests cover atomic assignment/route updates, fixed auto allocation and explicit manual move, deterministic IDs through Save/Reopen, capacity boundaries, no-op revision, stale preview, independent order sources, PixelAddress parity, and the applicable REF cases. Root tests, typecheck, lint, build, PNG parity, and full Electron smoke are required before commit.
