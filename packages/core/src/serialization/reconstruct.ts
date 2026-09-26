import {
  asCabinetGridId, asCabinetId, asInputCanvasId, asMappingRegionId, asModuleId,
  asPortId, asProcessorId, asReceiverId, asScreenId,
} from '../model/ids.js'
import type { RemapRuleDescriptor } from '../remap-engine/index.js'
import type { ValidateProjectInput } from '../validation/index.js'
import { deepFreeze } from './json.js'
import type { ProjectDocument } from './types.js'

export function reconstructProject(document: ProjectDocument): ValidateProjectInput {
  const { mapping, rules } = document.project
  const topology = mapping.hardwareTopology
  const project: ValidateProjectInput = {
    mapping: {
      inputCanvas: {
        id: asInputCanvasId(mapping.inputCanvas.id),
        resolution: { width: mapping.inputCanvas.resolution.width, height: mapping.inputCanvas.resolution.height },
      },
      screen: {
        id: asScreenId(mapping.screen.id),
        name: mapping.screen.name,
        resolution: { width: mapping.screen.resolution.width, height: mapping.screen.resolution.height },
        mappingRegions: mapping.screen.mappingRegions.map(asMappingRegionId),
        cabinetGrids: mapping.screen.cabinetGrids.map(asCabinetGridId),
      },
      grid: {
        id: asCabinetGridId(mapping.grid.id),
        screen: asScreenId(mapping.grid.screen),
        name: mapping.grid.name,
        columns: mapping.grid.columns,
        rows: mapping.grid.rows,
        cabinetWidth: mapping.grid.cabinetWidth,
        cabinetHeight: mapping.grid.cabinetHeight,
        ordering: {
          numbering: mapping.grid.ordering.numbering,
          startCorner: mapping.grid.ordering.startCorner,
          direction: mapping.grid.ordering.direction,
          snake: mapping.grid.ordering.snake,
        },
      },
      region: {
        id: asMappingRegionId(mapping.region.id),
        inputCanvas: asInputCanvasId(mapping.region.inputCanvas),
        screen: asScreenId(mapping.region.screen),
        grid: asCabinetGridId(mapping.region.grid),
        inputRect: { ...mapping.region.inputRect },
        screenRect: { ...mapping.region.screenRect },
        transform: {
          inputRotation: mapping.region.transform.inputRotation,
          screenRotation: mapping.region.transform.screenRotation,
          flipX: mapping.region.transform.flipX,
          flipY: mapping.region.transform.flipY,
          ...(mapping.region.transform.mask === undefined ? {} : {
            mask: {
              enabled: mapping.region.transform.mask.enabled,
              points: mapping.region.transform.mask.points.map(point => ({ ...point })),
            },
          }),
        },
      },
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
          index: receiver.index,
          processor: asProcessorId(receiver.processor),
          port: asPortId(receiver.port),
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
        receiverOrder: topology.receiverOrder.map(entry => ({
          port: asPortId(entry.port),
          receivers: entry.receivers.map(asReceiverId),
        })),
      },
    },
    rules: rules as unknown as readonly RemapRuleDescriptor[],
  }
  return deepFreeze(project)
}
