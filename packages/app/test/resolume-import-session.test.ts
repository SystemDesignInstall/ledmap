import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2 } from '@ledmap/core'
import { createRef001TestProject } from './project-fixtures.js'
import { decodeResolumeFile, ResolumeImportSession } from '../src/shared/resolume-import-session.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { createProjectSession, loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'

function fixture() {
  const project = convertEditableProjectToV2(createRef001TestProject().source)
  const session = new ResolumeImportSession()
  const xml = readFileSync(new URL('./fixtures/resolume/ledmap-native-golden.xml', import.meta.url), 'utf8')
  const source = session.inspect(xml)
  const settings = { frame: { x: -40, y: -20, width: 1200, height: 1000 },
    bindings: source.screens[0]!.slices.map((slice, index) => ({ sourceSliceId: slice.id, screenId: String(project.design.screens[index]!.id) })),
    rasterOverrides: {} }
  const stamp = { documentId: 'import', revision: 0 }
  return { project, session, xml, settings, stamp }
}

describe('native import preview session', () => {
  it('strictly decodes UTF-8, keeps Unicode names and rejects oversized or invalid bytes', () => {
    const { xml } = fixture()
    expect(decodeResolumeFile(new TextEncoder().encode(xml))).toBe(xml)
    expect(() => decodeResolumeFile(new Uint8Array([0xc0, 0xaf]))).toThrow(/UTF-8/)
    expect(() => decodeResolumeFile(new Uint8Array(2 * 1024 * 1024 + 1))).toThrow(/2 MiB/)
  })

  it('previews exact crops without touching the project, then commits one saveable Undo step', () => {
    const { project, session, settings } = fixture()
    const controller = new ProjectDocumentController(() => 'import')
    controller.replace({ ...createProjectSession('import'), project })
    const original = controller.session
    const originallyFrozen = Object.isFrozen(project.design)
    const preview = session.prepare(project, original, settings)
    expect(preview.addedOutputs).toBe(1)
    expect(preview.mappings.map(mapping => mapping.screenRect)).toEqual([
      { x: 20, y: 30, width: 128, height: 64 }, { x: 5, y: 6, width: 64, height: 32 },
    ])
    expect(controller.session).toBe(original)
    expect(controller.historyDepth).toBe(0)
    expect(Object.isFrozen(project.design)).toBe(originallyFrozen)
    controller.transactV2(project => session.apply(project, controller.session))
    const imported = controller.session.project
    expect(imported.content.mediaOutputs).toHaveLength(1)
    expect(imported.content.outputMappings[1]!.enabled).toBe(false)
    expect(imported.design).toEqual(project.design)
    expect(imported.hardware).toEqual(project.hardware)
    expect(controller.historyDepth).toBe(1)
    expect(loadProjectSession(serializeProjectSession(controller.session), 'import.ledmap', 'reopen').project).toEqual(imported)
    expect(controller.undo()).toBe(true)
    expect(controller.session.project).toEqual(project)
    expect(controller.redo()).toBe(true)
    expect(controller.session.project).toEqual(imported)
    expect(() => session.apply(imported, controller.session)).toThrow(/Preview/)
  })

  it.each([{ documentId: 'other', revision: 0 }, { documentId: 'import', revision: 1 }])('rejects a stale document stamp %j', stamp => {
    const { project, session, settings, stamp: original } = fixture()
    session.prepare(project, original, settings)
    expect(() => session.apply(project, stamp)).toThrow(/project changed/)
    expect(project.content.mediaOutputs).toEqual([])
    expect(session.preview).toBeNull()
  })

  it('invalidates a viewed proposal when bindings/settings change or inspection is cleared', () => {
    const { project, session, settings, stamp, xml } = fixture()
    session.prepare(project, stamp, settings)
    session.invalidate()
    expect(session.document).not.toBeNull()
    expect(() => session.apply(project, stamp)).toThrow(/Preview/)
    session.prepare(project, stamp, settings)
    session.clear()
    expect(session.document).toBeNull()
    expect(() => session.apply(project, stamp)).toThrow(/Preview/)
    session.inspect(xml)
    expect(() => session.apply(project, stamp)).toThrow(/Preview/)
  })

  it('copies operator settings without freezing them or accepting later mutation as reviewed intent', () => {
    const { project, session, settings, stamp } = fixture()
    session.prepare(project, stamp, settings)
    expect(Object.isFrozen(settings.frame)).toBe(false)
    settings.frame.x = -39
    settings.bindings[0]!.screenId = 'wrong'
    expect(session.apply(project, stamp).content.outputMappings[0]!.screenRect.x).toBe(20)
  })

  it('recomputes and rejects changed import intent even if a caller reuses an old stamp', () => {
    const { project, session, settings, stamp } = fixture()
    session.prepare(project, stamp, settings)
    const changed = { ...project, design: { ...project.design, composition: { placements:
      project.design.composition.placements.map((placement, index) => index === 0 ? { ...placement, x: placement.x + 1 } : placement) } } }
    expect(() => session.apply(changed, stamp)).toThrow(/result changed/)
    expect(changed.content.mediaOutputs).toEqual([])
  })

  it('retains inspection after failed binding and discards a prepared proposal after malformed replacement', () => {
    const { project, session, settings, stamp } = fixture()
    const source = session.document
    expect(() => session.prepare(project, stamp, { ...settings, bindings: [] })).toThrow(/binding/)
    expect(session.document).toBe(source)
    expect(session.preview).toBeNull()
    session.prepare(project, stamp, settings)
    expect(() => session.inspect('<XmlState>')).toThrow()
    expect(session.document).toBeNull()
    expect(() => session.apply(project, stamp)).toThrow(/Preview/)
  })

  it('retains an explicitly supplied raster for a source ID that resembles an object prototype key', () => {
    const { project, session, settings, stamp, xml } = fixture()
    session.inspect(xml.replace(/(<Screen[^>]*uniqueId=")\d+/, '$1__proto__')
      .replace(/(<OutputDeviceVirtual\b[^>]*?) width="\d+" height="\d+"/, '$1'))
    const rasterOverrides = Object.fromEntries([['__proto__', { width: 800, height: 600 }]])
    session.prepare(project, stamp, { ...settings, rasterOverrides })
    expect(session.apply(project, stamp).content.mediaOutputs[0]!.resolution).toEqual({ width: 800, height: 600 })
    expect(Object.getPrototypeOf(rasterOverrides)).toBe(Object.prototype)
  })
})
