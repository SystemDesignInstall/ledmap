# PERSIST-2 — Autosave / Recovery

Recovery is separate app persistence metadata. It is not a Save, a Project Model field, or part of the `.ledmap` schema. The runtime `ProjectSession<LedMapProjectV2>` remains the only mutable project owner.

## PERSIST-2A: storage and scheduling

A real revision change starts a 2-second idle debounce and a 30-second maximum dirty interval. A no-op does not move either timer. A committed recovery snapshot restarts the maximum interval for subsequent changes. Failed writes retry after 2 and 5 seconds; after three failed attempts, retries stop until another real mutation and one non-modal diagnostic is shown.

The main process owns `userData/recovery/v1`. The renderer sends a recovery UUID, a fresh session epoch UUID, the already serialized native V3 payload, revisions, source metadata and its baseline hash. It cannot select a manifest or payload path. Files are stored as a versioned, strictly parsed manifest and an app-named V3 payload. Source paths are metadata and are never recovery write targets.

For an update, the store staged-writes a uniquely named payload using PERSIST-1, reads it back, verifies SHA-256 and `loadProjectV3()`, then staged-writes the manifest pointing to it. Only after that manifest commit may the old payload be removed. An orphan payload without a committed manifest is not a recovery candidate. The store serializes operations per recovery UUID; unrelated destinations are independent.

Autosave never calls `markProjectSessionSaved()` and never changes `revision`, `savedRevision`, `sourceSchemaVersion`, `currentFilePath` or dirty. A successful explicit Save re-associates the recovery baseline with its exact written-byte hash and path. A Save covering the current revision may clear recovery; a Save of an older revision keeps newer recovery and schedules the still-dirty current revision. Save As follows the same rule with the new source path.

## PERSIST-2B: discovery and lifecycle

At startup, only manifests with a safe identity and payload basename, matching payload hash and valid native V3 structural load are candidates. Candidates are ordered by `updatedAt` descending and then UUID. Disk timestamps never decide correctness. An unchanged source hash with `snapshotRevision > observedSavedRevision` is UNSAVED; a changed/missing source is CONFLICT; matching source and payload bytes or a covered revision is REDUNDANT; bad manifests/payloads are INVALID and do not stop startup. INVALID and orphan files are not deleted automatically.

The user can Recover, Discard or Later for each candidate. Recover opens a new dirty untitled V3 `ProjectSession` (`revision=1`, `savedRevision=0`) with a new runtime document ID, while retaining the same recovery UUID and the disk snapshot. The original file is never opened for writing by Recover. Other candidates remain available. Explicit successful Save/Save As covering the recovered revision or explicit Discard removes recovery; a second crash before Save still finds it.

Normal New/Open/Close Discard stops timers, waits for an in-flight operation and only then removes the committed recovery. Cancel leaves it untouched. A graceful close uses a renderer/main handshake; forced termination, power loss and a crash before the debounce fires are outside the guarantee. Recovery files stay under local app data; LedMAP does not upload them. OS-managed backup of `userData` is outside the app's control.
