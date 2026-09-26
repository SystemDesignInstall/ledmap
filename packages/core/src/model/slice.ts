import type { PixelRect } from './coordinates.js'
import type {
  CabinetId, InputCanvasId, MappingRegionId, OutputSurfaceId, PortId, ProcessorId, ReceiverId, ScreenId, SliceId,
} from './ids.js'
import type { PolygonMask, QuarterTurn } from './mapping-transform.js'
import type { OutputSurface } from './output-surface.js'

export interface GeneratedSlice {
  readonly id: SliceId
  readonly name: string
  readonly source: {
    readonly inputCanvas: InputCanvasId
    readonly rect: PixelRect
  }
  readonly target: {
    readonly surface: OutputSurfaceId
    readonly rect: PixelRect
  }
  readonly inputRotation: QuarterTurn
  readonly outputRotation: QuarterTurn
  readonly flipX: boolean
  readonly flipY: boolean
  readonly mask?: PolygonMask
  readonly provenance: {
    readonly screen: ScreenId
    readonly mappingRegion: MappingRegionId
    readonly processor?: ProcessorId
    readonly port?: PortId
    readonly receivers: readonly ReceiverId[]
    readonly cabinets: readonly CabinetId[]
  }
}

export interface SliceDiagnostic {
  readonly severity: 'error' | 'warning'
  readonly code: string
  readonly message: string
  readonly slice?: SliceId
}

export interface SlicePlan {
  readonly outputs: readonly OutputSurface[]
  readonly slices: readonly GeneratedSlice[]
  readonly diagnostics: readonly SliceDiagnostic[]
}
