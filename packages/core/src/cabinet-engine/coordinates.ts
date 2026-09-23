import type { PixelCoordinate } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { referenceModuleIndex } from './module-order.js'
import { referencePixelIndexWithinModule } from './pixel-order.js'
import {
  referenceCabinetPixelCount,
  referenceCabinetPixelHeight,
  referenceCabinetPixelWidth,
  referenceModuleColumns,
  referenceModulePixelCount,
  referenceModulePixelHeight,
  referenceModulePixelWidth,
} from './reference-profile.js'

export interface ReferenceCabinetPixel {
  readonly moduleColumn: number
  readonly moduleRow: number
  readonly moduleIndex: number
  readonly pixelX: number
  readonly pixelY: number
  readonly pixelIndexWithinModule: number
  readonly cabinetPixelOffset: number
}

export function decomposeReferenceCabinetPixel(coordinate: PixelCoordinate): ReferenceCabinetPixel {
  assertIndexInBounds('cabinetX', coordinate.x, referenceCabinetPixelWidth)
  assertIndexInBounds('cabinetY', coordinate.y, referenceCabinetPixelHeight)
  const moduleColumn = Math.floor(coordinate.x / referenceModulePixelWidth)
  const moduleRow = Math.floor(coordinate.y / referenceModulePixelHeight)
  const moduleIndex = referenceModuleIndex({ column: moduleColumn, row: moduleRow })
  const pixelX = coordinate.x % referenceModulePixelWidth
  const pixelY = coordinate.y % referenceModulePixelHeight
  const pixelIndexWithinModule = referencePixelIndexWithinModule({ x: pixelX, y: pixelY })
  return {
    moduleColumn,
    moduleRow,
    moduleIndex,
    pixelX,
    pixelY,
    pixelIndexWithinModule,
    cabinetPixelOffset: moduleIndex * referenceModulePixelCount + pixelIndexWithinModule,
  }
}

export function referenceCabinetPixelCoordinate(cabinetPixelOffset: number): PixelCoordinate {
  assertIndexInBounds('cabinetPixelOffset', cabinetPixelOffset, referenceCabinetPixelCount)
  const moduleIndex = Math.floor(cabinetPixelOffset / referenceModulePixelCount)
  const moduleColumn = moduleIndex % referenceModuleColumns
  const moduleRow = Math.floor(moduleIndex / referenceModuleColumns)
  const pixelIndexWithinModule = cabinetPixelOffset % referenceModulePixelCount
  const pixelX = pixelIndexWithinModule % referenceModulePixelWidth
  const pixelY = Math.floor(pixelIndexWithinModule / referenceModulePixelWidth)
  return {
    x: moduleColumn * referenceModulePixelWidth + pixelX,
    y: moduleRow * referenceModulePixelHeight + pixelY,
  }
}
