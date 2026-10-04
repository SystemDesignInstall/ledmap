# PERSIST-1 — Staged / Failure-Resistant `.ledmap` Save

PERSIST-1 changes only the production project-file write after V3 serialization. It does not change the V3 schema, parser, serializer, migrations, export writer, or `ProjectSession` ownership rules.

## Write sequence

The main process resolves the destination, rejects an existing symbolic link or non-regular file, and creates a unique `.tmp` file exclusively in the destination directory. It writes the already serialized UTF-8 payload, checks the temp length, syncs and closes the temp handle, rechecks destination state, then replaces the destination with `fs.rename(temp, destination)`. It never opens or unlinks the destination before replacement. Main-process writes to equivalent resolved destination paths are queued; independent paths are not.

Handled failures close the handle and remove the writer's own temp when possible. Cleanup errors are secondary to the Save error. A process crash may leave a temp; PERSIST-1 has no startup sweeping, backup, recovery, or autosave behavior.

## Guaranteed by our algorithm

- Before replacement, LedMAP does not open or truncate an existing destination. Handled temp create/write/sync/close failures leave its bytes untouched by this code path.
- A successful replacement uses a completely written and synced temp payload.
- A failed Save does not advance `savedRevision`, `sourceSchemaVersion`, or `currentFilePath`; successful Save marks only the written snapshot revision. Later edits remain dirty, and stale completions cannot update another document.
- For an absent destination, failures before replacement do not create a `.ledmap` at that destination.

## OS / filesystem assumptions

- Same-directory temp and destination are expected to be on one volume. The final replacement uses the platform's Node/libuv `rename` behavior.
- `FileHandle.sync()` requests a flush from the OS. Actual durability depends on the filesystem, storage device, and failure mode.
- The in-process queue covers this application's writes, not other processes. A final destination-state check detects some external creation races, but cannot eliminate the interval between check and rename.
- Replacing an existing destination may change its filesystem metadata or access controls because the new file is the staged temp. Filesystem permission and sharing errors are surfaced as Save errors.

## Not guaranteed by PERSIST-1

- Survival of arbitrary power loss with either the old or the new file intact at every instruction.
- Identical atomicity or durability on network and unusual filesystems.
- Byte-for-byte preservation of an existing destination for every possible OS-level replacement failure.
- Protection from an external process creating the destination after the final state check but before `rename`; Node's replacement operation can overwrite that file.
- Preservation of symlink-following Save behavior: existing symlink destinations are rejected explicitly.
- Automatic cleanup of orphan temps after a process crash, rollback copies, file history, or recovery UI.
