import type { CabinetGrid } from '../model/cabinet-grid.js'
import { assertPositiveInteger, type GridPosition } from '../model/coordinates.js'
import { DomainError } from '../model/errors.js'
import type { Numbering, StartCorner } from '../model/ordering.js'
import { assertIndexInBounds } from './bounds.js'

export type TraversalAxis = 'horizontal' | 'vertical'

export interface TraversalPosition {
  readonly line: number
  readonly offset: number
  readonly lineLength: number
  readonly axis: TraversalAxis
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
  if ((numbering !== 'row' && numbering !== 'column') || startCorner !== 'top-left') {
    throw new DomainError('UNSUPPORTED_ORDERING', 'only row and column numbering from top-left are implemented')
  }
  assertIndexInBounds('column', position.column, grid.columns)
  assertIndexInBounds('row', position.row, grid.rows)
  if (numbering === 'column') {
    return { line: position.column, offset: position.row, lineLength: grid.rows, axis: 'vertical' }
  }
  return { line: position.row, offset: position.column, lineLength: grid.columns, axis: 'horizontal' }
}
