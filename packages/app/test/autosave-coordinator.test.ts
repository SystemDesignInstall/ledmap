import { afterEach, describe, expect, it, vi } from 'vitest'
import { addScreenV2, setScreenPositionV2 } from '../src/renderer/v2-commands.js'
import { AutosaveCoordinator } from '../src/renderer/autosave-coordinator.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { createProjectSession, markProjectSessionSaved, sessionDirty } from '../src/renderer/project-session.js'
import type { RecoverySaveCommit, RecoverySnapshotRequest } from '../src/shared/ipc.js'

function fixture() {
  const document = new ProjectDocumentController(() => crypto.randomUUID())
  const writes: RecoverySnapshotRequest[] = []
  const saves: RecoverySaveCommit[] = []
  const discarded: string[] = []
  const warnings: unknown[] = []
  const transport = {
    writeRecovery: async (request: RecoverySnapshotRequest) => { writes.push(request) },
    reconcileRecovery: async (request: RecoverySaveCommit) => { saves.push(request) },
    discardRecovery: async (id: string) => { discarded.push(id) },
  }
  const autosave = new AutosaveCoordinator(() => document.session, transport, error => warnings.push(error))
  autosave.attach(document.session, null)
  const edit = (command: Parameters<ProjectDocumentController['transactV2']>[0]) => {
    const before = document.session
    document.transactV2(command)
    autosave.mutation(before, document.session)
  }
  return { document, autosave, writes, saves, discarded, warnings, transport, edit }
}

afterEach(() => { vi.useRealTimers() })

describe('AutosaveCoordinator', () => {
  it('debounces real edits for 2 seconds without changing ProjectSession saved state', async () => {
    vi.useFakeTimers()
    const { document, autosave, writes, edit } = fixture()
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(1_500)
    edit(project => setScreenPositionV2(project, 'screen-1', 10, 20))
    const before = document.session
    await vi.advanceTimersByTimeAsync(1_999)
    expect(writes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await autosave.settle()
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ snapshotRevision: 2, observedSavedRevision: 0, sourcePath: null })
    expect(document.session).toBe(before)
    expect(sessionDirty(document.session)).toBe(true)
    expect(document.session.currentFilePath).toBeNull()
    expect(document.session.sourceSchemaVersion).toBe(5)
  })

  it('does not reschedule a no-op and writes during continuous edits at 30 seconds', async () => {
    vi.useFakeTimers()
    const { autosave, writes, edit } = fixture()
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(1_000)
    edit(project => project)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(writes).toHaveLength(1)
    for (let second = 3; second <= 32; second++) {
      edit(project => setScreenPositionV2(project, 'screen-1', second, 0))
      await vi.advanceTimersByTimeAsync(1_000)
    }
    await autosave.settle()
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes[1]?.snapshotRevision).toBeGreaterThan(1)
  })

  it('bounds retries and re-enables attempts on the next mutation', async () => {
    vi.useFakeTimers()
    const { autosave, warnings, transport, edit } = fixture()
    let calls = 0
    transport.writeRecovery = async () => { calls++; throw new Error('storage unavailable') }
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(20_000)
    await autosave.settle()
    expect(calls).toBe(3)
    expect(warnings).toHaveLength(1)
    edit(project => setScreenPositionV2(project, 'screen-1', 1, 0))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(calls).toBe(4)
  })

  it('serializes writes for one recovery identity and keeps a newer revision', async () => {
    vi.useFakeTimers()
    const { autosave, writes, transport, edit } = fixture()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    transport.writeRecovery = async request => {
      writes.push(request)
      if (writes.length === 1) { entered(); await blocked }
    }
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    await started
    edit(project => setScreenPositionV2(project, 'screen-1', 2, 0))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(writes).toHaveLength(1)
    release()
    await autosave.settle()
    expect(writes).toHaveLength(2)
    expect(writes[1]?.snapshotRevision).toBe(2)
  })

  it('reassociates a newer recovery after Save As and does not remove it on older Save', async () => {
    vi.useFakeTimers()
    const { document, autosave, writes, saves, edit } = fixture()
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    await autosave.settle()
    const older = document.session
    edit(project => setScreenPositionV2(project, 'screen-1', 3, 0))
    document.replace(markProjectSessionSaved(document.session, older.documentId, older.revision, older.stateId, 'C:\\new.ledmap'))
    await autosave.saved(older, document.session, 'a'.repeat(64))
    expect(saves[0]).toMatchObject({ savedRevision: 1, currentRevision: 2, sourcePath: 'C:\\new.ledmap' })
    await vi.advanceTimersByTimeAsync(2_000)
    await autosave.settle()
    expect(writes.at(-1)).toMatchObject({ sourcePath: 'C:\\new.ledmap', baselineSourceSha256: 'a'.repeat(64),
      observedSavedRevision: 1 })
  })

  it('prevents a discarded in-flight operation from resurrecting recovery', async () => {
    vi.useFakeTimers()
    const { autosave, transport, discarded, edit, document } = fixture()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    transport.writeRecovery = async () => { await blocked }
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    const discarding = autosave.discard()
    document.replace(createProjectSession('replacement'))
    release()
    await discarding
    expect(discarded).toHaveLength(1)
    expect(document.session.documentId).toBe('replacement')
  })

  it('cancels a pending dirty snapshot and clears committed recovery on Undo to saved state', async () => {
    vi.useFakeTimers()
    const { document, autosave, writes, discarded, edit } = fixture()
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    await autosave.settle()
    const before = document.session
    document.undo()
    autosave.mutation(before, document.session)
    await autosave.settle()
    expect(discarded).toEqual([autosave.recoveryId])
    expect(sessionDirty(document.session)).toBe(false)
    const written = writes.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(writes).toHaveLength(written)
    const clean = document.session
    document.redo()
    autosave.mutation(clean, document.session)
    await vi.advanceTimersByTimeAsync(2_000)
    await autosave.settle()
    expect(writes.at(-1)?.snapshotRevision).toBe(document.session.revision)
  })

  it('orders clean cleanup after an in-flight write and keeps a new dirty state', async () => {
    vi.useFakeTimers()
    const { document, autosave, transport, discarded, writes, edit } = fixture()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    transport.writeRecovery = async request => { writes.push(request); if (writes.length === 1) await blocked }
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    const dirty = document.session
    document.undo()
    autosave.mutation(dirty, document.session)
    expect(discarded).toHaveLength(0)
    release()
    await autosave.settle()
    expect(discarded).toHaveLength(1)
    const clean = document.session
    document.redo()
    autosave.mutation(clean, document.session)
    await vi.advanceTimersByTimeAsync(2_000)
    await autosave.settle()
    expect(writes.at(-1)?.snapshotRevision).toBe(document.session.revision)
  })

  it('does not delete recovery if the project becomes dirty before clean cleanup starts', async () => {
    vi.useFakeTimers()
    const { document, autosave, transport, discarded, edit } = fixture()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    transport.writeRecovery = async () => { await blocked }
    edit(project => addScreenV2(project))
    await vi.advanceTimersByTimeAsync(2_000)
    const dirty = document.session
    document.undo()
    autosave.mutation(dirty, document.session)
    const clean = document.session
    document.redo()
    autosave.mutation(clean, document.session)
    release()
    await autosave.settle()
    expect(discarded).toHaveLength(0)
  })

  it('reconciles a long grouped gesture that autosaved before returning to its clean start', async () => {
    vi.useFakeTimers()
    const { document, autosave, writes, discarded, edit } = fixture()
    edit(project => addScreenV2(project))
    const saved = document.session
    await document.save(false, async () => ({ canceled: false, filePath: 'project.ledmap' }))
    await autosave.saved(saved, document.session, 'a'.repeat(64))
    const group = document.beginHistoryGroup()
    for (let x = 1; x <= 31; x++) {
      const before = document.session
      document.transactV2(project => setScreenPositionV2(project, 'screen-1', x, 0), group)
      autosave.mutation(before, document.session)
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(writes.length).toBeGreaterThan(0)
    const beforeReturn = document.session
    document.transactV2(project => setScreenPositionV2(project, 'screen-1', 0, 0), group)
    document.endHistoryGroup(group)
    autosave.mutation(beforeReturn, document.session)
    await autosave.settle()
    expect(sessionDirty(document.session)).toBe(false)
    expect(document.canUndo).toBe(true)
    expect(discarded.at(-1)).toBe(autosave.recoveryId)
    const count = writes.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(writes).toHaveLength(count)
  })
})
