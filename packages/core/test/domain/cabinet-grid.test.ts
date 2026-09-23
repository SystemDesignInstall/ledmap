import { describe, expect, it } from 'vitest'
import { asScreenId, createCabinetGrid, gridCabinetCount } from '../../src/model/index.js'

const screen = asScreenId('screen-1')

describe('CabinetGrid', () => {
  it('creates a valid 4x3 grid', () => {
    const grid = createCabinetGrid({
      id: 'grid-1',
      screen,
      name: 'Wall',
      columns: 4,
      rows: 3,
      cabinetWidth: 128,
      cabinetHeight: 128,
    })

    expect(grid.ordering).toEqual({
      numbering: 'row',
      startCorner: 'top-left',
      direction: 'left-to-right',
      snake: false,
    })
  })

  it('derives cabinet count as rows x columns', () => {
    const grid = createCabinetGrid({
      id: 'grid-1',
      screen,
      name: 'Wall',
      columns: 4,
      rows: 3,
      cabinetWidth: 128,
      cabinetHeight: 128,
    })

    expect(gridCabinetCount(grid)).toBe(12)
  })

  it('rejects invalid grids', () => {
    expect(
      () =>
        createCabinetGrid({
          id: 'grid-1',
          screen,
          name: 'Wall',
          columns: 0,
          rows: 3,
          cabinetWidth: 128,
          cabinetHeight: 128,
        }),
    ).toThrowError(/positive integer/)

    expect(
      () =>
        createCabinetGrid({
          id: 'grid-1',
          screen,
          name: 'Wall',
          columns: 4,
          rows: -2,
          cabinetWidth: 128,
          cabinetHeight: 128,
        }),
    ).toThrowError(/positive integer/)

    expect(
      () =>
        createCabinetGrid({
          id: 'grid-1',
          screen,
          name: 'Wall',
          columns: 4,
          rows: 3,
          cabinetWidth: 0,
          cabinetHeight: 128,
        }),
    ).toThrowError(/positive integer/)
  })
})