import type { GridPosition } from '../model/coordinates.js'
import { assertIndexInBounds } from './bounds.js'
import { referenceModuleColumns, referenceModuleRows } from './reference-profile.js'

export function referenceModuleIndex(position: GridPosition): number {
  assertIndexInBounds('moduleColumn', position.column, referenceModuleColumns)
  assertIndexInBounds('moduleRow', position.row, referenceModuleRows)
  return position.row * referenceModuleColumns + position.column
}
