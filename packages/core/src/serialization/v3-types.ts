import type { JsonObject } from './types.js'

export interface PointV3Wire { readonly x: number; readonly y: number }
export interface SizeV3Wire { readonly width: number; readonly height: number }

export interface ProjectV3Wire {
  readonly metadata: { readonly name?: string; readonly description?: string }
  readonly design: {
    readonly screens: readonly {
      readonly id: string; readonly name: string; readonly resolution: SizeV3Wire
      readonly cabinetGridOrder: readonly string[]; readonly mappingRegionOrder: readonly string[]
    }[]
    readonly cabinetGrids: readonly {
      readonly id: string; readonly screenId: string; readonly name: string
      readonly columns: number; readonly rows: number; readonly cabinetWidth: number; readonly cabinetHeight: number
      readonly ordering: {
        readonly numbering: 'row' | 'column'
        readonly startCorner: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
        readonly direction: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
        readonly snake: boolean
      }
    }[]
    readonly cabinets: readonly {
      readonly id: string; readonly gridId: string; readonly label: string
      readonly column: number; readonly row: number; readonly origin: PointV3Wire
      readonly width: number; readonly height: number; readonly pixelWidth: number; readonly pixelHeight: number
      readonly moduleColumns: number; readonly moduleRows: number; readonly rotation: number
      readonly flipH: boolean; readonly flipV: boolean
    }[]
    readonly modules: readonly {
      readonly id: string; readonly cabinetId: string; readonly column: number; readonly row: number
      readonly width: number; readonly height: number; readonly pixelWidth: number; readonly pixelHeight: number
    }[]
    readonly composition: { readonly placements: readonly {
      readonly screenId: string; readonly x: number; readonly y: number; readonly locked: boolean
    }[] }
    readonly stage?: { readonly placements: readonly {
      readonly screenId: string; readonly positionMm: { readonly x: number; readonly y: number; readonly z: number }
    }[] }
  }
  readonly content: {
    readonly inputCanvases: readonly { readonly id: string; readonly resolution: SizeV3Wire }[]
    readonly mappingRegions: readonly {
      readonly id: string; readonly inputCanvasId: string; readonly screenId: string; readonly gridId: string
      readonly position: PointV3Wire; readonly size: SizeV3Wire
    }[]
    readonly mediaOutputs: readonly { readonly id: string; readonly name: string; readonly resolution: SizeV3Wire }[]
    readonly outputMappings: readonly {
      readonly id: string; readonly screenId: string; readonly mediaOutputId: string
      readonly mask?: { readonly points: readonly PointV3Wire[] }
    }[]
  }
  readonly hardware: {
    readonly processors: readonly { readonly id: string; readonly name: string; readonly portCount: number }[]
    readonly ports: readonly {
      readonly id: string; readonly processorId: string; readonly index: number; readonly receiverCapacity: number
    }[]
    readonly receivers: readonly {
      readonly id: string; readonly legacyIndex: number; readonly processorId: string; readonly portId: string
      readonly pixelCapacity?: number
    }[]
    readonly assignments: readonly {
      readonly id: string; readonly target: { readonly kind: 'cabinet'; readonly cabinetId: string }
      readonly receiverId: string; readonly locked: boolean; readonly origin?: 'manual' | 'auto'
    }[]
    readonly processorOrder: readonly string[]
    readonly receiverOrder: readonly { readonly portId: string; readonly receiverIds: readonly string[] }[]
  }
  readonly operations: {
    readonly signalRoutes: readonly {
      readonly id: string; readonly receiverId: string; readonly orderedCabinetIds: readonly string[]
    }[]
    readonly backupRoutes: readonly { readonly id: string }[]
    readonly liveOutputTargets: readonly { readonly id: string }[]
  }
  readonly remap: { readonly rules: readonly { readonly id: string; readonly version: string; readonly type: string }[] }
}

export interface LedMapDocumentV3 {
  readonly format: 'ledmap'
  readonly schemaVersion: 3
  readonly project: ProjectV3Wire
  readonly extensions: JsonObject
}
