import type { PixelCoordinate } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { moduleIndex } from './module-order.js'
import { pixelIndexWithinModule } from './pixel-order.js'
import { cabinetPixelLayoutDimensions, type CabinetPixelLayoutConfig } from './pixel-layout.js'
import { referenceCabinetLayout } from './reference-profile.js'

export interface CabinetPixel {
  readonly moduleColumn: number
  readonly moduleRow: number
  readonly moduleIndex: number
  readonly pixelX: number
  readonly pixelY: number
  readonly pixelIndexWithinModule: number
  readonly cabinetPixelOffset: number
}

export type ReferenceCabinetPixel = CabinetPixel

export function decomposeCabinetPixel(layout: CabinetPixelLayoutConfig, coordinate: PixelCoordinate): CabinetPixel {
  const dimensions = cabinetPixelLayoutDimensions(layout)
  assertIndexInBounds('cabinetX', coordinate.x, dimensions.cabinetPixelWidth)
  assertIndexInBounds('cabinetY', coordinate.y, dimensions.cabinetPixelHeight)
  const moduleColumn = Math.floor(coordinate.x / layout.modulePixelWidth)
  const moduleRow = Math.floor(coordinate.y / layout.modulePixelHeight)
  const index = moduleIndex(layout, { column: moduleColumn, row: moduleRow })
  const pixelX = coordinate.x % layout.modulePixelWidth
  const pixelY = coordinate.y % layout.modulePixelHeight
  const pixelIndex = pixelIndexWithinModule(layout, { x: pixelX, y: pixelY })
  return {
    moduleColumn,
    moduleRow,
    moduleIndex: index,
    pixelX,
    pixelY,
    pixelIndexWithinModule: pixelIndex,
    cabinetPixelOffset: index * dimensions.modulePixelCount + pixelIndex,
  }
}

export function cabinetPixelCoordinate(layout: CabinetPixelLayoutConfig, cabinetPixelOffset: number): PixelCoordinate {
  const dimensions = cabinetPixelLayoutDimensions(layout)
  assertIndexInBounds('cabinetPixelOffset', cabinetPixelOffset, dimensions.cabinetPixelCount)
  const index = Math.floor(cabinetPixelOffset / dimensions.modulePixelCount)
  const moduleColumn = index % layout.moduleColumns
  const moduleRow = Math.floor(index / layout.moduleColumns)
  const pixelIndex = cabinetPixelOffset % dimensions.modulePixelCount
  const pixelX = pixelIndex % layout.modulePixelWidth
  const pixelY = Math.floor(pixelIndex / layout.modulePixelWidth)
  return {
    x: moduleColumn * layout.modulePixelWidth + pixelX,
    y: moduleRow * layout.modulePixelHeight + pixelY,
  }
}

export function decomposeReferenceCabinetPixel(coordinate: PixelCoordinate): ReferenceCabinetPixel {
  return decomposeCabinetPixel(referenceCabinetLayout, coordinate)
}

export function referenceCabinetPixelCoordinate(cabinetPixelOffset: number): PixelCoordinate {
  return cabinetPixelCoordinate(referenceCabinetLayout, cabinetPixelOffset)
}
