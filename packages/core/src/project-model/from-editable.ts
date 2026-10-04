import { inspectEditableProject, type EditableProject } from '../editor-project/index.js'
import { DomainError } from '../model/errors.js'
import type { CabinetGridId, CabinetId } from '../model/ids.js'
import { createProjectV2 } from './create.js'
import { asHardwareAssignmentId, asSignalRouteId } from './ids.js'
import type { LedMapProjectV2, ProjectCabinet } from './types.js'

function generatedId(kind: string, sourceId: string): string {
  return `${kind}:${sourceId.length}:${sourceId}`
}

function cabinetLabel(cabinetId: CabinetId, gridId: CabinetGridId, project: EditableProject): string {
  const grid = project.cabinetGrids.find(value => value.id === gridId)!
  const prefix = `${grid.screen}/`
  return cabinetId.startsWith(prefix) ? cabinetId.slice(prefix.length) : cabinetId
}

export function convertEditableProjectToV2(source: EditableProject): LedMapProjectV2 {
  const diagnostics = inspectEditableProject(source)
  if (diagnostics.length > 0) {
    throw new DomainError('PROJECT_EDITABLE_INVALID', diagnostics[0]!.message)
  }

  const cabinets: ProjectCabinet[] = source.hardwareTopology.cabinets.map(cabinet => ({
    id: cabinet.id,
    gridId: cabinet.grid,
    label: cabinetLabel(cabinet.id, cabinet.grid, source),
    column: cabinet.column,
    row: cabinet.row,
    origin: cabinet.origin,
    width: cabinet.width,
    height: cabinet.height,
    pixelWidth: cabinet.pixelWidth,
    pixelHeight: cabinet.pixelHeight,
    moduleColumns: cabinet.moduleColumns,
    moduleRows: cabinet.moduleRows,
    rotation: cabinet.rotation,
    flipH: cabinet.flipH,
    flipV: cabinet.flipV,
  }))

  return createProjectV2({
    metadata: {},
    design: {
      screens: source.screens.map(screen => ({
        id: screen.id, name: screen.name, resolution: screen.resolution,
        cabinetGridOrder: screen.cabinetGrids, mappingRegionOrder: screen.mappingRegions,
      })),
      cabinetGrids: source.cabinetGrids.map(grid => ({
        id: grid.id, screenId: grid.screen, name: grid.name, columns: grid.columns, rows: grid.rows,
        cabinetWidth: grid.cabinetWidth, cabinetHeight: grid.cabinetHeight, ordering: grid.ordering,
      })),
      cabinets,
      modules: source.hardwareTopology.modules.map(module => ({
        id: module.id, cabinetId: module.cabinet, column: module.column, row: module.row,
        width: module.width, height: module.height, pixelWidth: module.pixelWidth, pixelHeight: module.pixelHeight,
      })),
      composition: {
        placements: source.editorLayout.screenPositions.map(placement => ({
          screenId: placement.screen, x: placement.position.x, y: placement.position.y, locked: false,
        })),
      },
    },
    content: {
      inputCanvases: source.inputCanvas === null ? [] : [source.inputCanvas],
      mappingRegions: source.mappingRegions.map(region => ({
        id: region.id, inputCanvasId: region.inputCanvas, screenId: region.screen, gridId: region.grid,
        position: region.position, size: region.size,
      })),
      mediaOutputs: [],
      outputMappings: [],
    },
    hardware: {
      processors: source.hardwareTopology.processors,
      ports: source.hardwareTopology.ports.map(port => ({
        id: port.id, processorId: port.processor, index: port.index, receiverCapacity: port.receiverCapacity,
      })),
      receivers: source.hardwareTopology.receivers.map(receiver => ({
        id: receiver.id, legacyIndex: receiver.index, processorId: receiver.processor, portId: receiver.port,
        ...(receiver.pixelCapacity === undefined ? {} : { pixelCapacity: receiver.pixelCapacity }),
      })),
      assignments: source.hardwareTopology.receivers.flatMap(receiver => receiver.cabinets.map(cabinetId => ({
        id: asHardwareAssignmentId(generatedId('assignment', cabinetId)),
        target: { kind: 'cabinet' as const, cabinetId },
        receiverId: receiver.id,
        locked: true,
      }))),
      processorOrder: source.hardwareTopology.processorOrder,
      receiverOrder: source.hardwareTopology.receiverOrder.map(order => ({
        portId: order.port, receiverIds: order.receivers,
      })),
    },
    operations: {
      signalRoutes: source.hardwareTopology.receivers.filter(receiver => receiver.cabinets.length > 0).map(receiver => ({
        id: asSignalRouteId(generatedId('route', receiver.id)),
        receiverId: receiver.id,
        orderedCabinetIds: receiver.cabinets,
      })),
      backupRoutes: [],
      liveOutputTargets: [],
    },
    remap: { rules: source.rules },
  })
}
