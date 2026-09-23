import type { GridPosition } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { moduleCount, type CabinetPixelLayoutConfig } from './pixel-layout.js'
import { referenceCabinetLayout } from './reference-profile.js'

export function moduleIndex(
  layout: Pick<CabinetPixelLayoutConfig, 'moduleColumns' | 'moduleRows'>,
  position: GridPosition,
): number {
  moduleCount(layout)
  assertIndexInBounds('moduleColumn', position.column, layout.moduleColumns)
  assertIndexInBounds('moduleRow', position.row, layout.moduleRows)
  return position.row * layout.moduleColumns + position.column
}

export function referenceModuleIndex(position: GridPosition): number {
  return moduleIndex(referenceCabinetLayout, position)
}
