import { describe, expect, it } from 'vitest'
import { createProjectV2, loadEditableProject, loadProjectV3, serializeEditableProject } from '@ledmap/core'
import { addScreenV2, setScreenPositionV2 } from '../src/renderer/v2-commands.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import {
  createProjectSession,
  serializeProjectSession,
  sessionDirty,
} from '../src/renderer/project-session.js'

function controller(): ProjectDocumentController {
  let serial = 0
  return new ProjectDocumentController(() => `document-${++serial}`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill
    reject = fail
  })
  return { promise, resolve, reject }
}

function legacyV1(): string {
  return JSON.stringify({
    format: 'ledmap',
    schemaVersion: 1,
    project: {
      mapping: {
        inputCanvas: { id: 'input', resolution: { width: 2, height: 3 } },
        screen: { id: 'screen', name: 'Legacy', resolution: { width: 2, height: 3 }, mappingRegions: ['region'], cabinetGrids: ['grid'] },
        grid: {
          id: 'grid', screen: 'screen', name: 'Grid', columns: 1, rows: 1, cabinetWidth: 100, cabinetHeight: 100,
          ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
        },
        region: { id: 'region', inputCanvas: 'input', screen: 'screen', grid: 'grid', position: { x: 0, y: 0 }, size: { width: 2, height: 3 } },
        hardwareTopology: {
          processors: [{ id: 'P', name: 'Processor', portCount: 1 }],
          ports: [{ id: 'P:0', processor: 'P', index: 0, receiverCapacity: 1 }],
          receivers: [{ id: 'R', processor: 'P', port: 'P:0', index: 0, cabinets: ['C'], pixelCapacity: 6 }],
          cabinets: [{
            id: 'C', grid: 'grid', column: 0, row: 0, origin: { x: 0, y: 0 }, width: 100, height: 100,
            pixelWidth: 2, pixelHeight: 3, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
          }],
          modules: [{ id: 'M', cabinet: 'C', column: 0, row: 0, width: 100, height: 100, pixelWidth: 2, pixelHeight: 3 }],
          processorOrder: ['P'],
          receiverOrder: [{ port: 'P:0', receivers: ['R'] }],
        },
      },
      rules: [],
    },
    extensions: {},
  })
}

function legacyV2(): string {
  return serializeEditableProject({ project: loadEditableProject(legacyV1()).project })
}

describe('ProjectSession document lifecycle', () => {
  it('starts with one clean V2 owner and saves native schema v3', async () => {
    const document = controller()
    expect(document.session.project.design.screens).toEqual([])
    expect(sessionDirty(document.session)).toBe(false)
    expect(document.session.sourceSchemaVersion).toBe(3)
    document.transactV2(project => addScreenV2(project))
    expect(document.session.revision).toBe(1)
    expect(sessionDirty(document.session)).toBe(true)
    const saved = await document.save(false, async request => {
      expect(JSON.parse(request.text)).toMatchObject({ format: 'ledmap', schemaVersion: 3 })
      return { canceled: false, filePath: 'project.ledmap' }
    })
    expect(saved).toBe(true)
    expect(document.session.currentFilePath).toBe('project.ledmap')
    expect(document.session.savedRevision).toBe(1)
    expect(sessionDirty(document.session)).toBe(false)
  })

  it('opens v1, v2 and v3 through version dispatch without replacing the session on invalid input', async () => {
    const document = controller()
    expect(await document.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV1() }))).toBe('opened')
    expect(document.session.sourceSchemaVersion).toBe(1)
    expect(document.session.project.design.screens[0]?.name).toBe('Legacy')
    const v3 = serializeProjectSession(document.session)
    expect(JSON.parse(v3)).toMatchObject({ format: 'ledmap', schemaVersion: 3 })
    expect(await document.open(async () => ({ canceled: false, filePath: 'next.ledmap', text: legacyV2() }))).toBe('opened')
    expect(document.session.sourceSchemaVersion).toBe(2)
    expect(await document.open(async () => ({ canceled: false, filePath: 'new.ledmap', text: v3 }))).toBe('opened')
    expect(document.session.sourceSchemaVersion).toBe(3)
    const before = document.session
    await expect(document.open(async () => ({ canceled: false, filePath: 'bad.ledmap', text: '{' }))).rejects.toThrow()
    expect(document.session).toBe(before)
  })

  it('keeps later edits dirty when Save finishes with an earlier revision', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    const write = deferred<{ canceled: boolean; filePath: string }>()
    const saving = document.save(false, () => write.promise)
    document.transactV2(project => setScreenPositionV2(project, 'screen-1', 50, 60))
    expect(document.session.revision).toBe(2)
    write.resolve({ canceled: false, filePath: 'first.ledmap' })
    expect(await saving).toBe(true)
    expect(document.session.savedRevision).toBe(1)
    expect(sessionDirty(document.session)).toBe(true)
  })

  it('queues a second Save with the newest snapshot after Save, edit, Save', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    const firstWrite = deferred<{ canceled: boolean; filePath: string }>()
    const secondWrite = deferred<{ canceled: boolean; filePath: string }>()
    const secondStarted = deferred<void>()
    const requests: string[] = []
    const write = (request: { text: string }) => {
      requests.push(request.text)
      if (requests.length === 1) return firstWrite.promise
      secondStarted.resolve()
      return secondWrite.promise
    }
    const first = document.save(false, write)
    document.transactV2(project => setScreenPositionV2(project, 'screen-1', 80, 90))
    const second = document.save(false, write)
    expect(requests).toHaveLength(1)
    firstWrite.resolve({ canceled: false, filePath: 'project.ledmap' })
    expect(await first).toBe(true)
    await secondStarted.promise
    expect(requests).toHaveLength(2)
    const written = JSON.parse(requests[1]!) as { project: { design: { composition: { placements: { x: number }[] } } } }
    expect(written.project.design.composition.placements[0]?.x).toBe(80)
    secondWrite.resolve({ canceled: false, filePath: 'project.ledmap' })
    expect(await second).toBe(true)
    expect(document.session.savedRevision).toBe(2)
    expect(sessionDirty(document.session)).toBe(false)
  })

  it('keeps Save As path while an edit during the write remains dirty', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    const write = deferred<{ canceled: boolean; filePath: string }>()
    const saving = document.save(true, () => write.promise)
    document.transactV2(project => setScreenPositionV2(project, 'screen-1', 20, 30))
    write.resolve({ canceled: false, filePath: 'new-name.ledmap' })
    expect(await saving).toBe(true)
    expect(document.session.currentFilePath).toBe('new-name.ledmap')
    expect(document.session.savedRevision).toBe(1)
    expect(sessionDirty(document.session)).toBe(true)
  })

  it('leaves the session unchanged on failed Save and canceled Save As', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    const before = document.session
    await expect(document.save(false, async () => { throw new Error('disk failed') })).rejects.toThrow('disk failed')
    expect(document.session).toBe(before)
    expect(await document.save(true, async () => ({ canceled: true }))).toBe(false)
    expect(document.session).toBe(before)
  })

  it('saves V2-only data natively without a compatibility projection', async () => {
    const document = controller()
    const original = document.session
    document.replace({
      ...original,
      project: createProjectV2({ ...original.project, metadata: { name: 'V2-only name' } }),
    })
    let writerCalled = false
    expect(await document.save(false, async request => {
      writerCalled = true
      expect(loadProjectV3(request.text).project.metadata).toEqual({ name: 'V2-only name' })
      return { canceled: false, filePath: 'project.ledmap' }
    })).toBe(true)
    expect(writerCalled).toBe(true)
    expect(document.session.savedRevision).toBe(0)
  })

  it('ignores stale Save and Open callbacks after a document replacement or edit', async () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    const write = deferred<{ canceled: boolean; filePath: string }>()
    const saving = document.save(false, () => write.promise)
    await Promise.resolve()
    document.replace(createProjectSession('replacement'))
    write.resolve({ canceled: false, filePath: 'old.ledmap' })
    expect(await saving).toBe(false)
    expect(document.session.documentId).toBe('replacement')
    expect(document.session.currentFilePath).toBeNull()

    const read = deferred<{ canceled: boolean; filePath: string; text: string }>()
    const opening = document.open(() => read.promise)
    document.transactV2(project => addScreenV2(project))
    const changed = document.session
    read.resolve({ canceled: false, filePath: 'old.ledmap', text: legacyV1() })
    expect(await opening).toBe('stale')
    expect(document.session).toBe(changed)
  })

  it('discards an Open result when Save changes the session path during the dialog', async () => {
    const document = controller()
    const read = deferred<{ canceled: boolean; filePath: string; text: string }>()
    const opening = document.open(() => read.promise)
    expect(await document.save(false, async () => ({ canceled: false, filePath: 'saved.ledmap' }))).toBe(true)
    const afterSave = document.session
    read.resolve({ canceled: false, filePath: 'other.ledmap', text: legacyV1() })
    expect(await opening).toBe('stale')
    expect(document.session).toBe(afterSave)
    expect(document.session.currentFilePath).toBe('saved.ledmap')
  })

  it('upgrades a legacy file only after explicit choice, then saves without asking again', async () => {
    const document = controller()
    await document.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV1() }))
    let prompts = 0
    expect(await document.save(false, async request => {
      expect(request.saveAs).toBe(false)
      expect(request.currentFilePath).toBe('legacy.ledmap')
      expect(loadProjectV3(request.text).project).toEqual(document.session.project)
      return { canceled: false, filePath: 'legacy.ledmap' }
    }, async () => { prompts += 1; return 'upgrade' })).toBe(true)
    expect(document.session.sourceSchemaVersion).toBe(3)
    expect(await document.save(false, async request => {
      expect(request.saveAs).toBe(false)
      return { canceled: false, filePath: 'legacy.ledmap' }
    }, async () => { prompts += 1; return 'cancel' })).toBe(true)
    expect(prompts).toBe(1)
  })

  it('routes legacy Save As to a new path while protecting the original', async () => {
    const document = controller()
    await document.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV2() }))
    expect(await document.save(false, async request => {
      expect(request).toMatchObject({ currentFilePath: 'legacy.ledmap', saveAs: true, preserveOriginal: true })
      return { canceled: false, filePath: 'upgraded.ledmap' }
    }, async () => 'save-as')).toBe(true)
    expect(document.session.currentFilePath).toBe('upgraded.ledmap')
    expect(document.session.sourceSchemaVersion).toBe(3)

    const direct = controller()
    await direct.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV2() }))
    expect(await direct.save(true, async request => {
      expect(request).toMatchObject({ currentFilePath: 'legacy.ledmap', saveAs: true, preserveOriginal: true })
      return { canceled: false, filePath: 'another.ledmap' }
    })).toBe(true)
  })

  it('leaves legacy state untouched on canceled or failed upgrade', async () => {
    const document = controller()
    await document.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV1() }))
    const before = document.session
    let writerCalled = false
    expect(await document.save(false, async () => {
      writerCalled = true
      return { canceled: false, filePath: 'legacy.ledmap' }
    }, async () => 'cancel')).toBe(false)
    expect(writerCalled).toBe(false)
    expect(document.session).toBe(before)
    await expect(document.save(false, async () => { throw new Error('disk failed') }, async () => 'upgrade'))
      .rejects.toThrow('disk failed')
    expect(document.session).toBe(before)
  })

  it('keeps edits dirty and ignores another document during an async upgrade confirmation', async () => {
    const document = controller()
    await document.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV1() }))
    const choice = deferred<'upgrade' | 'save-as' | 'cancel'>()
    const saving = document.save(false, async request => {
      expect(loadProjectV3(request.text).project.design.composition.placements[0]?.x).toBe(0)
      return { canceled: false, filePath: 'legacy.ledmap' }
    }, () => choice.promise)
    document.transactV2(project => setScreenPositionV2(project, 'screen', 50, 60))
    choice.resolve('upgrade')
    expect(await saving).toBe(true)
    expect(document.session.sourceSchemaVersion).toBe(3)
    expect(document.session.savedRevision).toBe(0)
    expect(sessionDirty(document.session)).toBe(true)

    const nextChoice = deferred<'upgrade' | 'save-as' | 'cancel'>()
    const legacy = controller()
    await legacy.open(async () => ({ canceled: false, filePath: 'legacy.ledmap', text: legacyV1() }))
    let writerCalled = false
    const pending = legacy.save(false, async () => {
      writerCalled = true
      return { canceled: false, filePath: 'legacy.ledmap' }
    }, () => nextChoice.promise)
    legacy.replace(createProjectSession('replacement'))
    nextChoice.resolve('upgrade')
    expect(await pending).toBe(false)
    expect(writerCalled).toBe(false)
    expect(legacy.session.documentId).toBe('replacement')
  })
})
