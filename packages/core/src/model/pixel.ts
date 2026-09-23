import type { CabinetId, ModuleId } from './ids.js'
import type { PixelCoordinate, Point } from './coordinates.js'

export interface Pixel {
  readonly cabinet: CabinetId
  readonly module: ModuleId
  readonly coordinate: PixelCoordinate
  readonly physical: Point
  readonly logicalIndex: number
}