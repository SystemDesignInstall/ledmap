import { cloneCapacityProfile, clonePortCapacityOverride, createProjectV2,
  type HardwareCapacityProfile, type LedMapProjectV2, type PortPixelCapacityOverride } from '@ledmap/core'

export function setCapacityProfileV2(project: LedMapProjectV2, processorId: string, profile: HardwareCapacityProfile | null): LedMapProjectV2 {
  if (!project.hardware.processors.some(value => value.id === processorId)) throw new Error(`Unknown Processor: ${processorId}`)
  const copied = profile === null ? null : cloneCapacityProfile(profile)
  return createProjectV2({ ...project, hardware: { ...project.hardware,
    processors: project.hardware.processors.map(value => {
      if (value.id !== processorId) return value
      const processor = { ...value }
      delete processor.capacityProfile
      return copied === null ? processor : { ...processor, capacityProfile: copied }
    }),
  } })
}

export function setPortCapacityOverrideV2(project: LedMapProjectV2, portId: string, override: PortPixelCapacityOverride | null): LedMapProjectV2 {
  if (!project.hardware.ports.some(value => value.id === portId)) throw new Error(`Unknown Port: ${portId}`)
  const copied = override === null ? null : clonePortCapacityOverride(override)
  return createProjectV2({ ...project, hardware: { ...project.hardware,
    ports: project.hardware.ports.map(value => {
      if (value.id !== portId) return value
      const port = { ...value }
      delete port.pixelCapacityOverride
      return copied === null ? port : { ...port, pixelCapacityOverride: copied }
    }),
  } })
}
