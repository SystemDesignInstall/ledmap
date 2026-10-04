# Project Model v2 convergence: C3 ownership cutover

C3 changes the running document owner from `EditorDocumentState.project: EditableProject` to `ProjectSession.project: LedMapProjectV2`. `EditableProject` and the current `Project`/`ScreenView` remain disposable compatibility projections. The `.ledmap` writer continues to emit `schemaVersion: 2`. C3 does not add a v3 reader or writer, change production engines, or change filesystem write semantics.

## Compatibility envelope

The current v1/v2 loader produces `EditableProject`; C3 converts that value once to V2 when opening a document. New documents start with `createEmptyProjectV2()`. Save may use `serializeEditableProject()` only after proving that projecting the current V2 document to `EditableProject` and converting it back would preserve all document data. An unsupported V2 value must fail Save before the writer receives it.

| V2 data | Existing schema v2 / `EditableProject` | C3 mutation behavior | C3 Save behavior |
| --- | --- | --- | --- |
| Screens, Grid order and configuration, Cabinets and Modules, composition x/y, one Input Canvas, Mapping Regions, Processor/Port/Receiver values and explicit orders, Receiver Cabinet chain, remap rules | Representable | Apply only the changed legacy fields as a patch to V2. | Serialize through the checked projection. |
| `metadata.name` and `metadata.description` | Not representable | Preserve on unrelated mutation. | Block when present. |
| Cabinet `label` independent of its legacy ID-derived label | Not representable | Preserve for surviving Cabinets; derive only for new Cabinets. | Block when it differs from the legacy-derived label. |
| Composition placement `locked` | Not representable | Preserve for surviving Screens; default only for new Screens. | Block when true. |
| Stage placements | Not representable | Block legacy mutation because the current read projection cannot represent Stage. | Block when present. |
| More than one Input Canvas, Media Outputs, Output Mappings | Not representable | Block legacy mutation because the current read projection cannot represent these sections. | Block when present. |
| Assignment ID, `locked`, `origin`, and array order | Only Cabinet-to-Receiver membership is representable | Preserve metadata and order on unrelated mutation. A command changing annotated membership is blocked unless its explicit patch handles that metadata. | Block if projecting and converting back changes persisted information. |
| Signal Route ID and explicit empty-route presence | Only Cabinet order within each Receiver is representable | Preserve ID and empty-route presence for surviving Receivers on unrelated mutation. | Block if the writer cannot reproduce them. |
| Backup Routes and Live Output Targets | Not representable | Block legacy mutation because the current read projection cannot represent these sections. | Block when present. |

The bridge never assigns `convertEditableProjectToV2(mutatedEditable)` as the next session project. It compares the temporary legacy value before and after one command, patches only that command's representable fields into the original V2 project, preserves all other V2 sections, validates the complete candidate, and publishes it atomically. Loss of V2-only data is an error. For commands that require an unsupported legacy read, mutation is blocked with an explicit compatibility diagnostic.

## Session and transaction

`ProjectSession<LedMapProjectV2>` contains the immutable V2 project, `revision`, `savedRevision`, runtime-only `documentId`, `currentFilePath`, `sourceSchemaVersion: 1 | 2 | 3`, and document extensions. `dirty` is derived from `revision !== savedRevision`; path and document ID are not persisted. A semantic no-op leaves both revisions unchanged even if a legacy mutator allocates new objects. Every real command advances `revision` once.

The sole mutation boundary derives a frozen legacy read, runs one command, validates the legacy result, applies a scoped V2 patch, validates the V2 candidate, and then replaces the session once. No renderer observes an intermediate candidate. A failed command leaves the entire session unchanged. The renderer does not own an independently mutable `Project`; workspace views are derived from the current immutable V2 project.

## New, Open, Save, and asynchronous operations

New constructs a clean empty V2 session. Open uses the existing v1/v2 loader and `convertEditableProjectToV2()`, then stages its read projection before replacing the session. It captures the immutable session object as an operation token; any document, revision, save-state, or path change while an Open or unsaved-changes dialog is pending invalidates that token. The old result is discarded and the user can retry. Invalid input never replaces the current document.

Save captures `documentId`, `revision`, immutable project snapshot, and current target-path request before awaiting IPC. It performs the losslessness check, produces a transient `EditableProject`, and calls `serializeEditableProject()`. On successful IPC completion for the same document, `savedRevision` becomes the captured revision, not the current revision. A later edit therefore stays dirty. Save As adopts the returned path only on success for the same document. Cancellation or failure changes neither path nor saved revision.

Only one write is in flight at a time. A second Save request is queued as a new snapshot taken when its turn begins, so Save at revision 5 followed by an edit to revision 6 and a second Save writes revision 6 next. New/Open/Close never consume a stale Save result: they await the active write and recheck the document ID and dirty state before replacement. An old callback cannot update another session. The existing direct `writeFile` does not promise crash-safe rollback of file bytes; atomic replacement belongs to a separate persistence-hardening stage.

## Acceptance and scope

Tests must cover no-op and single-step revision rules, atomic failure, V2-only data surviving an unrelated legacy mutation, explicit rejection of lossy Save, v1/v2 Open and schema-v2 Save/Reopen, Save/Edit and Save/Edit/Save ordering, Save As/Edit, failure and cancellation, stale Open/Save results, and Layout/Mapping/Hardware/Test/Live/Export parity. The full root test, typecheck, lint, build, PNG parity probe, and Electron smoke gates must pass.

Expected changes are confined to the renderer session/document boundary and its tests: `packages/app/src/renderer/project-session.ts`, `document.ts`, `index.ts`, `v2-read-model.ts`, corresponding app tests and Electron smoke, plus a core compatibility guard and tests if needed. The main-process writer and IPC format remain unchanged. C4 is out of scope.
