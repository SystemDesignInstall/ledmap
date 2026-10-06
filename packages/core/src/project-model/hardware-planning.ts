import { cabinetIndex } from '../cabinet-engine/index.js'
import { portPixelCapacity, sameCapacityMode } from './capacity-profile.js'
import type { AllocationDiagnostic, AllocationProposal } from '../hardware-engine/allocate.js'
import { assertSafeInteger, safeAdd, safeProduct } from '../hardware-engine/validation.js'
import { DomainError } from '../model/errors.js'
import type { CabinetId, PortId, ProcessorId, ReceiverId } from '../model/ids.js'
import type { ProjectDiagnostic } from '../validation/types.js'
import { createProjectV2 } from './create.js'
import { selectV2HardwareEngineInput } from './direct-engine-inputs.js'
import { asHardwareAssignmentId, asSignalRouteId } from './ids.js'
import { validateProjectV2Structural } from './structural-validation.js'
import type { LedMapProjectV2 } from './types.js'
import { assertProjectV2EditorStructure } from './validate.js'

export interface ProjectPixelLoad {
  readonly used: number
  readonly capacity: number | null
  readonly headroom: number | null
}

export interface ProjectReceiverLoad extends ProjectPixelLoad {
  readonly receiverId: ReceiverId
  readonly cabinetIds: readonly CabinetId[]
}

export interface ProjectPortLoad extends ProjectPixelLoad {
  readonly portId: PortId
  readonly receiversUsed: number
  readonly receiverCapacity: number
}

export interface ProjectProcessorLoad extends ProjectPixelLoad {
  readonly processorId: ProcessorId
  readonly portsUsed: number
  readonly portCapacity: number
}

export interface ProjectHardwareLoad {
  readonly totalPixels: number
  readonly assignedPixels: number
  readonly unpatchedPixels: number
  readonly unpatched: readonly CabinetId[]
  readonly receivers: readonly ProjectReceiverLoad[]
  readonly ports: readonly ProjectPortLoad[]
  readonly processors: readonly ProjectProcessorLoad[]
}

export interface ProjectHardwarePlan extends AllocationProposal {
  readonly project: LedMapProjectV2
  readonly load: ProjectHardwareLoad
  readonly unpatched: readonly CabinetId[]
}

export function selectProjectCabinetSignalOrder(project: LedMapProjectV2): readonly CabinetId[] {
  assertProjectV2EditorStructure(project)
  const grids = new Map(project.design.cabinetGrids.map(grid => [grid.id, grid]))
  const grouped = new Map<string, typeof project.design.cabinets[number][]>()
  for (const cabinet of project.design.cabinets) {
    const cabinets = grouped.get(cabinet.gridId) ?? []
    cabinets.push(cabinet)
    grouped.set(cabinet.gridId, cabinets)
  }
  return Object.freeze(project.design.screens.flatMap(screen => screen.cabinetGridOrder.flatMap(gridId => {
    const grid = grids.get(gridId)!
    return (grouped.get(gridId) ?? []).map(cabinet => ({ id: cabinet.id, index: cabinetIndex(grid, cabinet) }))
      .sort((left, right) => left.index - right.index).map(cabinet => cabinet.id)
  })))
}

export function selectProjectHardwareLoad(project: LedMapProjectV2): ProjectHardwareLoad {
  const invalid = validateProjectV2Structural(project)[0]
  if (invalid) throw new DomainError(invalid.code, invalid.message)
  const pixels = new Map(project.design.cabinets.map(cabinet => [
    cabinet.id, safeProduct(`Cabinet ${cabinet.id} pixels`, cabinet.pixelWidth, cabinet.pixelHeight),
  ] as const))
  const assigned = new Set(project.hardware.assignments.map(assignment => assignment.target.cabinetId))
  const chains = new Map(project.operations.signalRoutes.map(route => [route.receiverId, route.orderedCabinetIds]))
  const unpatched = selectProjectCabinetSignalOrder(project).filter(id => !assigned.has(id))
  const sum = (values: readonly number[]) => values.reduce((total, value) => safeAdd('Project pixel load', total, value), 0)
  const receivers = project.hardware.receivers.map(receiver => {
    if (receiver.pixelCapacity !== undefined) assertSafeInteger(`Receiver ${receiver.id} capacity`, receiver.pixelCapacity, 1)
    const cabinetIds = chains.get(receiver.id) ?? []
    const used = sum(cabinetIds.map(id => pixels.get(id)!))
    const capacity = receiver.pixelCapacity ?? null
    return Object.freeze({ receiverId: receiver.id, cabinetIds: Object.freeze([...cabinetIds]), used,
      capacity, headroom: capacity === null ? null : capacity - used })
  })
  const receiversById = new Map(receivers.map(receiver => [receiver.receiverId, receiver]))
  const receiverGroups = new Map<string, ProjectReceiverLoad[]>()
  for (const receiver of project.hardware.receivers) {
    const group = receiverGroups.get(receiver.portId) ?? []
    group.push(receiversById.get(receiver.id)!)
    receiverGroups.set(receiver.portId, group)
  }
  const ports = project.hardware.ports.map(port => {
    assertSafeInteger(`Port ${port.id} capacity`, port.receiverCapacity, 1)
    const group = receiverGroups.get(port.id) ?? []
    const used = sum(group.map(receiver => receiver.used))
    const capacity = portPixelCapacity(project, port)
    return Object.freeze({ portId: port.id, used, capacity,
      headroom: capacity === null ? null : capacity - used, receiversUsed: group.length, receiverCapacity: port.receiverCapacity })
  })
  const portsById = new Map(ports.map(port => [port.portId, port]))
  const portGroups = new Map<string, ProjectPortLoad[]>()
  for (const port of project.hardware.ports) {
    const group = portGroups.get(port.processorId) ?? []
    group.push(portsById.get(port.id)!)
    portGroups.set(port.processorId, group)
  }
  const processors = project.hardware.processors.map(processor => {
    assertSafeInteger(`Processor ${processor.id} capacity`, processor.portCount, 1)
    const group = portGroups.get(processor.id) ?? []
    const used = sum(group.map(port => port.used))
    const capacity = processor.capacityProfile?.processorPixelCapacity ?? null
    return Object.freeze({ processorId: processor.id, used, capacity,
      headroom: capacity === null ? null : capacity - used, portsUsed: group.length, portCapacity: processor.portCount })
  })
  return Object.freeze({ totalPixels: sum([...pixels.values()]), assignedPixels: sum(receivers.map(receiver => receiver.used)),
    unpatchedPixels: sum(unpatched.map(id => pixels.get(id)!)), unpatched: Object.freeze(unpatched),
    receivers: Object.freeze(receivers), ports: Object.freeze(ports), processors: Object.freeze(processors) })
}

export function projectHardwareDiagnostics(project: LedMapProjectV2, load: ProjectHardwareLoad): readonly ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = []
  function issue(code: string, path: readonly (string | number)[], message: string, severity: 'error' | 'warning' = 'error'): void {
    diagnostics.push(Object.freeze({ severity, stage: 'hardware', code, path: Object.freeze([...path]), message }))
  }
  const assigned = new Set(project.hardware.assignments.map(assignment => assignment.target.cabinetId))
  project.design.cabinets.forEach((cabinet, index) => {
    if (!assigned.has(cabinet.id)) issue('HARDWARE_UNPATCHED', ['design', 'cabinets', index], `Cabinet ${cabinet.id} is not assigned to a Receiver`)
  })
  load.receivers.forEach((receiver, index) => {
    if (receiver.capacity === null) issue('HARDWARE_CAPACITY_UNKNOWN', ['hardware', 'receivers', index, 'pixelCapacity'],
      `Receiver ${receiver.receiverId} pixel capacity is unknown; automatic placement is disabled for it`, 'warning')
    else if (receiver.used > receiver.capacity) issue('HARDWARE_RECEIVER_OVER_CAPACITY', ['hardware', 'receivers', index],
      `Receiver ${receiver.receiverId} uses ${receiver.used} of ${receiver.capacity} pixels`)
  })
  load.ports.forEach((port, index) => {
    if (port.capacity !== null && port.used > port.capacity) issue('HARDWARE_PORT_PIXEL_OVER_CAPACITY', ['hardware', 'ports', index],
      `Port ${port.portId} uses ${port.used} of ${port.capacity} pixels`)
    const source = project.hardware.ports[index]!
    const profile = project.hardware.processors.find(value => value.id === source.processorId)?.capacityProfile
    if (source.pixelCapacityOverride && (!profile || !sameCapacityMode(source.pixelCapacityOverride.mode, profile.mode))) {
      issue('HARDWARE_CAPACITY_OVERRIDE_INACTIVE', ['hardware', 'ports', index, 'pixelCapacityOverride'],
        `Port ${port.portId} override is inactive because its mode does not match a configured Processor profile`, 'warning')
    }
    if (port.receiversUsed > port.receiverCapacity) issue('HARDWARE_PORT_OVER_CAPACITY', ['hardware', 'ports', index],
      `Port ${port.portId} uses ${port.receiversUsed} of ${port.receiverCapacity} Receiver slots`)
  })
  load.processors.forEach((processor, index) => {
    if (processor.capacity !== null && processor.used > processor.capacity) issue('HARDWARE_PROCESSOR_PIXEL_OVER_CAPACITY', ['hardware', 'processors', index],
      `Processor ${processor.processorId} uses ${processor.used} of ${processor.capacity} pixels`)
    if (processor.portsUsed > processor.portCapacity) issue('HARDWARE_PROCESSOR_OVER_CAPACITY', ['hardware', 'processors', index],
      `Processor ${processor.processorId} uses ${processor.portsUsed} of ${processor.portCapacity} Port slots`)
  })
  if (load.ports.some(value => value.capacity === null) || load.processors.some(value => value.capacity === null)) {
    issue('HARDWARE_TRANSPORT_CAPACITY_UNKNOWN', ['hardware'],
      'Some Port or Processor transport pixel limits are unknown; configure an explicit mode/profile to calculate headroom', 'warning')
  }
  const orderedProcessors = new Set(project.hardware.processorOrder)
  project.hardware.processors.forEach((processor, index) => {
    if (!orderedProcessors.has(processor.id)) issue('HARDWARE_INCOMPLETE', ['hardware', 'processors', index], `Processor ${processor.id} is missing from Processor order`)
  })
  const orders = new Map(project.hardware.receiverOrder.map(order => [order.portId, order]))
  project.hardware.ports.forEach((port, index) => {
    if (!orders.has(port.id)) issue('HARDWARE_INCOMPLETE', ['hardware', 'ports', index], `Port ${port.id} has no Receiver order`)
  })
  const orderedReceivers = new Set(project.hardware.receiverOrder.flatMap(order => order.receiverIds))
  project.hardware.receivers.forEach((receiver, index) => {
    if (!orderedReceivers.has(receiver.id)) issue('HARDWARE_INCOMPLETE', ['hardware', 'receivers', index], `Receiver ${receiver.id} is missing from Receiver order`)
  })
  return Object.freeze(diagnostics)
}

function nextIntentId(ids: Set<string>, kind: string, sourceId: string): string {
  const base = `${kind}:${sourceId.length}:${sourceId}`
  let id = base
  let serial = 1
  while (ids.has(id)) id = `${base}:${serial++}`
  ids.add(id)
  return id
}

export function planProjectHardware(project: LedMapProjectV2): ProjectHardwarePlan {
  const before = selectProjectHardwareLoad(project)
  const invalid = projectHardwareDiagnostics(project, before).find(issue => issue.code === 'HARDWARE_INCOMPLETE' ||
    issue.code === 'HARDWARE_PORT_OVER_CAPACITY' || issue.code === 'HARDWARE_PROCESSOR_OVER_CAPACITY')
  if (invalid) throw new DomainError(invalid.code, invalid.message)
  const receiverById = new Map(project.hardware.receivers.map(receiver => [receiver.id, receiver]))
  const ports = project.hardware.processorOrder.flatMap(id => project.hardware.ports
    .filter(port => port.processorId === id).sort((left, right) => left.index - right.index))
  const orders = new Map(project.hardware.receiverOrder.map(order => [order.portId, order.receiverIds]))
  const traversal = ports.flatMap(port => orders.get(port.id)!.map(id => receiverById.get(id)!))
  const used = new Map(before.receivers.map(receiver => [receiver.receiverId, receiver.used]))
  const portLoads = new Map(before.ports.map(port => [port.portId, { ...port }]))
  const processorLoads = new Map(before.processors.map(processor => [processor.processorId, { ...processor }]))
  const profiled = new Set(project.hardware.processors.filter(value => value.capacityProfile !== undefined).map(value => value.id))
  const chains = new Map(project.operations.signalRoutes.map(route => [route.receiverId, [...route.orderedCabinetIds]]))
  const pixels = new Map(project.design.cabinets.map(cabinet => [cabinet.id, cabinet.pixelWidth * cabinet.pixelHeight]))
  const assignments = [...project.hardware.assignments]
  const assignmentIds = new Set(assignments.map(assignment => assignment.id as string))
  for (const cabinetId of before.unpatched) {
    const count = pixels.get(cabinetId)!
    const receiver = traversal.find(value => {
      const port = portLoads.get(value.portId)!
      const processor = processorLoads.get(value.processorId)!
      const configured = profiled.has(value.processorId)
      return value.pixelCapacity !== undefined && count <= value.pixelCapacity - used.get(value.id)! &&
        (port.capacity === null ? !configured : count <= port.capacity - port.used) &&
        (processor.capacity === null ? !configured : count <= processor.capacity - processor.used)
    })
    if (!receiver) continue
    used.set(receiver.id, safeAdd('Receiver pixel load', used.get(receiver.id)!, count))
    const portLoad = portLoads.get(receiver.portId)!
    const processorLoad = processorLoads.get(receiver.processorId)!
    portLoad.used = safeAdd('Port pixel load', portLoad.used, count)
    processorLoad.used = safeAdd('Processor pixel load', processorLoad.used, count)
    const chain = chains.get(receiver.id) ?? []
    chain.push(cabinetId)
    chains.set(receiver.id, chain)
    assignments.push({ id: asHardwareAssignmentId(nextIntentId(assignmentIds, 'assignment', cabinetId)),
      target: { kind: 'cabinet', cabinetId }, receiverId: receiver.id, locked: false, origin: 'auto' })
  }
  const routes = project.operations.signalRoutes.map(route => ({ ...route, orderedCabinetIds: chains.get(route.receiverId)! }))
  const routeIds = new Set(routes.map(route => route.id as string))
  for (const receiver of traversal) {
    if (routes.some(route => route.receiverId === receiver.id) || !chains.has(receiver.id)) continue
    routes.push({ id: asSignalRouteId(nextIntentId(routeIds, 'route', receiver.id)), receiverId: receiver.id,
      orderedCabinetIds: chains.get(receiver.id)! })
  }
  const candidate = assignments.length === project.hardware.assignments.length ? project : createProjectV2({ ...project,
    hardware: { ...project.hardware, assignments }, operations: { ...project.operations, signalRoutes: routes } })
  const load = selectProjectHardwareLoad(candidate)
  const diagnostics: AllocationDiagnostic[] = []
  for (const id of project.hardware.processorOrder) {
    const processor = load.processors.find(value => value.processorId === id)!
    if (processor.portsUsed < processor.portCapacity) diagnostics.push(Object.freeze({ level: 'processor', processor: id,
      unit: 'ports', used: processor.portsUsed, capacity: processor.portCapacity }))
  }
  for (const port of ports) {
    const portLoad = load.ports.find(value => value.portId === port.id)!
    if (portLoad.receiversUsed < portLoad.receiverCapacity) diagnostics.push(Object.freeze({ level: 'port', port: port.id,
      unit: 'receivers', used: portLoad.receiversUsed, capacity: portLoad.receiverCapacity }))
    for (const id of orders.get(port.id)!) {
      const receiver = load.receivers.find(value => value.receiverId === id)!
      if (receiver.capacity !== null && receiver.used < receiver.capacity) diagnostics.push(Object.freeze({
        level: 'receiver', receiver: id, unit: 'pixels', used: receiver.used, capacity: receiver.capacity }))
    }
  }
  return Object.freeze({ project: candidate, topology: selectV2HardwareEngineInput(candidate), load,
    unpatched: load.unpatched, diagnostics: Object.freeze(diagnostics) })
}
