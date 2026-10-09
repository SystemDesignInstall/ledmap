import type { JsonObject } from './types.js'
import type { ProjectV6Wire } from './v6-types.js'

export interface ProjectV7Wire extends Omit<ProjectV6Wire, 'design'> {
  readonly design: Omit<ProjectV6Wire['design'], 'cabinetGrids'> & {
    readonly cabinetGrids: readonly (ProjectV6Wire['design']['cabinetGrids'][number] & {
      readonly nextCabinetSerial?: number
    })[]
  }
}

export interface LedMapDocumentV7 {
  readonly format: 'ledmap'
  readonly schemaVersion: 7
  readonly project: ProjectV7Wire
  readonly extensions: JsonObject
}
