import type { HardwareCapacityProfile, PortPixelCapacityOverride } from '../project-model/capacity-profile.js'
import type { JsonObject } from './types.js'
import type { ProjectV5Wire } from './v5-types.js'

export interface ProjectV6Wire extends Omit<ProjectV5Wire, 'hardware'> {
  readonly hardware: Omit<ProjectV5Wire['hardware'], 'processors' | 'ports'> & {
    readonly processors: readonly (ProjectV5Wire['hardware']['processors'][number] & { readonly capacityProfile?: HardwareCapacityProfile })[]
    readonly ports: readonly (ProjectV5Wire['hardware']['ports'][number] & { readonly pixelCapacityOverride?: PortPixelCapacityOverride })[]
  }
}

export interface LedMapDocumentV6 {
  readonly format: 'ledmap'
  readonly schemaVersion: 6
  readonly project: ProjectV6Wire
  readonly extensions: JsonObject
}
