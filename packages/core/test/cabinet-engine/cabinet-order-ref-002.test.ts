import { describe, expect, it } from 'vitest'
import {
  asScreenId,
  cabinetIndex,
  cabinetOrder,
  createCabinetGrid,
  type GridOrdering,
} from '../../src/index.js'
import { applyCabinetDirection } from '../../src/cabinet-engine/direction.js'
import type { TraversalPosition } from '../../src/cabinet-engine/numbering.js'
import { applyCabinetSnake } from '../../src/cabinet-engine/snake.js'

const ordering: GridOrdering = Object.freeze({
  numbering: 'row',
  startCorner: 'top-left',
  direction: 'right-to-left',
  snake: true,
})

const grid = Object.freeze(createCabinetGrid({
  id: 'grid-002',
  screen: asScreenId('screen-001'),
  name: 'REF-002',
  columns: 4,
  rows: 3,
  cabinetWidth: 128,
  cabinetHeight: 128,
  ordering,
}))

const physicalCabinets = [
  ['C01', 'C02', 'C03', 'C04'],
  ['C05', 'C06', 'C07', 'C08'],
  ['C09', 'C10', 'C11', 'C12'],
]

const snakeOffPositions = [
  { column: 3, row: 0 },
  { column: 2, row: 0 },
  { column: 1, row: 0 },
  { column: 0, row: 0 },
  { column: 3, row: 1 },
  { column: 2, row: 1 },
  { column: 1, row: 1 },
  { column: 0, row: 1 },
  { column: 3, row: 2 },
  { column: 2, row: 2 },
  { column: 1, row: 2 },
  { column: 0, row: 2 },
]

const snakeOnPositions = [
  { column: 3, row: 0 },
  { column: 2, row: 0 },
  { column: 1, row: 0 },
  { column: 0, row: 0 },
  { column: 0, row: 1 },
  { column: 1, row: 1 },
  { column: 2, row: 1 },
  { column: 3, row: 1 },
  { column: 3, row: 2 },
  { column: 2, row: 2 },
  { column: 1, row: 2 },
  { column: 0, row: 2 },
]

function cabinetLabels(positions: readonly { readonly column: number, readonly row: number }[]) {
  return positions.map(({ column, row }) => physicalCabinets[row]?.[column])
}

describe('REF-002 cabinet order', () => {
  it('orders Right-to-Left rows exactly with Snake OFF', () => {
    const straight = { ...grid, ordering: { ...ordering, snake: false } }
    const positions = cabinetOrder(straight)
    expect(positions).toEqual(snakeOffPositions)
    expect(cabinetLabels(positions)).toEqual([
      'C04', 'C03', 'C02', 'C01',
      'C08', 'C07', 'C06', 'C05',
      'C12', 'C11', 'C10', 'C09',
    ])
  })

  it('orders Right-to-Left rows exactly with Snake ON', () => {
    const positions = cabinetOrder(grid)
    expect(positions).toEqual(snakeOnPositions)
    expect(cabinetLabels(positions)).toEqual([
      'C04', 'C03', 'C02', 'C01',
      'C05', 'C06', 'C07', 'C08',
      'C12', 'C11', 'C10', 'C09',
    ])
  })

  it.each(snakeOnPositions.map((position, index) => ({ ...position, index })))(
    'maps physical ($column,$row) to cabinetIndex $index',
    ({ column, row, index }) => {
      expect(cabinetIndex(grid, { column, row })).toBe(index)
    },
  )

  it('applies Snake independently to an already Right-to-Left traversal', () => {
    const rows: TraversalPosition[][] = [0, 1, 2].map((line) => (
      [0, 1, 2, 3].map((offset) => applyCabinetDirection(
        { line, offset, lineLength: 4, axis: 'horizontal' },
        'right-to-left',
      ))
    ))

    expect(rows.map((row) => row.map((position) => applyCabinetSnake(position, false).offset)))
      .toEqual([
        [3, 2, 1, 0],
        [3, 2, 1, 0],
        [3, 2, 1, 0],
      ])
    expect(rows.map((row) => row.map((position) => applyCabinetSnake(position, true).offset)))
      .toEqual([
        [3, 2, 1, 0],
        [0, 1, 2, 3],
        [3, 2, 1, 0],
      ])
  })
})
