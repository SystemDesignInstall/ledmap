import { DomainError } from '../model/errors.js'
import type { LedMapProjectV2 } from './types.js'

function fail(code: string, message: string): never {
  throw new DomainError(code, message)
}

function uniqueById<T extends { readonly id: string }>(values: readonly T[], label: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    if (result.has(value.id)) fail('PROJECT_DUPLICATE_ID', `${label} ${value.id} appears more than once`)
    result.set(value.id, value)
  }
  return result
}

export function assertProjectV2ReferenceOrderContract(project: LedMapProjectV2): void {
  const screens = uniqueById(project.design.screens, 'Screen')
  const grids = uniqueById(project.design.cabinetGrids, 'CabinetGrid')
  const regions = uniqueById(project.content.mappingRegions, 'MappingRegion')
  const orderedGrids = new Set<string>()
  const orderedRegions = new Set<string>()

  for (const screen of screens.values()) {
    for (const gridId of screen.cabinetGridOrder) {
      const grid = grids.get(gridId)
      if (!grid || grid.screenId !== screen.id) fail('PROJECT_GRID_ORDER_PARENT_MISMATCH', `Screen ${screen.id} lists CabinetGrid ${gridId} that does not belong to it`)
      if (orderedGrids.has(gridId)) fail('PROJECT_DUPLICATE_GRID_ORDER', `CabinetGrid ${gridId} appears more than once in Screen orders`)
      orderedGrids.add(gridId)
    }
    for (const regionId of screen.mappingRegionOrder) {
      const region = regions.get(regionId)
      if (!region || region.screenId !== screen.id) fail('PROJECT_REGION_ORDER_PARENT_MISMATCH', `Screen ${screen.id} lists MappingRegion ${regionId} that does not belong to it`)
      if (orderedRegions.has(regionId)) fail('PROJECT_DUPLICATE_REGION_ORDER', `MappingRegion ${regionId} appears more than once in Screen orders`)
      orderedRegions.add(regionId)
    }
  }
  for (const grid of grids.values()) {
    if (!screens.has(grid.screenId) || !orderedGrids.has(grid.id)) fail('PROJECT_MISSING_GRID_ORDER', `CabinetGrid ${grid.id} is missing from its Screen order`)
  }
  for (const region of regions.values()) {
    if (!screens.has(region.screenId) || !orderedRegions.has(region.id)) fail('PROJECT_MISSING_REGION_ORDER', `MappingRegion ${region.id} is missing from its Screen order`)
  }
}

export function assertProjectV2HardwareContract(project: LedMapProjectV2): void {
  const processors = uniqueById(project.hardware.processors, 'Processor')
  const ports = uniqueById(project.hardware.ports, 'Port')
  const receivers = uniqueById(project.hardware.receivers, 'Receiver')
  const cabinets = uniqueById(project.design.cabinets, 'Cabinet')
  uniqueById(project.hardware.assignments, 'HardwareAssignment')
  uniqueById(project.operations.signalRoutes, 'SignalRoute')

  for (const port of ports.values()) {
    if (!processors.has(port.processorId)) fail('PROJECT_UNKNOWN_PROCESSOR', `Port ${port.id} references unknown Processor ${port.processorId}`)
  }
  for (const receiver of receivers.values()) {
    const port = ports.get(receiver.portId)
    if (!port) fail('PROJECT_UNKNOWN_PORT', `Receiver ${receiver.id} references unknown Port ${receiver.portId}`)
    if (!processors.has(receiver.processorId) || port.processorId !== receiver.processorId) {
      fail('PROJECT_RECEIVER_PARENT_MISMATCH', `Receiver ${receiver.id} Processor does not match Port ${port.id}`)
    }
    if (!Number.isSafeInteger(receiver.legacyIndex) || receiver.legacyIndex < 0) {
      fail('PROJECT_INVALID_LEGACY_INDEX', `Receiver ${receiver.id} legacyIndex must be a non-negative safe integer`)
    }
  }

  const orderedPorts = new Set<string>()
  const orderedReceivers = new Set<string>()
  const orderedProcessors = new Set<string>()
  for (const processorId of project.hardware.processorOrder) {
    if (!processors.has(processorId)) fail('PROJECT_UNKNOWN_PROCESSOR', `Processor order references unknown Processor ${processorId}`)
    if (orderedProcessors.has(processorId)) fail('PROJECT_DUPLICATE_PROCESSOR_ORDER', `Processor ${processorId} appears more than once in Processor order`)
    orderedProcessors.add(processorId)
  }
  for (const order of project.hardware.receiverOrder) {
    if (!ports.has(order.portId)) fail('PROJECT_UNKNOWN_PORT', `Receiver order references unknown Port ${order.portId}`)
    if (orderedPorts.has(order.portId)) fail('PROJECT_DUPLICATE_PORT_RECEIVER_ORDER', `Port ${order.portId} has more than one Receiver order`)
    orderedPorts.add(order.portId)
    for (const receiverId of order.receiverIds) {
      const receiver = receivers.get(receiverId)
      if (!receiver) fail('PROJECT_UNKNOWN_RECEIVER', `Receiver order references unknown Receiver ${receiverId}`)
      if (orderedReceivers.has(receiverId)) fail('PROJECT_DUPLICATE_ORDERED_RECEIVER', `Receiver ${receiverId} appears more than once in Receiver orders`)
      if (receiver.portId !== order.portId) fail('PROJECT_RECEIVER_ORDER_PARENT_MISMATCH', `Receiver ${receiverId} belongs to Port ${receiver.portId}, not ${order.portId}`)
      orderedReceivers.add(receiverId)
    }
  }

  const assignmentByCabinet = new Map<string, string>()
  const assignedByReceiver = new Map<string, Set<string>>()
  for (const assignment of project.hardware.assignments) {
    if (assignment.target.kind !== 'cabinet' || !cabinets.has(assignment.target.cabinetId)) {
      fail('PROJECT_UNKNOWN_CABINET', `HardwareAssignment ${assignment.id} references unknown Cabinet`)
    }
    if (!receivers.has(assignment.receiverId)) fail('PROJECT_UNKNOWN_RECEIVER', `HardwareAssignment ${assignment.id} references unknown Receiver ${assignment.receiverId}`)
    if (typeof assignment.locked !== 'boolean') fail('PROJECT_INVALID_ASSIGNMENT', `HardwareAssignment ${assignment.id} locked must be a boolean`)
    if (assignment.origin !== undefined && assignment.origin !== 'manual' && assignment.origin !== 'auto') {
      fail('PROJECT_INVALID_ASSIGNMENT', `HardwareAssignment ${assignment.id} has an unknown origin`)
    }
    const cabinetId = assignment.target.cabinetId
    if (assignmentByCabinet.has(cabinetId)) fail('PROJECT_DUPLICATE_CABINET_ASSIGNMENT', `Cabinet ${cabinetId} has more than one Receiver assignment`)
    assignmentByCabinet.set(cabinetId, assignment.receiverId)
    const assigned = assignedByReceiver.get(assignment.receiverId) ?? new Set<string>()
    assigned.add(cabinetId)
    assignedByReceiver.set(assignment.receiverId, assigned)
  }

  const routedReceivers = new Set<string>()
  for (const route of project.operations.signalRoutes) {
    if (!receivers.has(route.receiverId)) fail('PROJECT_UNKNOWN_RECEIVER', `SignalRoute ${route.id} references unknown Receiver ${route.receiverId}`)
    if (routedReceivers.has(route.receiverId)) fail('PROJECT_DUPLICATE_RECEIVER_ROUTE', `Receiver ${route.receiverId} has more than one SignalRoute`)
    routedReceivers.add(route.receiverId)
    const routedCabinets = new Set<string>()
    for (const cabinetId of route.orderedCabinetIds) {
      if (routedCabinets.has(cabinetId)) fail('PROJECT_DUPLICATE_ROUTE_CABINET', `SignalRoute ${route.id} repeats Cabinet ${cabinetId}`)
      routedCabinets.add(cabinetId)
      if (assignmentByCabinet.get(cabinetId) !== route.receiverId) {
        fail('PROJECT_ROUTE_ASSIGNMENT_MISMATCH', `SignalRoute ${route.id} includes Cabinet ${cabinetId} without assignment to Receiver ${route.receiverId}`)
      }
    }
    for (const cabinetId of assignedByReceiver.get(route.receiverId) ?? []) {
      if (!routedCabinets.has(cabinetId)) fail('PROJECT_ROUTE_ASSIGNMENT_MISMATCH', `Cabinet ${cabinetId} is assigned to Receiver ${route.receiverId} but missing from its SignalRoute`)
    }
  }
  for (const [receiverId, assigned] of assignedByReceiver) {
    if (assigned.size > 0 && !routedReceivers.has(receiverId)) {
      fail('PROJECT_ROUTE_ASSIGNMENT_MISMATCH', `Receiver ${receiverId} has assigned Cabinets but no SignalRoute`)
    }
  }
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) fail('PROJECT_INVALID_GEOMETRY', `${label} must be a positive safe integer`)
}

function nonnegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) fail('PROJECT_INVALID_GEOMETRY', `${label} must be a non-negative safe integer`)
}

export function assertProjectV2EditorStructure(project: LedMapProjectV2): void {
  assertProjectV2ReferenceOrderContract(project)
  const screens = uniqueById(project.design.screens, 'Screen')
  const grids = uniqueById(project.design.cabinetGrids, 'CabinetGrid')
  const cabinets = uniqueById(project.design.cabinets, 'Cabinet')
  const canvases = uniqueById(project.content.inputCanvases, 'InputCanvas')
  const mediaOutputs = uniqueById(project.content.mediaOutputs, 'MediaOutputCanvas')
  uniqueById(project.content.outputMappings, 'OutputMapping')
  uniqueById(project.operations.backupRoutes, 'BackupRoute')
  uniqueById(project.operations.liveOutputTargets, 'LiveOutputTarget')
  uniqueById(project.design.modules, 'Module')
  const placements = new Set<string>()
  for (const placement of project.design.composition.placements) {
    if (!screens.has(placement.screenId)) fail('PROJECT_UNKNOWN_SCREEN', `CompositionPlacement references unknown Screen ${placement.screenId}`)
    if (placements.has(placement.screenId)) fail('PROJECT_DUPLICATE_COMPOSITION_PLACEMENT', `Screen ${placement.screenId} has more than one CompositionPlacement`)
    placements.add(placement.screenId)
    if (!Number.isSafeInteger(placement.x) || !Number.isSafeInteger(placement.y)) {
      fail('PROJECT_INVALID_GEOMETRY', `Screen ${placement.screenId} placement must use signed safe integers`)
    }
    if (typeof placement.locked !== 'boolean') fail('PROJECT_INVALID_PLACEMENT', `Screen ${placement.screenId} placement locked must be boolean`)
  }
  for (const placement of project.design.stage?.placements ?? []) {
    if (!screens.has(placement.screenId)) fail('PROJECT_UNKNOWN_SCREEN', `Stage placement references unknown Screen ${placement.screenId}`)
    if (!Number.isFinite(placement.positionMm.x) || !Number.isFinite(placement.positionMm.y) || !Number.isFinite(placement.positionMm.z)) {
      fail('PROJECT_INVALID_GEOMETRY', `Stage placement for Screen ${placement.screenId} must use finite coordinates`)
    }
  }
  for (const screen of screens.values()) {
    positive(screen.resolution.width, `Screen ${screen.id} width`)
    positive(screen.resolution.height, `Screen ${screen.id} height`)
    if (!placements.has(screen.id)) fail('PROJECT_MISSING_PLACEMENT', `Screen ${screen.id} has no CompositionPlacement`)
  }
  for (const grid of grids.values()) {
    positive(grid.columns, `CabinetGrid ${grid.id} columns`)
    positive(grid.rows, `CabinetGrid ${grid.id} rows`)
    positive(grid.cabinetWidth, `CabinetGrid ${grid.id} width`)
    positive(grid.cabinetHeight, `CabinetGrid ${grid.id} height`)
  }
  for (const canvas of canvases.values()) {
    positive(canvas.resolution.width, `InputCanvas ${canvas.id} width`)
    positive(canvas.resolution.height, `InputCanvas ${canvas.id} height`)
  }
  for (const output of mediaOutputs.values()) {
    positive(output.resolution.width, `MediaOutputCanvas ${output.id} width`)
    positive(output.resolution.height, `MediaOutputCanvas ${output.id} height`)
  }
  for (const mapping of project.content.outputMappings) {
    if (!screens.has(mapping.screenId)) fail('PROJECT_UNKNOWN_SCREEN', `OutputMapping ${mapping.id} references unknown Screen ${mapping.screenId}`)
    if (!mediaOutputs.has(mapping.mediaOutputId)) {
      fail('PROJECT_UNKNOWN_MEDIA_OUTPUT', `OutputMapping ${mapping.id} references unknown MediaOutputCanvas ${mapping.mediaOutputId}`)
    }
    for (const point of mapping.mask?.points ?? []) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        fail('PROJECT_INVALID_GEOMETRY', `OutputMapping ${mapping.id} mask must use finite coordinates`)
      }
    }
  }
  for (const region of project.content.mappingRegions) {
    if (!canvases.has(region.inputCanvasId)) fail('PROJECT_UNKNOWN_INPUT_CANVAS', `MappingRegion ${region.id} references unknown InputCanvas ${region.inputCanvasId}`)
    if (!screens.has(region.screenId)) fail('PROJECT_UNKNOWN_SCREEN', `MappingRegion ${region.id} references unknown Screen ${region.screenId}`)
    if (grids.get(region.gridId)?.screenId !== region.screenId) {
      fail('PROJECT_REGION_GRID_PARENT_MISMATCH', `MappingRegion ${region.id} references a CabinetGrid outside its Screen`)
    }
    nonnegative(region.position.x, `MappingRegion ${region.id} x`)
    nonnegative(region.position.y, `MappingRegion ${region.id} y`)
    positive(region.size.width, `MappingRegion ${region.id} width`)
    positive(region.size.height, `MappingRegion ${region.id} height`)
  }
  const occupiedCabinets = new Set<string>()
  for (const cabinet of cabinets.values()) {
    const grid = grids.get(cabinet.gridId)
    if (!grid) fail('PROJECT_UNKNOWN_GRID', `Cabinet ${cabinet.id} references unknown CabinetGrid ${cabinet.gridId}`)
    nonnegative(cabinet.column, `Cabinet ${cabinet.id} column`)
    nonnegative(cabinet.row, `Cabinet ${cabinet.id} row`)
    if (cabinet.column >= grid.columns || cabinet.row >= grid.rows) fail('PROJECT_CABINET_OUT_OF_RANGE', `Cabinet ${cabinet.id} is outside CabinetGrid ${grid.id}`)
    nonnegative(cabinet.origin.x, `Cabinet ${cabinet.id} origin x`)
    nonnegative(cabinet.origin.y, `Cabinet ${cabinet.id} origin y`)
    positive(cabinet.width, `Cabinet ${cabinet.id} width`)
    positive(cabinet.height, `Cabinet ${cabinet.id} height`)
    positive(cabinet.pixelWidth, `Cabinet ${cabinet.id} pixel width`)
    positive(cabinet.pixelHeight, `Cabinet ${cabinet.id} pixel height`)
    positive(cabinet.moduleColumns, `Cabinet ${cabinet.id} module columns`)
    positive(cabinet.moduleRows, `Cabinet ${cabinet.id} module rows`)
    if (!Number.isSafeInteger(cabinet.rotation)) fail('PROJECT_INVALID_GEOMETRY', `Cabinet ${cabinet.id} rotation must be a signed safe integer`)
    if (typeof cabinet.flipH !== 'boolean' || typeof cabinet.flipV !== 'boolean') {
      fail('PROJECT_INVALID_GEOMETRY', `Cabinet ${cabinet.id} flips must be boolean`)
    }
    const cell = `${cabinet.gridId}:${cabinet.column},${cabinet.row}`
    if (occupiedCabinets.has(cell)) fail('PROJECT_DUPLICATE_CELL', `CabinetGrid ${cabinet.gridId} cell ${cabinet.column},${cabinet.row} is occupied twice`)
    occupiedCabinets.add(cell)
  }
  const occupiedModules = new Set<string>()
  for (const module of project.design.modules) {
    const cabinet = cabinets.get(module.cabinetId)
    if (!cabinet) fail('PROJECT_UNKNOWN_CABINET', `Module ${module.id} references unknown Cabinet ${module.cabinetId}`)
    nonnegative(module.column, `Module ${module.id} column`)
    nonnegative(module.row, `Module ${module.id} row`)
    if (module.column >= cabinet.moduleColumns || module.row >= cabinet.moduleRows) fail('PROJECT_MODULE_OUT_OF_RANGE', `Module ${module.id} is outside Cabinet ${cabinet.id}`)
    positive(module.width, `Module ${module.id} width`)
    positive(module.height, `Module ${module.id} height`)
    positive(module.pixelWidth, `Module ${module.id} pixel width`)
    positive(module.pixelHeight, `Module ${module.id} pixel height`)
    if (cabinet.moduleColumns * module.width !== cabinet.width || cabinet.moduleRows * module.height !== cabinet.height ||
        cabinet.moduleColumns * module.pixelWidth !== cabinet.pixelWidth || cabinet.moduleRows * module.pixelHeight !== cabinet.pixelHeight) {
      fail('PROJECT_MODULE_GRID_MISMATCH', `Module ${module.id} does not tile Cabinet ${cabinet.id}`)
    }
    const cell = `${cabinet.id}:${module.column},${module.row}`
    if (occupiedModules.has(cell)) fail('PROJECT_DUPLICATE_CELL', `Cabinet ${cabinet.id} module cell ${module.column},${module.row} is occupied twice`)
    occupiedModules.add(cell)
  }
}
