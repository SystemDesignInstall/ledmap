import type { PixelCoordinate } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { modulePixelCount, type CabinetPixelLayoutConfig } from './pixel-layout.js'
import { referenceCabinetLayout } from './reference-profile.js'

export function pixelIndexWithinModule(
  layout: Pick<CabinetPixelLayoutConfig, 'modulePixelWidth' | 'modulePixelHeight'>,
  coordinate: PixelCoordinate,
): number {
  modulePixelCount(layout)
  assertIndexInBounds('pixelX', coordinate.x, layout.modulePixelWidth)
  assertIndexInBounds('pixelY', coordinate.y, layout.modulePixelHeight)
  return coordinate.y * layout.modulePixelWidth + coordinate.x
}

export function referencePixelIndexWithinModule(coordinate: PixelCoordinate): number {
  return pixelIndexWithinModule(referenceCabinetLayout, coordinate)
}
