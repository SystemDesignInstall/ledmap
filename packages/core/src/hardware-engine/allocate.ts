import type { CabinetId, PortId, ProcessorId, ReceiverId } from '../model/ids.js'
import type { Module } from '../model/module.js'
import type { Port } from '../model/port.js'
import { createReceiver } from '../model/receiver.js'
import type { HardwareTopologyInput } from './types.js'
import { resolveCabinetLayout } from './layout.js'
import { resolveHardware } from './resolve.js'
import { assertComplete, assertSafeInteger, claim, fail, indexEntities, reference, safeAdd } from './validation.js'

export interface AllocateHardwareInput extends HardwareTopologyInput {
  readonly cabinetOrder: readonly CabinetId[]
}

export type AllocationDiagnostic =
  | { readonly level: 'receiver'; readonly receiver: ReceiverId; readonly unit: 'pixels'; readonly used: number; readonly capacity: number }
  | { readonly level: 'port'; readonly port: PortId; readonly unit: 'receivers'; readonly used: number; readonly capacity: number }
  | { readonly level: 'processor'; readonly processor: ProcessorId; readonly unit: 'ports'; readonly used: number; readonly capacity: number }

export interface AllocationProposal {
  readonly topology: HardwareTopologyInput
  readonly diagnostics: readonly AllocationDiagnostic[]
}

export function allocateHardware(input: AllocateHardwareInput): AllocationProposal {
  const processors = indexEntities(input.processors, 'Processor')
  const ports = indexEntities(input.ports, 'Port')
  const receivers = indexEntities(input.receivers, 'Receiver')
  const cabinets = indexEntities(input.cabinets, 'Cabinet')
  indexEntities(input.modules, 'Module')
  const processorOrder = new Set<string>()
  for (const id of input.processorOrder) {
    reference(processors, id, 'Processor order')
    claim(processorOrder, id, 'Processor order')
  }
  assertComplete(processorOrder, processors, 'Processor order')
  for (const processor of processors.values()) assertSafeInteger(`Processor ${processor.id}.portCount`, processor.portCount, 1)
  const portsByProcessor = new Map<string, Port[]>()
  for (const port of ports.values()) {
    const processor = reference(processors, port.processor, `Port ${port.id} processor`)
    assertSafeInteger(`Port ${port.id}.index`, port.index)
    assertSafeInteger(`Port ${port.id}.receiverCapacity`, port.receiverCapacity, 1)
    if (port.index >= processor.portCount) fail('CAPACITY_EXCEEDED', `Port ${port.id} index exceeds Processor ${processor.id}.portCount`)
    const siblings = portsByProcessor.get(processor.id) ?? []
    if (siblings.some(sibling => sibling.index === port.index)) fail('DUPLICATE', `Processor ${processor.id}: Port.index ${port.index}`)
    siblings.push(port)
    portsByProcessor.set(processor.id, siblings)
  }
  for (const receiver of receivers.values()) {
    reference(processors, receiver.processor, `Receiver ${receiver.id} processor`)
    const port = reference(ports, receiver.port, `Receiver ${receiver.id} port`)
    if (receiver.processor !== port.processor) fail('PARENT_MISMATCH', `Receiver ${receiver.id}: Processor does not match Port ${port.id}`)
    assertSafeInteger(`Receiver ${receiver.id}.index`, receiver.index)
    if (receiver.pixelCapacity !== undefined) assertSafeInteger(`Receiver ${receiver.id}.pixelCapacity`, receiver.pixelCapacity, 1)
  }
  const orderedReceivers = new Map<string, readonly ReceiverId[]>()
  const seenReceivers = new Set<string>()
  for (const order of input.receiverOrder) {
    const port = reference(ports, order.port, 'Receiver order port')
    if (orderedReceivers.has(order.port)) fail('DUPLICATE', `Receiver order for Port ${order.port}`)
    for (const id of order.receivers) {
      const receiver = reference(receivers, id, `Port ${port.id} receiver order`)
      claim(seenReceivers, id, 'Receiver assignment')
      if (receiver.port !== port.id) fail('PARENT_MISMATCH', `Receiver ${id}: belongs to Port ${receiver.port}, not ${port.id}`)
    }
    if (order.receivers.length > port.receiverCapacity) fail('CAPACITY_EXCEEDED', `Port ${port.id}: too many receivers`)
    orderedReceivers.set(port.id, order.receivers)
  }
  assertComplete(new Set(orderedReceivers.keys()), ports, 'Receiver order')
  assertComplete(seenReceivers, receivers, 'Receiver assignment')
  const seenCabinets = new Set<string>()
  for (const receiver of receivers.values()) {
    for (const id of receiver.cabinets) {
      reference(cabinets, id, `Receiver ${receiver.id} cabinet`)
      claim(seenCabinets, id, 'Fixed Cabinet assignment')
    }
  }
  for (const id of input.cabinetOrder) {
    reference(cabinets, id, 'Cabinet order')
    claim(seenCabinets, id, 'Cabinet order or fixed assignment')
  }
  assertComplete(seenCabinets, cabinets, 'Cabinet assignment and order')
  const modulesByCabinet = new Map<string, Module[]>()
  for (const module of input.modules) {
    reference(cabinets, module.cabinet, `Module ${module.id} cabinet`)
    const siblings = modulesByCabinet.get(module.cabinet) ?? []
    siblings.push(module)
    modulesByCabinet.set(module.cabinet, siblings)
  }
  const pixelCounts = new Map([...cabinets.values()].map(cabinet => [
    cabinet.id, resolveCabinetLayout(cabinet, modulesByCabinet.get(cabinet.id) ?? []).pixelCount,
  ] as const))
  const assignments = new Map([...receivers.values()].map(receiver => [receiver.id, [...receiver.cabinets]]))
  const loads = new Map<ReceiverId, number>()
  for (const receiver of receivers.values()) {
    let load = 0
    for (const id of receiver.cabinets) {
      const pixels = pixelCounts.get(id)!
      if (receiver.pixelCapacity !== undefined && pixels > receiver.pixelCapacity - load) {
        fail('CAPACITY_EXCEEDED', `Receiver ${receiver.id}: fixed pixel load exceeds pixelCapacity`)
      }
      load = safeAdd(`Receiver ${receiver.id} load`, load, pixels)
    }
    loads.set(receiver.id, load)
  }
  const traversal = input.processorOrder.flatMap(id => (portsByProcessor.get(id) ?? [])
    .sort((a, b) => a.index - b.index)
    .flatMap(port => orderedReceivers.get(port.id)!.map(receiver => receivers.get(receiver)!)))
  for (const id of input.cabinetOrder) {
    const pixels = pixelCounts.get(id)!
    const receiver = traversal.find(candidate => candidate.pixelCapacity === undefined || pixels <= candidate.pixelCapacity - loads.get(candidate.id)!)
    if (receiver === undefined) fail('CAPACITY_EXCEEDED', `Cabinet ${id}: no Receiver can fit ${pixels} pixels`)
    loads.set(receiver.id, safeAdd(`Receiver ${receiver.id} load`, loads.get(receiver.id)!, pixels))
    assignments.get(receiver.id)!.push(id)
  }
  const topology: HardwareTopologyInput = Object.freeze({
    processors: Object.freeze(input.processors.map(processor => Object.freeze({ ...processor }))),
    ports: Object.freeze(input.ports.map(port => Object.freeze({ ...port }))),
    receivers: Object.freeze(input.receivers.map(receiver => Object.freeze(createReceiver({
      ...receiver, cabinets: Object.freeze(assignments.get(receiver.id)!),
    })))),
    cabinets: Object.freeze(input.cabinets.map(cabinet => Object.freeze({ ...cabinet, origin: Object.freeze({ ...cabinet.origin }) }))),
    modules: Object.freeze(input.modules.map(module => Object.freeze({ ...module }))),
    processorOrder: Object.freeze([...input.processorOrder]),
    receiverOrder: Object.freeze(input.receiverOrder.map(order => Object.freeze({ ...order, receivers: Object.freeze([...order.receivers]) }))),
  })
  const mapping = resolveHardware(topology)
  const diagnostics: AllocationDiagnostic[] = []
  for (const id of input.processorOrder) {
    const processor = processors.get(id)!
    const processorPorts = portsByProcessor.get(id) ?? []
    if (processorPorts.length < processor.portCount) diagnostics.push(Object.freeze({
      level: 'processor', processor: id, unit: 'ports', used: processorPorts.length, capacity: processor.portCount,
    }))
  }
  for (const port of mapping.ports) {
    const capacity = ports.get(port.port)!.receiverCapacity
    if (port.receivers.length < capacity) diagnostics.push(Object.freeze({
      level: 'port', port: port.port, unit: 'receivers', used: port.receivers.length, capacity,
    }))
    for (const receiver of port.receivers) {
      const capacity = receivers.get(receiver.receiver)!.pixelCapacity
      if (capacity !== undefined && receiver.pixelCount < capacity) diagnostics.push(Object.freeze({
        level: 'receiver', receiver: receiver.receiver, unit: 'pixels', used: receiver.pixelCount, capacity,
      }))
    }
  }
  return Object.freeze({ topology, diagnostics: Object.freeze(diagnostics) })
}
