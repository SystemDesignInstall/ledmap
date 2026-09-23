import type { PixelCoordinate } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { referenceModulePixelHeight, referenceModulePixelWidth } from './reference-profile.js'

export function referencePixelIndexWithinModule(coordinate: PixelCoordinate): number {
  assertIndexInBounds('pixelX', coordinate.x, referenceModulePixelWidth)
  assertIndexInBounds('pixelY', coordinate.y, referenceModulePixelHeight)
  return coordinate.y * referenceModulePixelWidth + coordinate.x
}
