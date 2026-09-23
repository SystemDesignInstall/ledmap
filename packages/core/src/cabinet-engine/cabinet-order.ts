import type { CabinetGrid } from '../model/cabinet-grid.js'
import type { GridPosition } from '../model/coordinates.js'
import { applyCabinetDirection } from './direction.js'
import { numberCabinetPosition } from './numbering.js'
import { applyCabinetSnake } from './snake.js'

export type CabinetOrderingInput = Pick<CabinetGrid, 'columns' | 'rows' | 'ordering'>

export function cabinetIndex(grid: CabinetOrderingInput, position: GridPosition): number {
  const numbered = numberCabinetPosition(grid, position, grid.ordering.numbering, grid.ordering.startCorner)
  const directed = applyCabinetDirection(numbered, grid.ordering.direction)
  const snaked = applyCabinetSnake(directed, grid.ordering.snake)
  return snaked.line * snaked.lineLength + snaked.offset
}

export function cabinetOrder(grid: CabinetOrderingInput): readonly GridPosition[] {
  cabinetIndex(grid, { column: 0, row: 0 })
  const positions: GridPosition[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const position = { column, row }
      positions[cabinetIndex(grid, position)] = position
    }
  }
  return positions
}
