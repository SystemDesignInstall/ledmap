import { describe, expect, it } from 'vitest'
import { referenceModuleIndex } from '../../src/index.js'

describe('ReferenceAddressingProfile-001 module order', () => {
  it('assigns M01 through M16 the indexes 0 through 15 in row-major order', () => {
    const indexes = []
    for (let row = 0; row < 4; row += 1) {
      const rowIndexes = []
      for (let column = 0; column < 4; column += 1) {
        rowIndexes.push(referenceModuleIndex({ column, row }))
      }
      indexes.push(rowIndexes)
    }
    expect(indexes).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ])
  })

  it('is deterministic and does not mutate its input', () => {
    const position = Object.freeze({ column: 2, row: 1 })
    expect(referenceModuleIndex(position)).toBe(6)
    expect(referenceModuleIndex(position)).toBe(6)
    expect(position).toEqual({ column: 2, row: 1 })
  })

  it.each([-1, 4, 0.5, NaN, Infinity])('rejects invalid module coordinates %s on either axis', (value) => {
    expect(() => referenceModuleIndex({ column: value, row: 0 })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
    expect(() => referenceModuleIndex({ column: 0, row: value })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })
})
