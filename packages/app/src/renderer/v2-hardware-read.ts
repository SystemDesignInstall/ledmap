import { selectProjectHardwareLoad, type LedMapProjectV2, type ProjectHardwareLoad, type ProjectProcessor, type ProjectPort, type ProjectReceiver } from '@ledmap/core'
import { orderedSelectedCabinetsV2 } from './v2-hardware-commands.js'

const loads = new WeakMap<LedMapProjectV2, ProjectHardwareLoad>()

export function projectHardwareLoadV2(project: LedMapProjectV2): ProjectHardwareLoad {
  const cached = loads.get(project)
  if (cached) return cached
  const load = selectProjectHardwareLoad(project)
  loads.set(project, load)
  return load
}

export function findProcessor(project: LedMapProjectV2, id: string): ProjectProcessor | undefined {
  return project.hardware.processors.find(value => value.id === id)
}

export function findPort(project: LedMapProjectV2, id: string): ProjectPort | undefined {
  return project.hardware.ports.find(value => value.id === id)
}

export function findReceiver(project: LedMapProjectV2, id: string): ProjectReceiver | undefined {
  return project.hardware.receivers.find(value => value.id === id)
}

export function receiversInHardwareOrder(project: LedMapProjectV2): readonly ProjectReceiver[] {
  const ordered: ProjectReceiver[] = []
  for (const processorId of project.hardware.processorOrder) {
    const ports = project.hardware.ports.filter(value => value.processorId === processorId).sort((left, right) => left.index - right.index)
    for (const port of ports) {
      const receiverIds = project.hardware.receiverOrder.find(value => value.portId === port.id)?.receiverIds ?? []
      for (const receiverId of receiverIds) {
        const receiver = findReceiver(project, receiverId)
        if (receiver) ordered.push(receiver)
      }
    }
  }
  return ordered
}

export function receiverCabinetIds(project: LedMapProjectV2, receiverId: string): readonly string[] {
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)?.orderedCabinetIds ?? []
}

export function receiverPixelUsage(project: LedMapProjectV2, receiverId: string) {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const load = projectHardwareLoadV2(project).receivers.find(value => value.receiverId === receiver.id)!
  return { receiver, used: load.used, capacity: load.capacity }
}

export function unassignedCabinetIds(project: LedMapProjectV2): readonly string[] {
  const assigned = new Set(project.hardware.assignments.map(value => value.target.cabinetId))
  return orderedSelectedCabinetsV2(project, project.design.cabinets.map(cabinet => cabinet.id)).filter(id => !assigned.has(id))
}
