import type { HardwareTopologyInput, ResolvedHardwareMapping } from '../hardware-engine/index.js'
import type { CabinetGrid } from '../model/cabinet-grid.js'
import type { PixelCoordinate, Size } from '../model/coordinates.js'
import type { CabinetId, InputCanvasId, ModuleId } from '../model/ids.js'
import type { InputCanvas } from '../model/input-canvas.js'
import type { MappingRegion } from '../model/mapping-region.js'
import type { Screen } from '../model/screen.js'
import type { PixelAddress } from '../model/signal-path.js'

export interface ResolveMappingInput {
  readonly inputCanvas: InputCanvas
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly region: MappingRegion
  readonly hardwareTopology: HardwareTopologyInput
}

export interface InputPixel {
  readonly inputCanvas: InputCanvasId
  readonly inputCoordinate: PixelCoordinate
}

export interface MappedPixel {
  readonly inputCoordinate: PixelCoordinate
  readonly screenCoordinate: PixelCoordinate
  readonly cabinet: CabinetId
  readonly cabinetCoordinate: PixelCoordinate
  readonly module: ModuleId
  readonly moduleCoordinate: PixelCoordinate
  readonly address: PixelAddress
}

export interface MappingCabinetCell {
  readonly cabinet: CabinetId
  readonly column: number
  readonly row: number
}

export interface ResolvedPixelMap {
  readonly inputCanvas: InputCanvas
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly region: MappingRegion
  readonly gridPixelSize: Size
  readonly cabinetPixelSize: Size
  readonly cells: readonly MappingCabinetCell[]
  readonly hardware: ResolvedHardwareMapping
}
