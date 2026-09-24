import type { Module } from '../model/module.js'
import type { Port } from '../model/port.js'
import type { ReceiverId } from '../model/ids.js'
import type { HardwareTopologyInput, HardwareCabinetSpan, HardwareReceiverSpan, HardwarePortSpan, ResolvedHardwareMapping } from './types.js'
import { resolveCabinetLayout } from './layout.js'
import { assertComplete, assertSafeInteger, claim, fail, indexEntities, reference, safeAdd } from './validation.js'

export function resolveHardware(input: HardwareTopologyInput): ResolvedHardwareMapping {
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
      claim(seenCabinets, id, 'Cabinet assignment')
    }
  }
  assertComplete(seenCabinets, cabinets, 'Cabinet assignment')
  const modulesByCabinet = new Map<string, Module[]>()
  for (const module of input.modules) {
    reference(cabinets, module.cabinet, `Module ${module.id} cabinet`)
    const siblings = modulesByCabinet.get(module.cabinet) ?? []
    siblings.push(module)
    modulesByCabinet.set(module.cabinet, siblings)
  }
  const layouts = new Map([...cabinets.values()].map(cabinet => [
    cabinet.id,
    resolveCabinetLayout(cabinet, modulesByCabinet.get(cabinet.id) ?? []),
  ] as const))
  const resolvedPorts: HardwarePortSpan[] = []
  let total = 0
  for (const processor of input.processorOrder) {
    const processorPorts = portsByProcessor.get(processor) ?? []
    processorPorts.sort((a, b) => a.index - b.index)
    for (const port of processorPorts) {
      const resolvedReceivers: HardwareReceiverSpan[] = []
      let portLoad = 0
      for (const id of orderedReceivers.get(port.id)!) {
        const receiver = receivers.get(id)!
        const resolvedCabinets: HardwareCabinetSpan[] = []
        let receiverLoad = 0
        for (const cabinet of receiver.cabinets) {
          const geometry = layouts.get(cabinet)!
          const portBase = safeAdd(`Cabinet ${cabinet} port base`, portLoad, receiverLoad)
          resolvedCabinets.push(Object.freeze({ cabinet, receiverBase: receiverLoad, portBase, ...geometry }))
          receiverLoad = safeAdd(`Receiver ${id} load`, receiverLoad, geometry.pixelCount)
        }
        resolvedReceivers.push(Object.freeze({
          receiver: id, portBase: portLoad, pixelCount: receiverLoad, cabinets: Object.freeze(resolvedCabinets),
        }))
        portLoad = safeAdd(`Port ${port.id} load`, portLoad, receiverLoad)
      }
      resolvedPorts.push(Object.freeze({
        processor, port: port.id, index: port.index, globalBase: total,
        pixelCount: portLoad, receivers: Object.freeze(resolvedReceivers),
      }))
      total = safeAdd('Project pixel count', total, portLoad)
    }
  }
  return Object.freeze({ pixelCount: total, ports: Object.freeze(resolvedPorts) })
}
