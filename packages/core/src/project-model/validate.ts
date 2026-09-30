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
