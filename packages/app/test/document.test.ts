import { describe, expect, it } from 'vitest'
import { inspectEditableProject } from '@ledmap/core'
import { addScreen, createProject, setScreenPosition, updateScreenCabinetConfig } from '../src/renderer/project.js'
import {
  createEditorDocument, loadEditorDocument, mutateEditorDocument, savedEditorDocument, serializeEditorDocument,
} from '../src/renderer/document.js'

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

describe('Project document lifecycle', () => {
  it('starts as a clean empty editable project', () => {
    const state = createEditorDocument()
    expect(state.project.screens).toEqual([])
    expect(state.currentFilePath).toBeNull()
    expect(state.dirty).toBe(false)
    expect(createProject(state.project).screens).toEqual([])
  })

  it('round-trips three edited screens and resets dirty only after a successful save', () => {
    let state = createEditorDocument()
    let project = createProject(state.project)
    project = addScreen(project)
    project = addScreen(project)
    project = addScreen(project)
    project = setScreenPosition(project, 'screen-1', -240, 80)
    project = setScreenPosition(project, 'screen-2', 640, -120)
    project = updateScreenCabinetConfig(project, 'screen-3', {
      moduleColumns: 5,
      numbering: 'column',
      direction: 'top-to-bottom',
      snake: false,
    })
    state = mutateEditorDocument(state, project.source)
    expect(state.dirty).toBe(true)

    expect(inspectEditableProject(state.project)).toEqual([])
    const text = serializeEditorDocument(state)
    const stored = JSON.parse(text) as { schemaVersion: number }
    expect(stored.schemaVersion).toBe(2)
    state = savedEditorDocument(state, 'C:\\Projects\\three-screens.ledmap')
    expect(state.dirty).toBe(false)

    const reopened = loadEditorDocument(text, state.currentFilePath!)
    expect(reopened.project).toEqual(state.project)
    expect(reopened.dirty).toBe(false)
    expect(createProject(reopened.project).screens.map(screen => [screen.x, screen.y])).toEqual([
      [-240, 80], [640, -120], [200, 200],
    ])
    expect(createProject(reopened.project).screens[2]!.config).toMatchObject({
      moduleColumns: 5,
      ordering: { numbering: 'column', direction: 'top-to-bottom', snake: false },
    })
  })

  it('keeps the current state available when an Open candidate is invalid', () => {
    const current = mutateEditorDocument(createEditorDocument(), addScreen(createProject()).source)
    expect(() => loadEditorDocument('{', 'broken.ledmap')).toThrow()
    expect(current.project.screens).toHaveLength(1)
    expect(current.dirty).toBe(true)
  })

  it('loads schema v1 and serializes the migrated document as canonical v2', () => {
    const migrated = loadEditorDocument(legacyV1(), 'legacy.ledmap')
    expect(migrated.sourceSchemaVersion).toBe(1)
    expect(migrated.project.screens[0]?.name).toBe('Legacy')
    const saved = serializeEditorDocument(migrated)
    expect(JSON.parse(saved)).toMatchObject({ format: 'ledmap', schemaVersion: 2 })
    expect(loadEditorDocument(saved, 'migrated.ledmap').sourceSchemaVersion).toBe(2)
  })
})
