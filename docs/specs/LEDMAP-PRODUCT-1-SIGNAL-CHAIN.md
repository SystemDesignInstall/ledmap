# PRODUCT-1 — Hardware Signal Chain Editor

Status: Accepted for implementation.

## User workflow

The existing Hardware workspace shows the selected Receiver's `SignalRoute.orderedCabinetIds` as an ordered, numbered Cabinet list. Each entry shows its user-facing label, stable ID, Screen, Grid coordinate and pixel count. The first and last Cabinets are identified explicitly. The canvas derives sequence badges and the existing signal line from the same route; it stores no independent order.

The user can move one Cabinet up or down in its Receiver, unassign it, or move it to another Receiver. A cross-Receiver move **appends the Cabinet to the end of the target SignalRoute**. The target chooser follows `processorOrder`, Port index and `PortReceiverOrder`; it does not sort by ID or `legacyIndex`. Reordering within the same Receiver uses the reorder action, not a transfer to itself. Drag-and-drop, bulk reorder and arbitrary insertion on transfer are outside PRODUCT-1.

The existing multi-selection Assign/Unassign workflow remains available. Signal Chain reorder and transfer are single-Cabinet actions. Buttons are keyboard-operable. `Alt+Up` and `Alt+Down` apply only while a Cabinet row in the Signal Chain list has focus; repeated keydown events do not repeat the action.

## Model boundary

`HardwareAssignment` is Cabinet membership on Receiver; `PortReceiverOrder` orders Receivers on a Port; `SignalRoute` orders Cabinets inside a Receiver; `GridOrdering` is logical Screen/Grid traversal. None substitutes for another.

`reorderSignalRouteV2` accepts only an exact permutation of the current assigned Cabinet set. It changes only `SignalRoute.orderedCabinetIds`, retains the route ID and returns the original Project for an identical order. A transfer updates one existing assignment's `receiverId`, retains its ID, `locked` and `origin`, removes the Cabinet from the source route and appends it to the target route atomically. An empty source route is removed; a first target assignment creates the canonical compatible route ID. Transfer to the current Receiver is a no-op. Invalid targets or capacity overflow reject the whole transaction.

Manual edits may reorder, move or unassign locked Cabinets. Auto Allocate continues to treat all existing assignments as fixed, including `locked: false`; it preserves their route order and may append newly assigned Cabinets. PRODUCT-1 does not change allocator mathematics. `Port.receiverCapacity` counts Receivers, not Cabinets or pixels. No V3 schema or Project Model change is required.

Each completed button or keyboard action is one HISTORY-1 step. A no-op advances neither revision nor history and therefore schedules no autosave. Save V3, reopen and recovery preserve route identity and order. PixelAddress, Address Walk, Test and generic JSON/CSV derive their hardware order from the changed route automatically.
