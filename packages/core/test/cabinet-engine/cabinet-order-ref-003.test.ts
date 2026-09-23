import { describe, expect, it } from 'vitest'
import {
  asScreenId,
  cabinetIndex,
  cabinetOrder,
  createCabinetGrid,
  type GridOrdering,
  type StartCorner,
} from '../../src/index.js'
import { applyCabinetDirection } from '../../src/cabinet-engine/direction.js'
import { numberCabinetPosition, type TraversalPosition } from '../../src/cabinet-engine/numbering.js'
import { applyCabinetSnake } from '../../src/cabinet-engine/snake.js'

const ordering: GridOrdering = Object.freeze({
  numbering: 'column',
  startCorner: 'top-left',
  direction: 'top-to-bottom',
  snake: true,
})

const grid = Object.freeze(createCabinetGrid({
  id: 'grid-003',
  screen: asScreenId('screen-001'),
  name: 'REF-003',
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

const cases = [
  {
    snake: false,
    positions: [
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: 2 },
      { column: 1, row: 0 },
      { column: 1, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 0 },
      { column: 2, row: 1 },
      { column: 2, row: 2 },
      { column: 3, row: 0 },
      { column: 3, row: 1 },
      { column: 3, row: 2 },
    ],
    labels: [
      'C01', 'C05', 'C09',
      'C02', 'C06', 'C10',
      'C03', 'C07', 'C11',
      'C04', 'C08', 'C12',
    ],
    indices: [
      [0, 3, 6, 9],
      [1, 4, 7, 10],
      [2, 5, 8, 11],
    ],
  },
  {
    snake: true,
    positions: [
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: 2 },
      { column: 1, row: 2 },
      { column: 1, row: 1 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 2, row: 1 },
      { column: 2, row: 2 },
      { column: 3, row: 2 },
      { column: 3, row: 1 },
      { column: 3, row: 0 },
    ],
    labels: [
      'C01', 'C05', 'C09',
      'C10', 'C06', 'C02',
      'C03', 'C07', 'C11',
      'C12', 'C08', 'C04',
    ],
    indices: [
      [0, 5, 6, 11],
      [1, 4, 7, 10],
      [2, 3, 8, 9],
    ],
  },
]

describe('REF-003 cabinet order', () => {
  describe.each(cases)('Snake $snake', ({ snake, positions, labels, indices }) => {
    const input = Object.freeze({ ...grid, ordering: Object.freeze({ ...ordering, snake }) })

    it('orders Top-to-Bottom columns exactly', () => {
      const actual = cabinetOrder(input)
      expect(actual).toEqual(positions)
      expect(actual.map(({ column, row }) => physicalCabinets[row]?.[column])).toEqual(labels)
    })

    it.each(indices.flatMap((rowIndices, row) => (
      rowIndices.map((index, column) => ({ column, row, index }))
    )))(
      'maps physical ($column,$row) to cabinetIndex $index',
      ({ column, row, index }) => {
        expect(cabinetIndex(input, Object.freeze({ column, row }))).toBe(index)
      },
    )

    it('is deterministic and leaves frozen inputs unchanged', () => {
      const before = { ...input, ordering: { ...input.ordering } }
      const first = cabinetOrder(input)
      const second = cabinetOrder(input)
      expect(second).toEqual(first)
      expect(second).not.toBe(first)
      expect(input).toEqual(before)
    })
  })

  const incompatible: readonly Pick<GridOrdering, 'numbering' | 'direction'>[] = [
    { numbering: 'row', direction: 'top-to-bottom' },
    { numbering: 'row', direction: 'bottom-to-top' },
    { numbering: 'column', direction: 'left-to-right' },
    { numbering: 'column', direction: 'right-to-left' },
    { numbering: 'column', direction: 'bottom-to-top' },
  ]

  it.each(incompatible)('rejects $numbering + $direction with Snake ON and OFF', (configuration) => {
    const position = { column: 0, row: 0 }
    const numbered = numberCabinetPosition(grid, position, configuration.numbering, 'top-left')
    expect(() => applyCabinetDirection(numbered, configuration.direction))
      .toThrowError(/UNSUPPORTED_ORDERING/)
    for (const snake of [false, true]) {
      const input = { ...grid, ordering: { ...ordering, ...configuration, snake } }
      expect(() => cabinetIndex(input, position)).toThrowError(/UNSUPPORTED_ORDERING/)
      expect(() => cabinetOrder(input)).toThrowError(/UNSUPPORTED_ORDERING/)
    }
  })

  const unsupportedCorners: readonly StartCorner[] = ['top-right', 'bottom-right', 'bottom-left']

  it.each(unsupportedCorners)('rejects Column starting from %s', (startCorner) => {
    for (const snake of [false, true]) {
      const input = { ...grid, ordering: { ...ordering, startCorner, snake } }
      expect(() => cabinetIndex(input, { column: 0, row: 0 })).toThrowError(/UNSUPPORTED_ORDERING/)
      expect(() => cabinetOrder(input)).toThrowError(/UNSUPPORTED_ORDERING/)
    }
  })
})

describe('independent vertical cabinet transformations', () => {
  it('decomposes every Column position without applying direction or snake', () => {
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 3; row += 1) {
        const position = Object.freeze({ column, row })
        expect(numberCabinetPosition(grid, position, 'column', 'top-left')).toEqual({
          line: column,
          offset: row,
          lineLength: 3,
          axis: 'vertical',
        })
      }
    }
  })

  it('applies Top-to-Bottom as identity on even and odd vertical lines independently of Snake', () => {
    for (let line = 0; line < 4; line += 1) {
      for (let offset = 0; offset < 3; offset += 1) {
        const position = Object.freeze({ line, offset, lineLength: 3, axis: 'vertical' })
        expect(applyCabinetDirection(position, 'top-to-bottom')).toEqual(position)
      }
    }
  })

  it('applies Snake independently to an already vertical Top-to-Bottom traversal', () => {
    const columns: TraversalPosition[][] = [0, 1, 2, 3].map((line) => (
      [0, 1, 2].map((offset) => Object.freeze(applyCabinetDirection(
        { line, offset, lineLength: 3, axis: 'vertical' },
        'top-to-bottom',
      )))
    ))

    expect(columns.map((column) => column.map((position) => applyCabinetSnake(position, false).offset)))
      .toEqual([
        [0, 1, 2],
        [0, 1, 2],
        [0, 1, 2],
        [0, 1, 2],
      ])
    expect(columns.map((column) => column.map((position) => applyCabinetSnake(position, true).offset)))
      .toEqual([
        [0, 1, 2],
        [2, 1, 0],
        [0, 1, 2],
        [2, 1, 0],
      ])
    for (const position of columns.flat()) {
      expect(applyCabinetSnake(position, false)).toEqual(position)
      const snaked = applyCabinetSnake(position, true)
      expect(snaked.line).toBe(position.line)
      expect(snaked.lineLength).toBe(position.lineLength)
      expect(snaked.axis).toBe('vertical')
      expect(applyCabinetSnake(snaked, true)).toEqual(position)
    }
  })
})
