import type { JsonObject } from './types.js'
import type { PointV3Wire, ProjectV3Wire } from './v3-types.js'

export interface ProjectV4Wire extends Omit<ProjectV3Wire, 'content'> {
  readonly content: Omit<ProjectV3Wire['content'], 'outputMappings'> & {
    readonly outputMappings: readonly {
      readonly id: string
      readonly screenId: string
      readonly mediaOutputId: string
      readonly position?: PointV3Wire
      readonly mask?: { readonly points: readonly PointV3Wire[] }
    }[]
  }
}

export interface LedMapDocumentV4 {
  readonly format: 'ledmap'
  readonly schemaVersion: 4
  readonly project: ProjectV4Wire
  readonly extensions: JsonObject
}
