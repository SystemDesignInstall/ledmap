import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId, asCabinetId, asModuleId, asPortId, asProcessorId, asReceiverId, asScreenId,
  inspectEditableProject, type EditableProject,
} from '../../src/index.js'

function emptyProject(): EditableProject {
  return {
    inputCanvas: null,
    screens: [],
    cabinetGrids: [],
    mappingRegions: [],
    hardwareTopology: {
      processors: [], ports: [], receivers: [], cabinets: [], modules: [], processorOrder: [], receiverOrder: [],
    },
    rules: [],
    editorLayout: { screenPositions: [] },
  }
}

function partialProject(): EditableProject {
  const screen = asScreenId('screen-1')
  const grid = asCabinetGridId('grid-1')
  return {
    ...emptyProject(),
    screens: [{
      id: screen, name: 'Main', resolution: { width: 512, height: 384 },
      mappingRegions: [], cabinetGrids: [grid],
    }],
    cabinetGrids: [{
      id: grid, screen, name: 'Cabinet Grid', columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128,
      ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: true },
    }],
    editorLayout: { screenPositions: [{ screen, position: { x: -120, y: 80 } }] },
  }
}

describe('Editable project integrity', () => {
  it('accepts empty and partial editor source without requiring mapping or hardware', () => {
    expect(inspectEditableProject(emptyProject())).toEqual([])
    expect(inspectEditableProject(partialProject())).toEqual([])
  })

  it('accepts multiple screens at signed project positions', () => {
    const first = partialProject()
    const screen = asScreenId('screen-2')
    const grid = asCabinetGridId('grid-2')
    const project: EditableProject = {
      ...first,
      screens: [...first.screens, {
        id: screen, name: 'Side', resolution: { width: 128, height: 128 }, mappingRegions: [], cabinetGrids: [grid],
      }],
      cabinetGrids: [...first.cabinetGrids, {
        id: grid, screen, name: 'Cabinet Grid', columns: 1, rows: 1, cabinetWidth: 128, cabinetHeight: 128,
        ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
      }],
      editorLayout: { screenPositions: [
        ...first.editorLayout.screenPositions,
        { screen, position: { x: 700, y: -256 } },
      ] },
    }
    expect(inspectEditableProject(project)).toEqual([])
  })

  it('diagnoses dangling and inverse parent references', () => {
    const project = partialProject()
    const broken: EditableProject = {
      ...project,
      cabinetGrids: [{ ...project.cabinetGrids[0]!, screen: asScreenId('missing') }],
    }
    const diagnostics = inspectEditableProject(broken)
    expect(diagnostics.map(item => item.code)).toContain('EDITOR_UNKNOWN_REFERENCE')
    expect(diagnostics.map(item => item.code)).toContain('EDITOR_PARENT_MISMATCH')
  })

  it('requires exactly one placement for each screen while allowing negative coordinates', () => {
    const project = partialProject()
    const duplicate: EditableProject = {
      ...project,
      editorLayout: { screenPositions: [
        ...project.editorLayout.screenPositions,
        { screen: project.screens[0]!.id, position: { x: -1, y: -2 } },
      ] },
    }
    expect(inspectEditableProject(duplicate).map(item => item.code)).toContain('EDITOR_DUPLICATE_PLACEMENT')

    const missing: EditableProject = { ...project, editorLayout: { screenPositions: [] } }
    expect(inspectEditableProject(missing).map(item => item.code)).toContain('EDITOR_MISSING_PLACEMENT')
  })

  it('rejects duplicate cabinet cells and one cabinet assigned to multiple receivers', () => {
    const project = partialProject()
    const grid = project.cabinetGrids[0]!.id
    const processor = asProcessorId('P')
    const port = asPortId('P:0')
    const cabinet = asCabinetId('C01')
    const otherCabinet = asCabinetId('C02')
    const receiverA = asReceiverId('R1')
    const receiverB = asReceiverId('R2')
    const withHardware: EditableProject = {
      ...project,
      hardwareTopology: {
        processors: [{ id: processor, name: 'Processor', portCount: 1 }],
        ports: [{ id: port, processor, index: 0, receiverCapacity: 2 }],
        receivers: [
          { id: receiverA, processor, port, index: 0, cabinets: [cabinet] },
          { id: receiverB, processor, port, index: 1, cabinets: [cabinet] },
        ],
        cabinets: [
          {
            id: cabinet, grid, column: 0, row: 0, origin: { x: 0, y: 0 }, width: 128, height: 128,
            pixelWidth: 128, pixelHeight: 128, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
          },
          {
            id: otherCabinet, grid, column: 0, row: 0, origin: { x: 0, y: 0 }, width: 128, height: 128,
            pixelWidth: 128, pixelHeight: 128, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
          },
        ],
        modules: [{
          id: asModuleId('M1'), cabinet, column: 0, row: 0, localX: 0, localY: 0,
          width: 128, height: 128, pixelWidth: 128, pixelHeight: 128,
        }],
        processorOrder: [processor],
        receiverOrder: [{ port, receivers: [receiverA, receiverB] }],
      },
    }
    const diagnostics = inspectEditableProject(withHardware)
    expect(diagnostics.map(item => item.code)).toContain('EDITOR_DUPLICATE_CELL')
    expect(diagnostics.some(item => item.code === 'EDITOR_DUPLICATE_REFERENCE' && item.message.includes('more than one Receiver'))).toBe(true)
  })
})
