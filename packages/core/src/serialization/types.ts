import type { ProjectValidationReport, ValidateProjectInput } from '../validation/index.js'

export type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[]

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export interface SizeV1 {
  readonly width: number
  readonly height: number
}

export interface XYV1 {
  readonly x: number
  readonly y: number
}

export interface InputCanvasV1 {
  readonly id: string
  readonly resolution: SizeV1
}

export interface ScreenV1 {
  readonly id: string
  readonly name: string
  readonly resolution: SizeV1
  readonly mappingRegions: readonly string[]
  readonly cabinetGrids: readonly string[]
}

export interface GridOrderingV1 {
  readonly numbering: 'row' | 'column'
  readonly startCorner: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
  readonly direction: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
  readonly snake: boolean
}

export interface GridV1 {
  readonly id: string
  readonly screen: string
  readonly name: string
  readonly columns: number
  readonly rows: number
  readonly cabinetWidth: number
  readonly cabinetHeight: number
  readonly ordering: GridOrderingV1
}

export interface RegionV1 {
  readonly id: string
  readonly inputCanvas: string
  readonly screen: string
  readonly grid: string
  readonly position: XYV1
  readonly size: SizeV1
}

export interface ProcessorV1 {
  readonly id: string
  readonly name: string
  readonly portCount: number
}

export interface PortV1 {
  readonly id: string
  readonly processor: string
  readonly index: number
  readonly receiverCapacity: number
}

export interface ReceiverV1 {
  readonly id: string
  readonly processor: string
  readonly port: string
  readonly index: number
  readonly cabinets: readonly string[]
  readonly pixelCapacity?: number
}

export interface CabinetV1 {
  readonly id: string
  readonly grid: string
  readonly column: number
  readonly row: number
  readonly origin: XYV1
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

export interface StoredModuleV1 {
  readonly id: string
  readonly cabinet: string
  readonly column: number
  readonly row: number
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

export interface ReceiverOrderV1 {
  readonly port: string
  readonly receivers: readonly string[]
}

export interface StoredHardwareTopologyV1 {
  readonly processors: readonly ProcessorV1[]
  readonly ports: readonly PortV1[]
  readonly receivers: readonly ReceiverV1[]
  readonly cabinets: readonly CabinetV1[]
  readonly modules: readonly StoredModuleV1[]
  readonly processorOrder: readonly string[]
  readonly receiverOrder: readonly ReceiverOrderV1[]
}

export interface StoredMappingInputV1 {
  readonly inputCanvas: InputCanvasV1
  readonly screen: ScreenV1
  readonly grid: GridV1
  readonly region: RegionV1
  readonly hardwareTopology: StoredHardwareTopologyV1
}

export interface StoredProjectV1 {
  readonly mapping: StoredMappingInputV1
  readonly rules: readonly JsonValue[]
}

export interface ProjectDocumentV1 {
  readonly format: 'ledmap'
  readonly schemaVersion: 1
  readonly project: StoredProjectV1
  readonly extensions: JsonObject
}

export interface SerializeProjectInput {
  readonly project: ValidateProjectInput
  readonly extensions?: JsonObject
}

export interface LoadedProject {
  readonly project: ValidateProjectInput
  readonly extensions: JsonObject
  readonly validation: ProjectValidationReport
}
