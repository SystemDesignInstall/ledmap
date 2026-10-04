import {
  asCabinetGridId,
  asCabinetId,
  asInputCanvasId,
  asMappingRegionId,
  asModuleId,
  asPortId,
  asProcessorId,
  asScreenId,
  editableProjectFromValidatedProject,
  type EditableProject,
} from '../../src/index.js'
import { minimalProject } from './fixtures.js'

export function fullEditableProject(x = 0, y = 0): EditableProject {
  return editableProjectFromValidatedProject(minimalProject(), { x, y })
}

export function layoutOnlyProject(): EditableProject {
  const project = fullEditableProject(-20, 30)
  return {
    ...project,
    inputCanvas: null,
    screens: project.screens.map(screen => ({ ...screen, mappingRegions: [] })),
    mappingRegions: [],
    hardwareTopology: {
      ...project.hardwareTopology,
      processors: [],
      ports: [],
      receivers: [],
      processorOrder: [],
      receiverOrder: [],
    },
  }
}

export function bareLayoutProject(): EditableProject {
  const project = layoutOnlyProject()
  return {
    ...project,
    hardwareTopology: {
      ...project.hardwareTopology,
      cabinets: [],
      modules: [],
    },
  }
}

export function mappingWithoutHardwareProject(): EditableProject {
  const project = fullEditableProject()
  return {
    ...project,
    hardwareTopology: {
      ...project.hardwareTopology,
      processors: [],
      ports: [],
      receivers: [],
      processorOrder: [],
      receiverOrder: [],
    },
  }
}

export function partialHardwareProject(): EditableProject {
  const project = mappingWithoutHardwareProject()
  const processor = { id: asProcessorId('P-partial'), name: 'Partial', portCount: 2 }
  const port = { id: asPortId('P-partial:0'), processor: processor.id, index: 0, receiverCapacity: 2 }
  return {
    ...project,
    hardwareTopology: {
      ...project.hardwareTopology,
      processors: [processor],
      ports: [port],
      processorOrder: [processor.id],
      receiverOrder: [{ port: port.id, receivers: [] }],
    },
  }
}

export function multiScreenEditableProject(): EditableProject {
  const inputCanvas = { id: asInputCanvasId('input'), resolution: { width: 4, height: 3 } }
  const screenA = asScreenId('screen-a')
  const screenB = asScreenId('screen-b')
  const gridA = asCabinetGridId('grid-a')
  const gridB = asCabinetGridId('grid-b')
  const regionA = asMappingRegionId('region-a')
  const regionB = asMappingRegionId('region-b')
  const cabinetA = asCabinetId('cabinet-a')
  const cabinetB = asCabinetId('cabinet-b')
  const moduleA = asModuleId('module-a')
  const moduleB = asModuleId('module-b')
  return {
    inputCanvas,
    screens: [
      { id: screenA, name: 'A', resolution: { width: 2, height: 3 }, mappingRegions: [regionA], cabinetGrids: [gridA] },
      { id: screenB, name: 'B', resolution: { width: 2, height: 3 }, mappingRegions: [regionB], cabinetGrids: [gridB] },
    ],
    cabinetGrids: [
      {
        id: gridA, screen: screenA, name: 'Grid A', columns: 1, rows: 1, cabinetWidth: 100, cabinetHeight: 100,
        ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
      },
      {
        id: gridB, screen: screenB, name: 'Grid B', columns: 1, rows: 1, cabinetWidth: 100, cabinetHeight: 100,
        ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
      },
    ],
    mappingRegions: [
      { id: regionA, inputCanvas: inputCanvas.id, screen: screenA, grid: gridA, position: { x: 0, y: 0 }, size: { width: 2, height: 3 } },
      { id: regionB, inputCanvas: inputCanvas.id, screen: screenB, grid: gridB, position: { x: 2, y: 0 }, size: { width: 2, height: 3 } },
    ],
    hardwareTopology: {
      processors: [],
      ports: [],
      receivers: [],
      cabinets: [
        {
          id: cabinetA, grid: gridA, column: 0, row: 0, origin: { x: 0, y: 0 }, width: 100, height: 100,
          pixelWidth: 2, pixelHeight: 3, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
        },
        {
          id: cabinetB, grid: gridB, column: 0, row: 0, origin: { x: 0, y: 0 }, width: 100, height: 100,
          pixelWidth: 2, pixelHeight: 3, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
        },
      ],
      modules: [
        {
          id: moduleA, cabinet: cabinetA, column: 0, row: 0, localX: 0, localY: 0,
          width: 100, height: 100, pixelWidth: 2, pixelHeight: 3,
        },
        {
          id: moduleB, cabinet: cabinetB, column: 0, row: 0, localX: 0, localY: 0,
          width: 100, height: 100, pixelWidth: 2, pixelHeight: 3,
        },
      ],
      processorOrder: [],
      receiverOrder: [],
    },
    rules: [],
    editorLayout: {
      screenPositions: [
        { screen: screenA, position: { x: -640, y: 128 } },
        { screen: screenB, position: { x: 320, y: -256 } },
      ],
    },
  }
}
