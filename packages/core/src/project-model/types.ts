import type { GridOrdering } from '../model/ordering.js'
import type { Point, Size } from '../model/coordinates.js'
import type {
  CabinetGridId,
  CabinetId,
  InputCanvasId,
  MappingRegionId,
  ModuleId,
  PortId,
  ProcessorId,
  ReceiverId,
  ScreenId,
} from '../model/ids.js'
import type {
  BackupRouteId,
  HardwareAssignmentId,
  LiveOutputTargetId,
  MediaOutputCanvasId,
  OutputMappingId,
  SignalRouteId,
} from './ids.js'

export interface ProjectMetadata {
  readonly name?: string
  readonly description?: string
}

export interface ProjectScreen {
  readonly id: ScreenId
  readonly name: string
  readonly resolution: Size
  readonly cabinetGridOrder: readonly CabinetGridId[]
  readonly mappingRegionOrder: readonly MappingRegionId[]
}

export interface ProjectCabinetGrid {
  readonly id: CabinetGridId
  readonly screenId: ScreenId
  readonly name: string
  readonly columns: number
  readonly rows: number
  readonly cabinetWidth: number
  readonly cabinetHeight: number
  readonly ordering: GridOrdering
}

export interface ProjectCabinet {
  readonly id: CabinetId
  readonly gridId: CabinetGridId
  readonly label: string
  readonly column: number
  readonly row: number
  readonly origin: Point
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
}

export interface ProjectModule {
  readonly id: ModuleId
  readonly cabinetId: CabinetId
  readonly column: number
  readonly row: number
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

export interface CompositionPlacement {
  readonly screenId: ScreenId
  readonly x: number
  readonly y: number
  readonly locked: boolean
}

export interface CompositionModel {
  readonly placements: readonly CompositionPlacement[]
}

export interface StagePositionMm {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface StagePlacement {
  readonly screenId: ScreenId
  readonly positionMm: StagePositionMm
}

export interface StageModel {
  readonly placements: readonly StagePlacement[]
}

export interface DesignModel {
  readonly screens: readonly ProjectScreen[]
  readonly cabinetGrids: readonly ProjectCabinetGrid[]
  readonly cabinets: readonly ProjectCabinet[]
  readonly modules: readonly ProjectModule[]
  readonly composition: CompositionModel
  readonly stage?: StageModel
}

export interface ProjectInputCanvas {
  readonly id: InputCanvasId
  readonly resolution: Size
}

export interface ProjectMappingRegion {
  readonly id: MappingRegionId
  readonly inputCanvasId: InputCanvasId
  readonly screenId: ScreenId
  readonly gridId: CabinetGridId
  readonly position: Point
  readonly size: Size
}

export interface MediaOutputCanvas {
  readonly id: MediaOutputCanvasId
  readonly name: string
  readonly resolution: Size
}

export interface PolygonMask {
  readonly points: readonly Point[]
}

export interface OutputMapping {
  readonly id: OutputMappingId
  readonly screenId: ScreenId
  readonly mediaOutputId: MediaOutputCanvasId
  readonly mask?: PolygonMask
}

export interface ContentModel {
  readonly inputCanvases: readonly ProjectInputCanvas[]
  readonly mappingRegions: readonly ProjectMappingRegion[]
  readonly mediaOutputs: readonly MediaOutputCanvas[]
  readonly outputMappings: readonly OutputMapping[]
}

export interface ProjectProcessor {
  readonly id: ProcessorId
  readonly name: string
  readonly portCount: number
}

export interface ProjectPort {
  readonly id: PortId
  readonly processorId: ProcessorId
  readonly index: number
  readonly receiverCapacity: number
}

export interface ProjectReceiver {
  readonly id: ReceiverId
  readonly legacyIndex: number
  readonly processorId: ProcessorId
  readonly portId: PortId
  readonly pixelCapacity?: number
}

export interface HardwareAssignment {
  readonly id: HardwareAssignmentId
  readonly target: {
    readonly kind: 'cabinet'
    readonly cabinetId: CabinetId
  }
  readonly receiverId: ReceiverId
  readonly locked: boolean
  readonly origin?: 'manual' | 'auto'
}

export interface ProjectPortReceiverOrder {
  readonly portId: PortId
  readonly receiverIds: readonly ReceiverId[]
}

export interface ProjectHardwareModel {
  readonly processors: readonly ProjectProcessor[]
  readonly ports: readonly ProjectPort[]
  readonly receivers: readonly ProjectReceiver[]
  readonly assignments: readonly HardwareAssignment[]
  readonly processorOrder: readonly ProcessorId[]
  readonly receiverOrder: readonly ProjectPortReceiverOrder[]
}

export interface SignalRoute {
  readonly id: SignalRouteId
  readonly receiverId: ReceiverId
  readonly orderedCabinetIds: readonly CabinetId[]
}

export interface BackupRoute {
  readonly id: BackupRouteId
}

export interface LiveOutputTarget {
  readonly id: LiveOutputTargetId
}

export interface OperationsModel {
  readonly signalRoutes: readonly SignalRoute[]
  readonly backupRoutes: readonly BackupRoute[]
  readonly liveOutputTargets: readonly LiveOutputTarget[]
}

export interface ProjectRemapRule {
  readonly id: string
  readonly version: string
  readonly type: string
}

export interface ProjectRemapModel {
  readonly rules: readonly ProjectRemapRule[]
}

export interface LedMapProjectV2 {
  readonly metadata: ProjectMetadata
  readonly design: DesignModel
  readonly content: ContentModel
  readonly hardware: ProjectHardwareModel
  readonly operations: OperationsModel
  readonly remap: ProjectRemapModel
}
