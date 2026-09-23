import type { CabinetGrid } from '../model/cabinet-grid.js'
import { assertPositiveInteger, type GridPosition } from '../model/coordinates.js'
import { DomainError } from '../model/errors.js'
import type { Numbering, StartCorner } from '../model/ordering.js'
import { assertIndexInBounds } from './bounds.js'

export interface TraversalPosition {
  readonly line: number
  readonly offset: number
  readonly lineLength: number
}

export function numberCabinetPosition(
  grid: Pick<CabinetGrid, 'columns' | 'rows'>,
  position: GridPosition,
  numbering: Numbering,
  startCorner: StartCorner,
): TraversalPosition {
  assertPositiveInteger('columns', grid.columns)
  assertPositiveInteger('rows', grid.rows)
  if (!Number.isSafeInteger(grid.columns * grid.rows)) {
    throw new DomainError('INVALID_DIMENSION', 'cabinet count must be a safe integer')
  }
  if (numbering !== 'row' || startCorner !== 'top-left') {
    throw new DomainError('UNSUPPORTED_ORDERING', 'only row numbering from top-left is implemented')
  }
  assertIndexInBounds('column', position.column, grid.columns)
  assertIndexInBounds('row', position.row, grid.rows)
  return { line: position.row, offset: position.column, lineLength: grid.columns }
}
