import type { JsonObject } from './types.js'
import type { PointV3Wire, ProjectV3Wire, SizeV3Wire } from './v3-types.js'

export interface RectV5Wire {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface OutputMappingV5Wire {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly screenId: string
  readonly mediaOutputId: string
  readonly screenRect: RectV5Wire
  readonly outputRect: RectV5Wire
  readonly inputRotation: number
  readonly outputRotation: number
  readonly flipX: boolean
  readonly flipY: boolean
  readonly mask?: { readonly enabled: boolean; readonly points: readonly PointV3Wire[] }
}

export interface MediaOutputV5Wire {
  readonly id: string
  readonly name: string
  readonly resolution: SizeV3Wire
  readonly mappingOrder: readonly string[]
}

export interface ProjectV5Wire extends Omit<ProjectV3Wire, 'content'> {
  readonly content: Omit<ProjectV3Wire['content'], 'mediaOutputs' | 'outputMappings'> & {
    readonly mediaOutputs: readonly MediaOutputV5Wire[]
    readonly outputMappings: readonly OutputMappingV5Wire[]
  }
}

export interface LedMapDocumentV5 {
  readonly format: 'ledmap'
  readonly schemaVersion: 5
  readonly project: ProjectV5Wire
  readonly extensions: JsonObject
}
