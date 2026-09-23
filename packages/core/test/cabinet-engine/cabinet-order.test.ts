import { describe, expect, it } from 'vitest'
import {
  asScreenId,
  cabinetIndex,
  cabinetOrder,
  createCabinetGrid,
  type CabinetOrderingInput,
  type GridOrdering,
} from '../../src/index.js'
import { applyCabinetDirection } from '../../src/cabinet-engine/direction.js'
import { numberCabinetPosition } from '../../src/cabinet-engine/numbering.js'
import { applyCabinetSnake } from '../../src/cabinet-engine/snake.js'

const ordering: GridOrdering = Object.freeze({
  numbering: 'row',
  startCorner: 'top-left',
  direction: 'left-to-right',
  snake: true,
})

const grid = Object.freeze(createCabinetGrid({
  id: 'grid-001',
  screen: asScreenId('screen-001'),
  name: 'REF-001',
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

const expectedPositions = [
  { column: 0, row: 0 },
  { column: 1, row: 0 },
  { column: 2, row: 0 },
  { column: 3, row: 0 },
  { column: 3, row: 1 },
  { column: 2, row: 1 },
  { column: 1, row: 1 },
  { column: 0, row: 1 },
  { column: 0, row: 2 },
  { column: 1, row: 2 },
  { column: 2, row: 2 },
  { column: 3, row: 2 },
]

describe('REF-001 cabinet order', () => {
  it('orders all 12 physical cabinets exactly', () => {
    const positions = cabinetOrder(grid)
    expect(positions).toEqual(expectedPositions)
    expect(positions.map(({ column, row }) => physicalCabinets[row]?.[column])).toEqual([
      'C01', 'C02', 'C03', 'C04',
      'C08', 'C07', 'C06', 'C05',
      'C09', 'C10', 'C11', 'C12',
    ])
  })

  it.each(expectedPositions.map((position, index) => ({ ...position, index })))(
    'maps physical ($column,$row) to cabinetIndex $index',
    ({ column, row, index }) => {
      expect(cabinetIndex(grid, { column, row })).toBe(index)
    },
  )

  it('turns snake off without changing numbering, direction or physical positions', () => {
    const straight = { ...grid, ordering: { ...ordering, snake: false } }
    const positions = cabinetOrder(straight)
    expect(positions.map(({ column, row }) => physicalCabinets[row]?.[column])).toEqual([
      'C01', 'C02', 'C03', 'C04',
      'C05', 'C06', 'C07', 'C08',
      'C09', 'C10', 'C11', 'C12',
    ])
    expect(positions.slice(0, 4)).toEqual(cabinetOrder(grid).slice(0, 4))
    expect(positions.slice(8)).toEqual(cabinetOrder(grid).slice(8))
    expect(positions.slice(4, 8)).toEqual(cabinetOrder(grid).slice(4, 8).reverse())
  })

  it('is deterministic and leaves frozen inputs unchanged', () => {
    const first = cabinetOrder(grid)
    const second = cabinetOrder(grid)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    for (const position of expectedPositions) {
      const input = Object.freeze({ ...position })
      expect(cabinetIndex(grid, input)).toBe(cabinetIndex(grid, input))
      expect(input).toEqual(position)
    }
    expect(grid.ordering).toEqual(ordering)
    expect(Object.keys(grid)).not.toContain('cabinetIndex')
  })

  const unsupported: readonly Partial<GridOrdering>[] = [
    { numbering: 'column' },
    { startCorner: 'top-right' },
    { startCorner: 'bottom-right' },
    { startCorner: 'bottom-left' },
    { direction: 'top-to-bottom' },
    { direction: 'bottom-to-top' },
  ]

  it.each(unsupported)('rejects unsupported ordering %j with snake ON and OFF', (configuration) => {
    for (const snake of [true, false]) {
      const input = { ...grid, ordering: { ...ordering, ...configuration, snake } }
      expect(() => cabinetIndex(input, { column: 0, row: 0 })).toThrowError(/UNSUPPORTED_ORDERING/)
      expect(() => cabinetOrder(input)).toThrowError(/UNSUPPORTED_ORDERING/)
    }
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects invalid or unsafe grid dimensions %s',
    (dimension) => {
      const inputs: CabinetOrderingInput[] = [
        { ...grid, columns: dimension },
        { ...grid, rows: dimension },
      ]
      for (const input of inputs) {
        expect(() => cabinetIndex(input, { column: 0, row: 0 })).toThrowError(/INVALID_DIMENSION/)
        expect(() => cabinetOrder(input)).toThrowError(/INVALID_DIMENSION/)
      }
    },
  )

  it.each([
    { column: -1, row: 0 },
    { column: 4, row: 0 },
    { column: 0, row: -1 },
    { column: 0, row: 3 },
    { column: 0.5, row: 0 },
    { column: 0, row: 0.5 },
    { column: NaN, row: 0 },
    { column: 0, row: NaN },
    { column: Infinity, row: 0 },
    { column: 0, row: Infinity },
  ])('rejects invalid cabinet position %j', (position) => {
    expect(() => cabinetIndex(grid, position)).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })
})

describe('independent cabinet transformations', () => {
  it('numbers rows without applying direction or snake', () => {
    const offsets = []
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const numbered = numberCabinetPosition(grid, { column, row }, 'row', 'top-left')
        expect(numbered).toEqual({ line: row, offset: column, lineLength: 4 })
        offsets.push(numbered.line * numbered.lineLength + numbered.offset)
      }
    }
    expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('applies horizontal directions independently and rejects vertical directions', () => {
    for (let offset = 0; offset < 4; offset += 1) {
      const position = Object.freeze({ line: 1, offset, lineLength: 4 })
      expect(applyCabinetDirection(position, 'left-to-right')).toEqual(position)
      expect(applyCabinetDirection(position, 'right-to-left')).toEqual({
        ...position,
        offset: position.lineLength - 1 - position.offset,
      })
      expect(position.offset).toBe(offset)
    }
    const position = Object.freeze({ line: 1, offset: 0, lineLength: 4 })
    expect(() => applyCabinetDirection(position, 'top-to-bottom')).toThrowError(/UNSUPPORTED_ORDERING/)
    expect(() => applyCabinetDirection(position, 'bottom-to-top')).toThrowError(/UNSUPPORTED_ORDERING/)
  })

  it('applies snake only to odd rows, preserving row, line length and input', () => {
    const actualRows = []
    for (let line = 0; line < 3; line += 1) {
      const offsets = []
      for (let offset = 0; offset < 4; offset += 1) {
        const position = Object.freeze({ line, offset, lineLength: 4 })
        expect(applyCabinetSnake(position, false)).toEqual(position)
        const result = applyCabinetSnake(position, true)
        expect(result.line).toBe(line)
        expect(result.lineLength).toBe(4)
        expect(applyCabinetSnake(result, true)).toEqual(position)
        offsets.push(result.offset)
      }
      actualRows.push(offsets)
    }
    expect(actualRows).toEqual([[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 3]])
  })
})
