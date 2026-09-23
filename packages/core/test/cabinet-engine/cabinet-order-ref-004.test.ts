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
  direction: 'bottom-to-top',
  snake: true,
})

const grid = Object.freeze(createCabinetGrid({
  id: 'grid-004',
  screen: asScreenId('screen-001'),
  name: 'REF-004',
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
      { column: 0, row: 2 },
      { column: 0, row: 1 },
      { column: 0, row: 0 },
      { column: 1, row: 2 },
      { column: 1, row: 1 },
      { column: 1, row: 0 },
      { column: 2, row: 2 },
      { column: 2, row: 1 },
      { column: 2, row: 0 },
      { column: 3, row: 2 },
      { column: 3, row: 1 },
      { column: 3, row: 0 },
    ],
    labels: [
      'C09', 'C05', 'C01',
      'C10', 'C06', 'C02',
      'C11', 'C07', 'C03',
      'C12', 'C08', 'C04',
    ],
    indices: [
      [2, 5, 8, 11],
      [1, 4, 7, 10],
      [0, 3, 6, 9],
    ],
  },
  {
    snake: true,
    positions: [
      { column: 0, row: 2 },
      { column: 0, row: 1 },
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 1, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 2 },
      { column: 2, row: 1 },
      { column: 2, row: 0 },
      { column: 3, row: 0 },
      { column: 3, row: 1 },
      { column: 3, row: 2 },
    ],
    labels: [
      'C09', 'C05', 'C01',
      'C02', 'C06', 'C10',
      'C11', 'C07', 'C03',
      'C04', 'C08', 'C12',
    ],
    indices: [
      [2, 3, 8, 9],
      [1, 4, 7, 10],
      [0, 5, 6, 11],
    ],
  },
]

describe('REF-004 cabinet order', () => {
  describe.each(cases)('Snake $snake', ({ snake, positions, labels, indices }) => {
    const input = Object.freeze({ ...grid, ordering: Object.freeze({ ...ordering, snake }) })

    it('orders Bottom-to-Top columns exactly', () => {
      const actual = cabinetOrder(input)
      expect(actual).toEqual(positions)
      expect(actual.map(({ column, row }) => physicalCabinets[row]?.[column])).toEqual(labels)
      expect(actual.map((position) => cabinetIndex(input, position)))
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
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

    it.each([
      { columns: 1, rows: 1, expected: [{ column: 0, row: 0 }] },
      {
        columns: 1,
        rows: 3,
        expected: [{ column: 0, row: 2 }, { column: 0, row: 1 }, { column: 0, row: 0 }],
      },
      {
        columns: 4,
        rows: 1,
        expected: [
          { column: 0, row: 0 }, { column: 1, row: 0 },
          { column: 2, row: 0 }, { column: 3, row: 0 },
        ],
      },
    ])('orders a $columns x $rows grid', ({ columns, rows, expected }) => {
      const smallGrid = { ...input, columns, rows }
      expect(cabinetOrder(smallGrid)).toEqual(expected)
      for (const [index, position] of expected.entries()) {
        expect(cabinetIndex(smallGrid, position)).toBe(index)
      }
    })
  })

  const unsupportedCorners: readonly StartCorner[] = ['top-right', 'bottom-right', 'bottom-left']

  it.each(unsupportedCorners)('rejects Bottom-to-Top starting from %s', (startCorner) => {
    for (const snake of [false, true]) {
      const input = { ...grid, ordering: { ...ordering, startCorner, snake } }
      expect(() => cabinetIndex(input, { column: 0, row: 0 })).toThrowError(/UNSUPPORTED_ORDERING/)
      expect(() => cabinetOrder(input)).toThrowError(/UNSUPPORTED_ORDERING/)
    }
  })
})

describe('independent Bottom-to-Top cabinet transformations', () => {
  it('reverses every vertical offset independently of line parity, preserving other fields and input', () => {
    for (const lineLength of [1, 3, 4]) {
      for (let line = 0; line < 4; line += 1) {
        const offsets = []
        for (let offset = 0; offset < lineLength; offset += 1) {
          const position = Object.freeze({ line, offset, lineLength, axis: 'vertical' })
          const directed = applyCabinetDirection(position, 'bottom-to-top')
          expect(directed.line).toBe(line)
          expect(directed.lineLength).toBe(lineLength)
          expect(directed.axis).toBe('vertical')
          expect(applyCabinetDirection(directed, 'bottom-to-top')).toEqual(position)
          expect(position).toEqual({ line, offset, lineLength, axis: 'vertical' })
          offsets.push(directed.offset)
        }
        expect(offsets).toEqual(lineLength === 1 ? [0] : lineLength === 3 ? [2, 1, 0] : [3, 2, 1, 0])
      }
    }
  })

  it('applies Snake independently after Numbering and Bottom-to-Top direction', () => {
    const columns: TraversalPosition[][] = [0, 1, 2, 3].map((column) => (
      [0, 1, 2].map((row) => {
        const numbered = Object.freeze(numberCabinetPosition(grid, { column, row }, 'column', 'top-left'))
        expect(numbered).toEqual({ line: column, offset: row, lineLength: 3, axis: 'vertical' })
        return Object.freeze(applyCabinetDirection(numbered, 'bottom-to-top'))
      })
    ))

    expect(columns.map((column) => column.map((position) => applyCabinetSnake(position, false).offset)))
      .toEqual([
        [2, 1, 0],
        [2, 1, 0],
        [2, 1, 0],
        [2, 1, 0],
      ])
    expect(columns.map((column) => column.map((position) => applyCabinetSnake(position, true).offset)))
      .toEqual([
        [2, 1, 0],
        [0, 1, 2],
        [2, 1, 0],
        [0, 1, 2],
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
