import type { LedMapProjectV2, ProjectProcessor, ProjectPort, ProjectReceiver } from '@ledmap/core'
import { orderedSelectedCabinetsV2 } from './v2-hardware-commands.js'

export function findProcessor(project: LedMapProjectV2, id: string): ProjectProcessor | undefined {
  return project.hardware.processors.find(value => value.id === id)
}

export function findPort(project: LedMapProjectV2, id: string): ProjectPort | undefined {
  return project.hardware.ports.find(value => value.id === id)
}

export function findReceiver(project: LedMapProjectV2, id: string): ProjectReceiver | undefined {
  return project.hardware.receivers.find(value => value.id === id)
}

export function receiverCabinetIds(project: LedMapProjectV2, receiverId: string): readonly string[] {
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)?.orderedCabinetIds ?? []
}

export function receiverPixelUsage(project: LedMapProjectV2, receiverId: string) {
  const receiver = findReceiver(project, receiverId)
  if (!receiver) throw new Error(`Unknown Receiver: ${receiverId}`)
  const cabinets = new Map<string, (typeof project.design.cabinets)[number]>(project.design.cabinets.map(cabinet => [cabinet.id, cabinet]))
  const used = receiverCabinetIds(project, receiverId).reduce((total, id) => {
    const cabinet = cabinets.get(id)
    if (!cabinet) throw new Error(`Unknown Cabinet: ${id}`)
    return total + cabinet.pixelWidth * cabinet.pixelHeight
  }, 0)
  return { receiver, used, capacity: receiver.pixelCapacity ?? null }
}

export function unassignedCabinetIds(project: LedMapProjectV2): readonly string[] {
  const assigned = new Set(project.hardware.assignments.map(value => value.target.cabinetId))
  return orderedSelectedCabinetsV2(project, project.design.cabinets.map(cabinet => cabinet.id)).filter(id => !assigned.has(id))
}
