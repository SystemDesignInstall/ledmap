import {
  LEDMAP_GENERIC_REF001,
  allocateHardware,
  cabinetOrder,
  createPort,
  createProcessor,
  createReceiver,
  type AllocationProposal,
  type CabinetId,
  type HardwareTopologyInput,
  type Port,
  type Processor,
  type Receiver,
} from '@ledmap/core'
import { createProject, type Project } from './project.js'

const processorDefaults = LEDMAP_GENERIC_REF001.processorProfiles[0]!
const portDefaults = LEDMAP_GENERIC_REF001.portProfiles[0]!
const receiverDefaults = LEDMAP_GENERIC_REF001.receiverProfiles[0]!

export const genericHardwareDefaults = Object.freeze({
  processorPorts: processorDefaults.maxPorts ?? 4,
  portReceivers: portDefaults.maxReceivers ?? 2,
  receiverPixels: receiverDefaults.maxTransportPixels ?? 65536,
})

export interface ReceiverUsage {
  readonly receiver: Receiver
  readonly used: number
  readonly capacity: number | null
}

function nextId(records: readonly { readonly id: string }[], prefix: string): string {
  const ids = new Set<string>(records.map(record => record.id))
  let serial = records.length + 1
  while (ids.has(`${prefix}${serial}`)) serial += 1
  return `${prefix}${serial}`
}

function replaceTopology(project: Project, hardwareTopology: HardwareTopologyInput): Project {
  return createProject({ ...project.source, hardwareTopology })
}

function topology(project: Project, patch: Partial<HardwareTopologyInput>): HardwareTopologyInput {
  return { ...project.source.hardwareTopology, ...patch }
}

export function findProcessor(project: Project, processorId: string): Processor | undefined {
  return project.source.hardwareTopology.processors.find(processor => processor.id === processorId)
}

export function findPort(project: Project, portId: string): Port | undefined {
  return project.source.hardwareTopology.ports.find(port => port.id === portId)
}

export function findReceiver(project: Project, receiverId: string): Receiver | undefined {
  return project.source.hardwareTopology.receivers.find(receiver => receiver.id === receiverId)
}

export function addProcessor(project: Project, name?: string): Project {
  const source = project.source.hardwareTopology
  const id = nextId(source.processors, 'processor-')
  const processor = createProcessor({
    id,
    name: name?.trim() || `Processor ${source.processors.length + 1}`,
    portCount: genericHardwareDefaults.processorPorts,
  })
  return replaceTopology(project, topology(project, {
    processors: [...source.processors, processor],
    processorOrder: [...source.processorOrder, processor.id],
  }))
}

export function renameProcessor(project: Project, processorId: string, name: string): Project {
  const processor = findProcessor(project, processorId)
  if (!processor) throw new Error(`Unknown Processor: ${processorId}`)
  const normalized = name.trim()
  if (!normalized) throw new Error('Processor name cannot be empty.')
  return replaceTopology(project, topology(project, {
    processors: project.source.hardwareTopology.processors.map(value => value.id === processor.id
      ? { ...value, name: normalized }
      : value),
  }))
}

export function setProcessorPortCount(project: Project, processorId: string, portCount: number): Project {
  const processor = findProcessor(project, processorId)
  if (!processor) throw new Error(`Unknown Processor: ${processorId}`)
  const updated = createProcessor({ ...processor, portCount })
  const required = project.source.hardwareTopology.ports
    .filter(port => port.processor === processor.id)
    .reduce((maximum, port) => Math.max(maximum, port.index + 1), 0)
  if (portCount < required) throw new Error(`Processor requires at least ${required} Ports for its current indices.`)
  return replaceTopology(project, topology(project, {
    processors: project.source.hardwareTopology.processors.map(value => value.id === processor.id ? updated : value),
  }))
}

export function deleteProcessor(project: Project, processorId: string): Project {
  if (!findProcessor(project, processorId)) throw new Error(`Unknown Processor: ${processorId}`)
  const source = project.source.hardwareTopology
  const portIds = new Set(source.ports.filter(port => port.processor === processorId).map(port => port.id))
  const receiverIds = new Set(source.receivers.filter(receiver => portIds.has(receiver.port)).map(receiver => receiver.id))
  return replaceTopology(project, topology(project, {
    processors: source.processors.filter(processor => processor.id !== processorId),
    ports: source.ports.filter(port => !portIds.has(port.id)),
    receivers: source.receivers.filter(receiver => !receiverIds.has(receiver.id)),
    processorOrder: source.processorOrder.filter(id => id !== processorId),
    receiverOrder: source.receiverOrder.filter(order => !portIds.has(order.port)),
  }))
}

export function addPort(project: Project, processorId: string): Project {
  const processor = findProcessor(project, processorId)
  if (!processor) throw new Error(`Unknown Processor: ${processorId}`)
  const source = project.source.hardwareTopology
  const siblings = source.ports.filter(port => port.processor === processor.id)
  const indices = new Set(siblings.map(port => port.index))
  const index = Array.from({ length: processor.portCount }, (_, value) => value).find(value => !indices.has(value))
  if (index === undefined) throw new Error(`${processor.name} already uses all ${processor.portCount} Port slots.`)
  const port = createPort({
    id: nextId(source.ports, 'port-'),
    processor: processor.id,
    index,
    receiverCapacity: genericHardwareDefaults.portReceivers,
  })
  return replaceTopology(project, topology(project, {
    ports: [...source.ports, port],
    receiverOrder: [...source.receiverOrder, { port: port.id, receivers: [] }],
  }))
}

export function updatePort(project: Project, portId: string, patch: { readonly index?: number; readonly receiverCapacity?: number }): Project {
  const port = findPort(project, portId)
  if (!port) throw new Error(`Unknown Port: ${portId}`)
  const processor = findProcessor(project, port.processor)!
  const updated = createPort({
    ...port,
    index: patch.index ?? port.index,
    receiverCapacity: patch.receiverCapacity ?? port.receiverCapacity,
  })
  if (updated.index >= processor.portCount) throw new Error(`Port index must be below ${processor.portCount}.`)
  if (project.source.hardwareTopology.ports.some(value => value.id !== port.id && value.processor === port.processor && value.index === updated.index)) {
    throw new Error(`Port index ${updated.index} is already used by ${processor.name}.`)
  }
  const used = project.source.hardwareTopology.receivers.filter(receiver => receiver.port === port.id).length
  if (updated.receiverCapacity < used) throw new Error(`Port capacity cannot be below ${used} assigned Receivers.`)
  return replaceTopology(project, topology(project, {
    ports: project.source.hardwareTopology.ports.map(value => value.id === port.id ? updated : value),
  }))
}

export function deletePort(project: Project, portId: string): Project {
  if (!findPort(project, portId)) throw new Error(`Unknown Port: ${portId}`)
  const source = project.source.hardwareTopology
  return replaceTopology(project, topology(project, {
    ports: source.ports.filter(port => port.id !== portId),
    receivers: source.receivers.filter(receiver => receiver.port !== portId),
    receiverOrder: source.receiverOrder.filter(order => order.port !== portId),
  }))
}

export function addReceiver(project: Project, portId: string): Project {
  const port = findPort(project, portId)
  if (!port) throw new Error(`Unknown Port: ${portId}`)
  const source = project.source.hardwareTopology
  const order = source.receiverOrder.find(value => value.port === port.id)
  if (!order) throw new Error(`Receiver order is missing for Port ${port.id}.`)
  if (order.receivers.length >= port.receiverCapacity) throw new Error(`Port ${port.id} already uses all Receiver slots.`)
  const receiver = createReceiver({
    id: nextId(source.receivers, 'receiver-'),
    index: order.receivers.length,
    processor: port.processor,
    port: port.id,
    pixelCapacity: genericHardwareDefaults.receiverPixels,
  })
  return replaceTopology(project, topology(project, {
    receivers: [...source.receivers, receiver],
    receiverOrder: source.receiverOrder.map(value => value.port === port.id
      ? { ...value, receivers: [...value.receivers, receiver.id] }
      : value),
  }))
}

export function updateReceiver(
  project: Project,
  receiverId: string,
  patch: { readonly index?: number; readonly pixelCapacity?: number },
): Project {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const pixelCapacity = patch.pixelCapacity ?? receiver.pixelCapacity
  const updated = createReceiver({
    ...receiver,
    index: patch.index ?? receiver.index,
    ...(pixelCapacity === undefined ? {} : { pixelCapacity }),
  })
  const used = receiverPixelUsage(project, receiver.id).used
  if (updated.pixelCapacity !== undefined && updated.pixelCapacity < used) {
    throw new Error(`Receiver capacity cannot be below ${used.toLocaleString('en-US')} assigned pixels.`)
  }
  return replaceTopology(project, topology(project, {
    receivers: project.source.hardwareTopology.receivers.map(value => value.id === receiver.id ? updated : value),
  }))
}

export function deleteReceiver(project: Project, receiverId: string): Project {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const source = project.source.hardwareTopology
  return replaceTopology(project, topology(project, {
    receivers: source.receivers.filter(value => value.id !== receiver.id),
    receiverOrder: source.receiverOrder.map(order => order.port === receiver.port
      ? { ...order, receivers: order.receivers.filter(id => id !== receiver.id) }
      : order),
  }))
}

export function moveProcessor(project: Project, processorId: string, delta: -1 | 1): Project {
  const order = [...project.source.hardwareTopology.processorOrder]
  const index = order.findIndex(id => id === processorId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return project
  ;[order[index], order[target]] = [order[target]!, order[index]!]
  return replaceTopology(project, topology(project, { processorOrder: order }))
}

export function moveReceiver(project: Project, receiverId: string, delta: -1 | 1): Project {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const orders = project.source.hardwareTopology.receiverOrder.map(order => {
    if (order.port !== receiver.port) return order
    const receivers = [...order.receivers]
    const index = receivers.indexOf(receiver.id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= receivers.length) return order
    ;[receivers[index], receivers[target]] = [receivers[target]!, receivers[index]!]
    return { ...order, receivers }
  })
  return replaceTopology(project, topology(project, { receiverOrder: orders }))
}

export function cabinetPixelCount(project: Project, cabinetId: string): number {
  const cabinet = project.source.hardwareTopology.cabinets.find(value => value.id === cabinetId)
  if (!cabinet) throw new Error(`Unknown Cabinet: ${cabinetId}`)
  const pixels = cabinet.pixelWidth * cabinet.pixelHeight
  if (!Number.isSafeInteger(pixels)) throw new Error(`Cabinet ${cabinet.id} pixel count exceeds the safe integer range.`)
  return pixels
}

export function receiverPixelUsage(project: Project, receiverId: string): ReceiverUsage {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  return {
    receiver,
    used: receiver.cabinets.reduce((total, cabinet) => total + cabinetPixelCount(project, cabinet), 0),
    capacity: receiver.pixelCapacity ?? null,
  }
}

export function hardwareCabinetOrder(project: Project): readonly CabinetId[] {
  const ordered: CabinetId[] = []
  for (const screen of project.source.screens) {
    for (const gridId of screen.cabinetGrids) {
      const grid = project.source.cabinetGrids.find(value => value.id === gridId)
      if (!grid) continue
      const cabinets = project.source.hardwareTopology.cabinets.filter(cabinet => cabinet.grid === grid.id)
      if (cabinets.length === 0) continue
      const positions = cabinetOrder({
        columns: grid.columns,
        rows: grid.rows,
        ordering: grid.ordering,
      })
      for (const position of positions) {
        const cabinet = cabinets.find(value => value.column === position.column && value.row === position.row)
        if (cabinet) ordered.push(cabinet.id)
      }
    }
  }
  return ordered
}

export function unassignedCabinetIds(project: Project): readonly CabinetId[] {
  const assigned = new Set(project.source.hardwareTopology.receivers.flatMap(receiver => receiver.cabinets))
  return hardwareCabinetOrder(project).filter(cabinet => !assigned.has(cabinet))
}

export function assignCabinets(project: Project, receiverId: string, cabinetIds: readonly string[]): Project {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const selected = new Set(cabinetIds)
  const known = new Set<string>(project.source.hardwareTopology.cabinets.map(cabinet => cabinet.id))
  for (const cabinet of selected) if (!known.has(cabinet)) throw new Error(`Unknown Cabinet: ${cabinet}`)
  const target = new Set(receiver.cabinets.filter(cabinet => !selected.has(cabinet)))
  for (const cabinet of hardwareCabinetOrder(project)) if (selected.has(cabinet)) target.add(cabinet)
  const used = [...target].reduce((total, cabinet) => total + cabinetPixelCount(project, cabinet), 0)
  if (receiver.pixelCapacity !== undefined && used > receiver.pixelCapacity) {
    throw new Error(`Assignment uses ${used.toLocaleString('en-US')} of ${receiver.pixelCapacity.toLocaleString('en-US')} Receiver pixels.`)
  }
  return replaceTopology(project, topology(project, {
    receivers: project.source.hardwareTopology.receivers.map(value => ({
      ...value,
      cabinets: value.id === receiver.id
        ? [...target]
        : value.cabinets.filter(cabinet => !selected.has(cabinet)),
    })),
  }))
}

export function unassignCabinets(project: Project, receiverId: string, cabinetIds: readonly string[]): Project {
  if (!findReceiver(project, receiverId)) throw new Error(`Unknown Receiver: ${receiverId}`)
  const selected = new Set(cabinetIds)
  return replaceTopology(project, topology(project, {
    receivers: project.source.hardwareTopology.receivers.map(receiver => receiver.id === receiverId
      ? { ...receiver, cabinets: receiver.cabinets.filter(cabinet => !selected.has(cabinet)) }
      : receiver),
  }))
}

export function previewHardwareAllocation(project: Project): AllocationProposal {
  return allocateHardware({ ...project.source.hardwareTopology, cabinetOrder: unassignedCabinetIds(project) })
}

export function applyHardwareAllocation(project: Project, proposal: AllocationProposal): Project {
  return replaceTopology(project, proposal.topology)
}
