import type { EditableProject } from '../editor-project/index.js'
import {
  asCabinetGridId,
  asCabinetId,
  asInputCanvasId,
  asMappingRegionId,
  asModuleId,
  asPortId,
  asProcessorId,
  asReceiverId,
  asScreenId,
} from '../model/ids.js'
import type { RemapRuleDescriptor } from '../remap-engine/index.js'
import { deepFreeze } from './json.js'
import type { ProjectDocumentV2 } from './types.js'

export function reconstructEditableProject(document: ProjectDocumentV2): EditableProject {
  const source = document.project
  const topology = source.hardwareTopology
  const project: EditableProject = {
    inputCanvas: source.inputCanvas === null ? null : {
      id: asInputCanvasId(source.inputCanvas.id),
      resolution: { width: source.inputCanvas.resolution.width, height: source.inputCanvas.resolution.height },
    },
    screens: source.screens.map(screen => ({
      id: asScreenId(screen.id),
      name: screen.name,
      resolution: { width: screen.resolution.width, height: screen.resolution.height },
      mappingRegions: screen.mappingRegions.map(asMappingRegionId),
      cabinetGrids: screen.cabinetGrids.map(asCabinetGridId),
    })),
    cabinetGrids: source.cabinetGrids.map(grid => ({
      id: asCabinetGridId(grid.id),
      screen: asScreenId(grid.screen),
      name: grid.name,
      columns: grid.columns,
      rows: grid.rows,
      cabinetWidth: grid.cabinetWidth,
      cabinetHeight: grid.cabinetHeight,
      ordering: {
        numbering: grid.ordering.numbering,
        startCorner: grid.ordering.startCorner,
        direction: grid.ordering.direction,
        snake: grid.ordering.snake,
      },
    })),
    mappingRegions: source.mappingRegions.map(region => ({
      id: asMappingRegionId(region.id),
      inputCanvas: asInputCanvasId(region.inputCanvas),
      screen: asScreenId(region.screen),
      grid: asCabinetGridId(region.grid),
      position: { x: region.position.x, y: region.position.y },
      size: { width: region.size.width, height: region.size.height },
    })),
    hardwareTopology: {
      processors: topology.processors.map(processor => ({
        id: asProcessorId(processor.id),
        name: processor.name,
        portCount: processor.portCount,
      })),
      ports: topology.ports.map(port => ({
        id: asPortId(port.id),
        processor: asProcessorId(port.processor),
        index: port.index,
        receiverCapacity: port.receiverCapacity,
      })),
      receivers: topology.receivers.map(receiver => ({
        id: asReceiverId(receiver.id),
        processor: asProcessorId(receiver.processor),
        port: asPortId(receiver.port),
        index: receiver.index,
        cabinets: receiver.cabinets.map(asCabinetId),
        ...(receiver.pixelCapacity === undefined ? {} : { pixelCapacity: receiver.pixelCapacity }),
      })),
      cabinets: topology.cabinets.map(cabinet => ({
        id: asCabinetId(cabinet.id),
        grid: asCabinetGridId(cabinet.grid),
        column: cabinet.column,
        row: cabinet.row,
        origin: { x: cabinet.origin.x, y: cabinet.origin.y },
        width: cabinet.width,
        height: cabinet.height,
        pixelWidth: cabinet.pixelWidth,
        pixelHeight: cabinet.pixelHeight,
        moduleColumns: cabinet.moduleColumns,
        moduleRows: cabinet.moduleRows,
        rotation: cabinet.rotation,
        flipH: cabinet.flipH,
        flipV: cabinet.flipV,
      })),
      modules: topology.modules.map(module => ({
        id: asModuleId(module.id),
        cabinet: asCabinetId(module.cabinet),
        column: module.column,
        row: module.row,
        localX: module.column * module.width,
        localY: module.row * module.height,
        width: module.width,
        height: module.height,
        pixelWidth: module.pixelWidth,
        pixelHeight: module.pixelHeight,
      })),
      processorOrder: topology.processorOrder.map(asProcessorId),
      receiverOrder: topology.receiverOrder.map(order => ({
        port: asPortId(order.port),
        receivers: order.receivers.map(asReceiverId),
      })),
    },
    rules: source.rules as unknown as readonly RemapRuleDescriptor[],
    editorLayout: {
      screenPositions: source.editorLayout.screenPositions.map(placement => ({
        screen: asScreenId(placement.screen),
        position: { x: placement.position.x, y: placement.position.y },
      })),
    },
  }
  return deepFreeze(project)
}
