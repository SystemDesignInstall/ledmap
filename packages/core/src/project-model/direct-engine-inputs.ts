import { resolveHardware, type HardwareTopologyInput, type ResolvedHardwareMapping } from '../hardware-engine/index.js'
import { resolveGeometryMapping, type ResolveGeometryMappingInput, type ResolvedGeometryMapping } from '../mapping-engine/index.js'
import { DomainError } from '../model/errors.js'
import type { MappingRegionId } from '../model/ids.js'
import { assertProjectV2HardwareContract, assertProjectV2ReferenceOrderContract } from './validate.js'
import type { LedMapProjectV2 } from './types.js'

export interface V2ReadDiagnostic {
  readonly severity: 'error'
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

export type V2GeometryRead =
  | { readonly status: 'ready'; readonly mapping: ResolvedGeometryMapping; readonly diagnostics: readonly V2ReadDiagnostic[] }
  | { readonly status: 'incomplete'; readonly mapping: null; readonly diagnostics: readonly V2ReadDiagnostic[] }

export type V2HardwareRead =
  | { readonly status: 'ready'; readonly hardware: ResolvedHardwareMapping; readonly diagnostics: readonly V2ReadDiagnostic[] }
  | { readonly status: 'incomplete'; readonly hardware: null; readonly diagnostics: readonly V2ReadDiagnostic[] }

function diagnostic(error: unknown, path: readonly (string | number)[]): V2ReadDiagnostic {
  if (!(error instanceof DomainError)) throw error
  return Object.freeze({ severity: 'error', code: error.code, path: Object.freeze([...path]), message: error.message })
}

export function selectV2HardwareEngineInput(project: LedMapProjectV2): HardwareTopologyInput {
  assertProjectV2HardwareContract(project)
  const routes = new Map(project.operations.signalRoutes.map(route => [route.receiverId, route.orderedCabinetIds]))
  return Object.freeze({
    processors: project.hardware.processors,
    ports: project.hardware.ports.map(port => ({
      id: port.id, processor: port.processorId, index: port.index, receiverCapacity: port.receiverCapacity,
    })),
    receivers: project.hardware.receivers.map(receiver => ({
      id: receiver.id, index: receiver.legacyIndex, processor: receiver.processorId,
      port: receiver.portId, cabinets: routes.get(receiver.id) ?? [],
      ...(receiver.pixelCapacity === undefined ? {} : { pixelCapacity: receiver.pixelCapacity }),
    })),
    cabinets: project.design.cabinets.map(cabinet => ({
      id: cabinet.id, grid: cabinet.gridId, column: cabinet.column, row: cabinet.row,
      origin: cabinet.origin, width: cabinet.width, height: cabinet.height,
      pixelWidth: cabinet.pixelWidth, pixelHeight: cabinet.pixelHeight,
      moduleColumns: cabinet.moduleColumns, moduleRows: cabinet.moduleRows,
      rotation: cabinet.rotation, flipH: cabinet.flipH, flipV: cabinet.flipV,
    })),
    modules: project.design.modules.map(module => ({
      id: module.id, cabinet: module.cabinetId, column: module.column, row: module.row,
      localX: module.column * module.width, localY: module.row * module.height,
      width: module.width, height: module.height,
      pixelWidth: module.pixelWidth, pixelHeight: module.pixelHeight,
    })),
    processorOrder: project.hardware.processorOrder,
    receiverOrder: project.hardware.receiverOrder.map(order => ({ port: order.portId, receivers: order.receiverIds })),
  })
}

export function selectV2GeometryEngineInput(project: LedMapProjectV2, regionId: MappingRegionId): ResolveGeometryMappingInput {
  assertProjectV2ReferenceOrderContract(project)
  const region = project.content.mappingRegions.find(value => value.id === regionId)
  if (!region) throw new DomainError('MAPPING_UNKNOWN_REFERENCE', `Unknown MappingRegion: ${regionId}`)
  const inputCanvas = project.content.inputCanvases.find(value => value.id === region.inputCanvasId)
  if (!inputCanvas) throw new DomainError('MAPPING_INCOMPLETE', 'InputCanvas is not configured')
  const screen = project.design.screens.find(value => value.id === region.screenId)
  if (!screen) throw new DomainError('MAPPING_UNKNOWN_REFERENCE', `Unknown Screen: ${region.screenId}`)
  const grid = project.design.cabinetGrids.find(value => value.id === region.gridId)
  if (!grid) throw new DomainError('MAPPING_UNKNOWN_REFERENCE', `Unknown CabinetGrid: ${region.gridId}`)
  const cabinets = project.design.cabinets.filter(cabinet => cabinet.gridId === grid.id)
  const cabinetIds = new Set(cabinets.map(cabinet => cabinet.id))
  return Object.freeze({
    inputCanvas,
    screen: { id: screen.id, name: screen.name, resolution: screen.resolution,
      cabinetGrids: screen.cabinetGridOrder, mappingRegions: screen.mappingRegionOrder },
    grid: { id: grid.id, screen: grid.screenId, name: grid.name, columns: grid.columns, rows: grid.rows,
      cabinetWidth: grid.cabinetWidth, cabinetHeight: grid.cabinetHeight, ordering: grid.ordering },
    region: { id: region.id, inputCanvas: region.inputCanvasId, screen: region.screenId, grid: region.gridId,
      position: region.position, size: region.size },
    cabinets: cabinets.map(cabinet => ({
      id: cabinet.id, grid: cabinet.gridId, column: cabinet.column, row: cabinet.row,
      origin: cabinet.origin, width: cabinet.width, height: cabinet.height,
      pixelWidth: cabinet.pixelWidth, pixelHeight: cabinet.pixelHeight,
      moduleColumns: cabinet.moduleColumns, moduleRows: cabinet.moduleRows,
      rotation: cabinet.rotation, flipH: cabinet.flipH, flipV: cabinet.flipV,
    })),
    modules: project.design.modules.filter(module => cabinetIds.has(module.cabinetId)).map(module => ({
      id: module.id, cabinet: module.cabinetId, column: module.column, row: module.row,
      localX: module.column * module.width, localY: module.row * module.height,
      width: module.width, height: module.height,
      pixelWidth: module.pixelWidth, pixelHeight: module.pixelHeight,
    })),
  })
}

export function selectV2GeometryRead(project: LedMapProjectV2, regionId: MappingRegionId): V2GeometryRead {
  const index = project.content.mappingRegions.findIndex(value => value.id === regionId)
  try {
    return Object.freeze({ status: 'ready', mapping: resolveGeometryMapping(selectV2GeometryEngineInput(project, regionId)), diagnostics: Object.freeze([]) })
  } catch (error) {
    return Object.freeze({ status: 'incomplete', mapping: null, diagnostics: Object.freeze([diagnostic(error, index < 0 ? ['mappingRegions'] : ['mappingRegions', index])]) })
  }
}

export function selectV2HardwareRead(project: LedMapProjectV2): V2HardwareRead {
  try {
    return Object.freeze({ status: 'ready', hardware: resolveHardware(selectV2HardwareEngineInput(project)), diagnostics: Object.freeze([]) })
  } catch (error) {
    return Object.freeze({ status: 'incomplete', hardware: null, diagnostics: Object.freeze([diagnostic(error, ['hardwareTopology'])]) })
  }
}
