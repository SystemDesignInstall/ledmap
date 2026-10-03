import { describe, expect, it } from 'vitest'
import { addScreenV2, renameScreenV2, setScreenPositionV2 } from '../src/renderer/v2-commands.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { recoverProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'

function controller(): ProjectDocumentController {
  let serial = 0
  return new ProjectDocumentController(() => `document-${++serial}`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(fulfill => { resolve = fulfill })
  return { promise, resolve }
}

describe('Project document history', () => {
  it('keeps revision monotonic while Undo and Redo restore earlier state identity', async () => {
    const document = controller()
    const initialId = document.session.stateId
    document.transactV2(project => addScreenV2(project))
    const editedId = document.session.stateId
    expect([document.session.revision, sessionDirty(document.session), document.canUndo]).toEqual([1, true, true])
    expect(document.undo()).toBe(true)
    expect([document.session.revision, document.session.stateId, sessionDirty(document.session)]).toEqual([2, initialId, false])
    expect(document.redo()).toBe(true)
    expect([document.session.revision, document.session.stateId, sessionDirty(document.session)]).toEqual([3, editedId, true])
    await document.save(false, async () => ({ canceled: false, filePath: 'project.ledmap' }))
    expect(document.session.savedStateId).toBe(editedId)
    expect(sessionDirty(document.session)).toBe(false)
    document.undo()
    expect(sessionDirty(document.session)).toBe(true)
    document.redo()
    expect(sessionDirty(document.session)).toBe(false)
  })

  it('marks the written snapshot state, not the state current when Save completes', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    document.transactV2(project => renameScreenV2(project, 'screen-1', 'Saved'))
    const snapshot = document.session
    const write = deferred<{ canceled: false; filePath: string }>()
    const saving = document.save(false, async () => write.promise)
    document.undo()
    expect(sessionDirty(document.session)).toBe(true)
    write.resolve({ canceled: false, filePath: 'project.ledmap' })
    expect(await saving).toBe(true)
    expect(document.session.savedRevision).toBe(snapshot.revision)
    expect(document.session.savedStateId).toBe(snapshot.stateId)
    expect(sessionDirty(document.session)).toBe(true)
    document.redo()
    expect(sessionDirty(document.session)).toBe(false)
  })

  it('does not record no-ops or invalid mutations and clears redo only for a real branch', () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    document.undo()
    const before = document.session
    document.transactV2(project => project)
    expect(document.session).toBe(before)
    expect(document.canRedo).toBe(true)
    expect(() => document.transactV2(() => ({ ...before.project, design: {
      ...before.project.design,
      screens: [{ id: 'missing' }] as unknown as typeof before.project.design.screens,
    } }))).toThrow()
    expect(document.session).toBe(before)
    expect(document.canRedo).toBe(true)
    document.transactV2(project => addScreenV2(project))
    expect(document.canRedo).toBe(false)
  })

  it('bounds retained states at 32 while keeping the saved identity token', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    await document.save(false, async () => ({ canceled: false, filePath: 'project.ledmap' }))
    const savedId = document.session.savedStateId
    for (let x = 1; x <= 40; x++) document.transactV2(project => setScreenPositionV2(project, 'screen-1', x, 0))
    expect(document.historyDepth).toBe(32)
    expect(document.session.savedStateId).toBe(savedId)
    for (let index = 0; index < 32; index++) expect(document.undo()).toBe(true)
    expect(document.undo()).toBe(false)
    expect(document.session.savedStateId).toBe(savedId)
    expect(sessionDirty(document.session)).toBe(true)
  })

  it('starts New, Open and Recover with empty history and preserves import-only extensions', async () => {
    const document = controller()
    const extended = JSON.parse(serializeProjectSession(document.session)) as { extensions: Record<string, unknown> }
    extended.extensions = { vendor: { retained: true } }
    const text = JSON.stringify(extended)
    expect(await document.open(async () => ({ canceled: false, filePath: 'extended.ledmap', text }))).toBe('opened')
    const extensions = document.session.extensions
    document.transactV2(project => addScreenV2(project))
    document.undo()
    document.redo()
    expect(document.session.extensions).toBe(extensions)
    expect(JSON.parse(serializeProjectSession(document.session)).extensions).toEqual(extended.extensions)
    const recovered = recoverProjectSession(serializeProjectSession(document.session), 'recovered')
    document.replace(recovered)
    expect([document.canUndo, document.canRedo, sessionDirty(document.session)]).toEqual([false, false, true])
    expect(document.session.savedStateId).toBeNull()
  })
})
