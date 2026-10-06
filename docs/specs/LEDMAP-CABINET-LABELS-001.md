# LEDMAP-CABINET-LABELS-001 — Cabinet display labels

Status: **approved by the user on 2026-10-06**. Cabinet labels are a Composition presentation setting. Cabinet identity, physical cell and signal order remain separate.

## Behavior

- The default label is derived from the cell: row A/B/C and column 1/2/3. A 4×3 Grid displays `A1 A2 A3 A4 / B1 B2 B3 B4 / C1 C2 C3 C4`. Growing it to five columns adds `A5`, `B5` and `C5` without changing any existing display label.
- Each Screen offers row and column coordinate labels, numeric coordinates, sequential order by rows or columns, alternating order by rows or columns, and reverse order by rows or columns. Numeric sequential modes can change existing labels when a dimension changes; coordinate modes do not.
- A double click on a Cabinet in Composition opens its Properties. A custom label overrides the automatic label for that physical Cabinet. Empty input or **Use automatic label** clears the override. Labels are limited to 32 characters and must be unique within the Screen, ignoring case. Resize rejects a resulting duplicate atomically.
- The underlying Cabinet ID remains visible in Properties. `Numbering`, `Direction` and `Snake` still govern Cabinet Engine signal order and have no effect on display labels. Label changes do not alter Mapping Regions or Hardware assignments.
- The selected scheme lives in the existing versioned Composition chart extension. Custom labels use the existing persisted `ProjectCabinet.label` field. Legacy labels equal to the physical `C…` ID are treated as automatic. Retained Cabinets keep custom labels through resize; Cabinets removed by shrink lose their labels with their physical identity. Screen duplication copies custom labels to matching cells.
- Composition editor labels and the **Cabinet labels** Screen drawing option use one resolver. Test, Live Output, PNG and SVG consume the same chart frame. **Physical IDs** remains a separate Screen drawing option; diagnostic patterns and mapping exports keep their existing physical IDs.
- Composition draws editor labels directly inside each Cabinet cell. Text is fitted to the cell and remains visible while the cell is at least 20 screen pixels in both dimensions. Longer labels are abbreviated on the canvas; hovering reveals the full display label and physical ID. Smaller cells reveal their labels on hover or selection to avoid overlaps.

## Acceptance

Verify coordinate stability on growth, all automatic schemes, custom labels and duplicates, resize, duplication, Undo/Redo, save/open, chart rendering and physical ID availability. Run root tests, typecheck, lint, build and Electron smoke.
