import {
  LEDMAP_GENERIC_REF001,
  allocateHardware,
  asHardwareAssignmentId,
  asSignalRouteId,
  cabinetOrder,
  createPort,
  createProcessor,
  createReceiver,
  projectV2AsEditableReadModel,
  type AllocationProposal,
  type CabinetId,
  type LedMapProjectV2,
} from '@ledmap/core'

const processorPorts = LEDMAP_GENERIC_REF001.processorProfiles[0]!.maxPorts ?? 4
const portReceivers = LEDMAP_GENERIC_REF001.portProfiles[0]!.maxReceivers ?? 2
const receiverPixels = LEDMAP_GENERIC_REF001.receiverProfiles[0]!.maxTransportPixels ?? 65536

function nextId(records: readonly { readonly id: string }[], prefix: string): string {
  const ids = new Set(records.map(record => record.id))
  let serial = records.length + 1
  while (ids.has(`${prefix}${serial}`)) serial += 1
  return `${prefix}${serial}`
}

function compatibilityId(kind: string, sourceId: string): string {
  return `${kind}:${sourceId.length}:${sourceId}`
}

function processorOf(project: LedMapProjectV2, id: string) {
  const processor = project.hardware.processors.find(value => value.id === id)
  if (!processor) throw new Error(`Unknown Processor: ${id}`)
  return processor
}

function portOf(project: LedMapProjectV2, id: string) {
  const port = project.hardware.ports.find(value => value.id === id)
  if (!port) throw new Error(`Unknown Port: ${id}`)
  return port
}

function receiverOf(project: LedMapProjectV2, id: string) {
  const receiver = project.hardware.receivers.find(value => value.id === id)
  if (!receiver) throw new Error(`Unknown Receiver: ${id}`)
  return receiver
}

function chainOf(project: LedMapProjectV2, receiverId: string): readonly CabinetId[] {
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)?.orderedCabinetIds ?? []
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function orderedCabinets(project: LedMapProjectV2): readonly CabinetId[] {
  const ordered: CabinetId[] = []
  for (const screen of project.design.screens) {
    for (const gridId of screen.cabinetGridOrder) {
      const grid = project.design.cabinetGrids.find(value => value.id === gridId)
      if (!grid) continue
      const positions = cabinetOrder({ columns: grid.columns, rows: grid.rows, ordering: grid.ordering })
      for (const position of positions) {
        const cabinet = project.design.cabinets.find(value => value.gridId === grid.id && value.column === position.column && value.row === position.row)
        if (cabinet) ordered.push(cabinet.id)
      }
    }
  }
  return ordered
}

export function orderedSelectedCabinetsV2(project: LedMapProjectV2, selectedIds: readonly string[]): readonly CabinetId[] {
  const selected = new Set(selectedIds)
  const ordered = orderedCabinets(project).filter(id => selected.has(id))
  if (ordered.length !== selected.size) {
    const known = new Set<string>(ordered)
    const missing = selectedIds.find(id => !known.has(id))
    throw new Error(`Unknown Cabinet: ${missing}`)
  }
  return ordered
}

function withChains(project: LedMapProjectV2, chains: ReadonlyMap<string, readonly CabinetId[]>): LedMapProjectV2 {
  const previous = new Map(project.hardware.assignments.map(assignment => [assignment.target.cabinetId, assignment]))
  const assignments = project.hardware.receivers.flatMap(receiver => (chains.get(receiver.id) ?? chainOf(project, receiver.id)).map(cabinetId => {
    const existing = previous.get(cabinetId)
    return existing
      ? { ...existing, receiverId: receiver.id }
      : {
          id: asHardwareAssignmentId(compatibilityId('assignment', cabinetId)),
          target: { kind: 'cabinet' as const, cabinetId },
          receiverId: receiver.id,
          locked: true,
        }
  }))
  const signalRoutes = project.hardware.receivers.flatMap(receiver => {
    const orderedCabinetIds = chains.get(receiver.id) ?? chainOf(project, receiver.id)
    if (orderedCabinetIds.length === 0) return []
    const existing = project.operations.signalRoutes.find(route => route.receiverId === receiver.id)
    return [{
      id: existing?.id ?? asSignalRouteId(compatibilityId('route', receiver.id)),
      receiverId: receiver.id,
      orderedCabinetIds,
    }]
  })
  return {
    ...project,
    hardware: { ...project.hardware, assignments },
    operations: { ...project.operations, signalRoutes },
  }
}

export function addProcessorV2(project: LedMapProjectV2, name?: string): LedMapProjectV2 {
  const id = nextId(project.hardware.processors, 'processor-')
  const processor = createProcessor({
    id,
    name: name?.trim() || `Processor ${project.hardware.processors.length + 1}`,
    portCount: processorPorts,
  })
  return { ...project, hardware: {
    ...project.hardware,
    processors: [...project.hardware.processors, processor],
    processorOrder: [...project.hardware.processorOrder, processor.id],
  } }
}

export function renameProcessorV2(project: LedMapProjectV2, processorId: string, name: string): LedMapProjectV2 {
  processorOf(project, processorId)
  const normalized = name.trim()
  if (!normalized) throw new Error('Processor name cannot be empty.')
  return { ...project, hardware: { ...project.hardware,
    processors: project.hardware.processors.map(value => value.id === processorId ? { ...value, name: normalized } : value),
  } }
}

export function setProcessorPortCountV2(project: LedMapProjectV2, processorId: string, portCount: number): LedMapProjectV2 {
  const processor = processorOf(project, processorId)
  const updated = createProcessor({ ...processor, portCount })
  const required = project.hardware.ports.filter(port => port.processorId === processor.id)
    .reduce((maximum, port) => Math.max(maximum, port.index + 1), 0)
  if (portCount < required) throw new Error(`Processor requires at least ${required} Ports for its current indices.`)
  return { ...project, hardware: { ...project.hardware,
    processors: project.hardware.processors.map(value => value.id === processor.id ? updated : value),
  } }
}

export function deleteProcessorV2(project: LedMapProjectV2, processorId: string): LedMapProjectV2 {
  processorOf(project, processorId)
  if (project.hardware.ports.some(port => port.processorId === processorId) ||
      project.hardware.receivers.some(receiver => receiver.processorId === processorId)) {
    throw new Error(`Processor ${processorId} still has dependent Hardware entities.`)
  }
  return { ...project, hardware: { ...project.hardware,
    processors: project.hardware.processors.filter(value => value.id !== processorId),
    processorOrder: project.hardware.processorOrder.filter(id => id !== processorId),
  } }
}

export function addPortV2(project: LedMapProjectV2, processorId: string): LedMapProjectV2 {
  const processor = processorOf(project, processorId)
  const indices = new Set(project.hardware.ports.filter(port => port.processorId === processor.id).map(port => port.index))
  const index = Array.from({ length: processor.portCount }, (_, value) => value).find(value => !indices.has(value))
  if (index === undefined) throw new Error(`${processor.name} already uses all ${processor.portCount} Port slots.`)
  const port = createPort({ id: nextId(project.hardware.ports, 'port-'), processor: processor.id, index, receiverCapacity: portReceivers })
  return { ...project, hardware: { ...project.hardware,
    ports: [...project.hardware.ports, { id: port.id, processorId: port.processor, index: port.index, receiverCapacity: port.receiverCapacity }],
    receiverOrder: [...project.hardware.receiverOrder, { portId: port.id, receiverIds: [] }],
  } }
}

export function updatePortV2(
  project: LedMapProjectV2,
  portId: string,
  patch: { readonly index?: number; readonly receiverCapacity?: number },
): LedMapProjectV2 {
  const port = portOf(project, portId)
  const processor = processorOf(project, port.processorId)
  const updated = createPort({
    id: port.id, processor: port.processorId,
    index: patch.index ?? port.index,
    receiverCapacity: patch.receiverCapacity ?? port.receiverCapacity,
  })
  if (updated.index >= processor.portCount) throw new Error(`Port index must be below ${processor.portCount}.`)
  if (project.hardware.ports.some(value => value.id !== port.id && value.processorId === port.processorId && value.index === updated.index)) {
    throw new Error(`Port index ${updated.index} is already used by ${processor.name}.`)
  }
  const used = project.hardware.receivers.filter(receiver => receiver.portId === port.id).length
  if (updated.receiverCapacity < used) throw new Error(`Port capacity cannot be below ${used} assigned Receivers.`)
  return { ...project, hardware: { ...project.hardware,
    ports: project.hardware.ports.map(value => value.id === port.id
      ? { id: updated.id, processorId: updated.processor, index: updated.index, receiverCapacity: updated.receiverCapacity }
      : value),
  } }
}

export function deletePortV2(project: LedMapProjectV2, portId: string): LedMapProjectV2 {
  portOf(project, portId)
  const orders = project.hardware.receiverOrder.filter(order => order.portId === portId)
  if (project.hardware.receivers.some(receiver => receiver.portId === portId) ||
      orders.length !== 1 || orders[0]!.receiverIds.length > 0) {
    throw new Error(`Port ${portId} still has dependent Hardware entities.`)
  }
  return { ...project, hardware: { ...project.hardware,
    ports: project.hardware.ports.filter(value => value.id !== portId),
    receiverOrder: project.hardware.receiverOrder.filter(value => value.portId !== portId),
  } }
}

export function addReceiverV2(project: LedMapProjectV2, portId: string): LedMapProjectV2 {
  const port = portOf(project, portId)
  const order = project.hardware.receiverOrder.find(value => value.portId === port.id)
  if (!order) throw new Error(`Receiver order is missing for Port ${port.id}.`)
  if (order.receiverIds.length >= port.receiverCapacity) throw new Error(`Port ${port.id} already uses all Receiver slots.`)
  const receiver = createReceiver({
    id: nextId(project.hardware.receivers, 'receiver-'),
    index: order.receiverIds.length,
    processor: port.processorId,
    port: port.id,
    pixelCapacity: receiverPixels,
  })
  return { ...project, hardware: { ...project.hardware,
    receivers: [...project.hardware.receivers, {
      id: receiver.id, legacyIndex: receiver.index, processorId: receiver.processor,
      portId: receiver.port,
      ...(receiver.pixelCapacity === undefined ? {} : { pixelCapacity: receiver.pixelCapacity }),
    }],
    receiverOrder: project.hardware.receiverOrder.map(value => value.portId === port.id
      ? { ...value, receiverIds: [...value.receiverIds, receiver.id] }
      : value),
  } }
}

export function updateReceiverV2(
  project: LedMapProjectV2,
  receiverId: string,
  patch: { readonly index?: number; readonly pixelCapacity?: number },
): LedMapProjectV2 {
  const receiver = receiverOf(project, receiverId)
  const updated = createReceiver({
    id: receiver.id, index: patch.index ?? receiver.legacyIndex,
    processor: receiver.processorId, port: receiver.portId,
    ...((patch.pixelCapacity ?? receiver.pixelCapacity) === undefined ? {} : { pixelCapacity: patch.pixelCapacity ?? receiver.pixelCapacity }),
  })
  const used = chainOf(project, receiver.id).reduce((total, id) => total + cabinetPixels(project, id), 0)
  if (updated.pixelCapacity !== undefined && updated.pixelCapacity < used) {
    throw new Error(`Receiver capacity cannot be below ${used.toLocaleString('en-US')} assigned pixels.`)
  }
  return { ...project, hardware: { ...project.hardware,
    receivers: project.hardware.receivers.map(value => value.id === receiver.id ? {
      ...value, legacyIndex: updated.index,
      ...(updated.pixelCapacity === undefined ? {} : { pixelCapacity: updated.pixelCapacity }),
    } : value),
  } }
}

export function deleteReceiverV2(project: LedMapProjectV2, receiverId: string): LedMapProjectV2 {
  const receiver = receiverOf(project, receiverId)
  if (project.hardware.assignments.some(assignment => assignment.receiverId === receiver.id) ||
      project.operations.signalRoutes.some(route => route.receiverId === receiver.id)) {
    throw new Error(`Receiver ${receiverId} still has Cabinet assignments or a SignalRoute.`)
  }
  const order = project.hardware.receiverOrder.find(value => value.portId === receiver.portId)
  if (!order || !order.receiverIds.includes(receiver.id)) throw new Error(`Receiver ${receiverId} is missing from its Port order.`)
  return { ...project, hardware: { ...project.hardware,
    receivers: project.hardware.receivers.filter(value => value.id !== receiver.id),
    receiverOrder: project.hardware.receiverOrder.map(value => value.portId === receiver.portId
      ? { ...value, receiverIds: value.receiverIds.filter(id => id !== receiver.id) }
      : value),
  } }
}

export function moveProcessorV2(project: LedMapProjectV2, processorId: string, delta: -1 | 1): LedMapProjectV2 {
  const order = [...project.hardware.processorOrder]
  const index = order.findIndex(id => id === processorId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return project
  ;[order[index], order[target]] = [order[target]!, order[index]!]
  return { ...project, hardware: { ...project.hardware, processorOrder: order } }
}

export function moveReceiverV2(project: LedMapProjectV2, receiverId: string, delta: -1 | 1): LedMapProjectV2 {
  const receiver = receiverOf(project, receiverId)
  const orders = project.hardware.receiverOrder.map(order => {
    if (order.portId !== receiver.portId) return order
    const receiverIds = [...order.receiverIds]
    const index = receiverIds.indexOf(receiver.id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= receiverIds.length) return order
    ;[receiverIds[index], receiverIds[target]] = [receiverIds[target]!, receiverIds[index]!]
    return { ...order, receiverIds }
  })
  return { ...project, hardware: { ...project.hardware, receiverOrder: orders } }
}

function cabinetPixels(project: LedMapProjectV2, cabinetId: CabinetId): number {
  const cabinet = project.design.cabinets.find(value => value.id === cabinetId)
  if (!cabinet) throw new Error(`Unknown Cabinet: ${cabinetId}`)
  const pixels = cabinet.pixelWidth * cabinet.pixelHeight
  if (!Number.isSafeInteger(pixels)) throw new Error(`Cabinet ${cabinet.id} pixel count exceeds the safe integer range.`)
  return pixels
}

export function assignCabinetsV2(project: LedMapProjectV2, receiverId: string, orderedCabinetIds: readonly string[]): LedMapProjectV2 {
  const receiver = receiverOf(project, receiverId)
  const selected = new Set(orderedCabinetIds)
  const known = new Set<string>(project.design.cabinets.map(cabinet => cabinet.id))
  for (const id of selected) if (!known.has(id)) throw new Error(`Unknown Cabinet: ${id}`)
  const ordered = orderedCabinetIds.filter((id, index) => orderedCabinetIds.indexOf(id) === index) as CabinetId[]
  const chains = new Map<string, readonly CabinetId[]>()
  for (const value of project.hardware.receivers) {
    const remaining = chainOf(project, value.id).filter(id => !selected.has(id))
    chains.set(value.id, value.id === receiver.id ? [...remaining, ...ordered] : remaining)
  }
  const target = chains.get(receiver.id)!
  const used = target.reduce((total, id) => total + cabinetPixels(project, id), 0)
  if (receiver.pixelCapacity !== undefined && used > receiver.pixelCapacity) {
    throw new Error(`Assignment uses ${used.toLocaleString('en-US')} of ${receiver.pixelCapacity.toLocaleString('en-US')} Receiver pixels.`)
  }
  if (project.hardware.receivers.every(value => sameIds(chainOf(project, value.id), chains.get(value.id)!))) return project
  return withChains(project, chains)
}

export function unassignCabinetsV2(project: LedMapProjectV2, receiverId: string, cabinetIds: readonly string[]): LedMapProjectV2 {
  receiverOf(project, receiverId)
  const selected = new Set(cabinetIds)
  const before = chainOf(project, receiverId)
  const after = before.filter(id => !selected.has(id))
  if (sameIds(before, after)) return project
  return withChains(project, new Map([[receiverId, after]]))
}

export function previewHardwareAllocationV2(project: LedMapProjectV2): AllocationProposal {
  const assigned = new Set(project.hardware.assignments.map(value => value.target.cabinetId))
  const cabinetOrder = orderedCabinets(project).filter(id => !assigned.has(id))
  const topology = projectV2AsEditableReadModel(project).hardwareTopology
  return allocateHardware({ ...topology, cabinetOrder })
}

export function requireCurrentHardwarePreview(
  expected: { readonly documentId: string; readonly revision: number },
  current: { readonly documentId: string; readonly revision: number },
): void {
  if (expected.documentId !== current.documentId || expected.revision !== current.revision) {
    throw new Error('Hardware allocation preview is stale.')
  }
}

export function applyHardwareAllocationV2(project: LedMapProjectV2, proposal: AllocationProposal): LedMapProjectV2 {
  const fresh = previewHardwareAllocationV2(project)
  if (JSON.stringify(fresh.topology) !== JSON.stringify(proposal.topology)) {
    throw new Error('Hardware allocation preview is stale.')
  }
  const chains = new Map<string, readonly CabinetId[]>(proposal.topology.receivers.map(receiver => [receiver.id, receiver.cabinets]))
  if (project.hardware.receivers.every(receiver => sameIds(chainOf(project, receiver.id), chains.get(receiver.id) ?? []))) return project
  return withChains(project, chains)
}
