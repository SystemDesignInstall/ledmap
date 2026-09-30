import type { EditableProject } from '../editor-project/index.js'
import { DomainError } from '../model/errors.js'
import { selectReceiverCabinetChain } from './selectors.js'
import type { LedMapProjectV2 } from './types.js'
import { assertProjectV2HardwareContract, assertProjectV2ReferenceOrderContract } from './validate.js'

function detachedFrozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => detachedFrozen(item))) as T
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, detachedFrozen(item)]))) as T
  }
  return value
}

export function projectV2AsEditableReadModel(project: LedMapProjectV2): EditableProject {
  assertProjectV2ReferenceOrderContract(project)
  assertProjectV2HardwareContract(project)
  if (project.content.inputCanvases.length > 1) {
    throw new DomainError('PROJECT_COMPAT_INPUT_CANVASES', 'The current editor read model supports one InputCanvas')
  }
  if (project.design.stage !== undefined || project.content.mediaOutputs.length > 0 ||
      project.content.outputMappings.length > 0 || project.operations.backupRoutes.length > 0 ||
      project.operations.liveOutputTargets.length > 0) {
    throw new DomainError('PROJECT_COMPAT_UNSUPPORTED', 'The current editor read model cannot represent future-only project sections')
  }

  const source: EditableProject = {
    inputCanvas: project.content.inputCanvases[0] ?? null,
    screens: project.design.screens.map(screen => ({
      id: screen.id,
      name: screen.name,
      resolution: screen.resolution,
      cabinetGrids: screen.cabinetGridOrder,
      mappingRegions: screen.mappingRegionOrder,
    })),
    cabinetGrids: project.design.cabinetGrids.map(grid => ({
      id: grid.id, screen: grid.screenId, name: grid.name, columns: grid.columns, rows: grid.rows,
      cabinetWidth: grid.cabinetWidth, cabinetHeight: grid.cabinetHeight, ordering: grid.ordering,
    })),
    mappingRegions: project.content.mappingRegions.map(region => ({
      id: region.id, inputCanvas: region.inputCanvasId, screen: region.screenId, grid: region.gridId,
      position: region.position, size: region.size,
    })),
    hardwareTopology: {
      processors: project.hardware.processors,
      ports: project.hardware.ports.map(port => ({
        id: port.id, processor: port.processorId, index: port.index, receiverCapacity: port.receiverCapacity,
      })),
      receivers: project.hardware.receivers.map(receiver => ({
        id: receiver.id, index: receiver.legacyIndex, processor: receiver.processorId, port: receiver.portId,
        cabinets: selectReceiverCabinetChain(project, receiver.id).map(cabinet => cabinet.id),
        ...(receiver.pixelCapacity === undefined ? {} : { pixelCapacity: receiver.pixelCapacity }),
      })),
      cabinets: project.design.cabinets.map(cabinet => ({
        id: cabinet.id, grid: cabinet.gridId, column: cabinet.column, row: cabinet.row, origin: cabinet.origin,
        width: cabinet.width, height: cabinet.height, pixelWidth: cabinet.pixelWidth, pixelHeight: cabinet.pixelHeight,
        moduleColumns: cabinet.moduleColumns, moduleRows: cabinet.moduleRows, rotation: cabinet.rotation,
        flipH: cabinet.flipH, flipV: cabinet.flipV,
      })),
      modules: project.design.modules.map(module => ({
        id: module.id, cabinet: module.cabinetId, column: module.column, row: module.row,
        localX: module.column * module.width, localY: module.row * module.height,
        width: module.width, height: module.height, pixelWidth: module.pixelWidth, pixelHeight: module.pixelHeight,
      })),
      processorOrder: project.hardware.processorOrder,
      receiverOrder: project.hardware.receiverOrder.map(order => ({ port: order.portId, receivers: order.receiverIds })),
    },
    rules: project.remap.rules,
    editorLayout: {
      screenPositions: project.design.composition.placements.map(placement => ({
        screen: placement.screenId, position: { x: placement.x, y: placement.y },
      })),
    },
  }
  return detachedFrozen(source)
}
