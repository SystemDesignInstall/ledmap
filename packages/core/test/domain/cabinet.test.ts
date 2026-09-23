import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  asCabinetId,
  cabinetPixelCount,
  createCabinet,
} from '../../src/model/index.js'

const grid = asCabinetGridId('grid-1')

function buildCabinet() {
  return createCabinet({
    id: 'cab-1',
    grid,
    column: 0,
    row: 0,
    x: 0,
    y: 0,
    width: 128,
    height: 128,
    pixelWidth: 128,
    pixelHeight: 128,
    moduleColumns: 4,
    moduleRows: 4,
  })
}

describe('Cabinet', () => {
  it('creates a valid cabinet', () => {
    const cabinet = buildCabinet()

    expect(cabinet.id).toBe(asCabinetId('cab-1'))
    expect(cabinet.origin).toEqual({ x: 0, y: 0 })
    expect(cabinet.rotation).toBe(0)
    expect(cabinet.flipH).toBe(false)
    expect(cabinet.flipV).toBe(false)
  })

  it('derives cabinet pixel count from LED array', () => {
    const cabinet = buildCabinet()

    expect(cabinetPixelCount(cabinet)).toBe(128 * 128)
    expect(cabinetPixelCount(cabinet)).toBe(16384)
  })

  it('accepts rotation and flip overrides', () => {
    const cabinet = createCabinet({
      id: 'cab-2',
      grid,
      column: 1,
      row: 0,
      x: 128,
      y: 0,
      width: 128,
      height: 128,
      pixelWidth: 128,
      pixelHeight: 128,
      moduleColumns: 4,
      moduleRows: 4,
      rotation: 90,
      flipH: true,
    })

    expect(cabinet.rotation).toBe(90)
    expect(cabinet.flipH).toBe(true)
    expect(cabinet.flipV).toBe(false)
  })

  it('rejects invalid cabinet dimensions', () => {
    expect(
      () =>
        createCabinet({
          id: 'cab-1',
          grid,
          column: 0,
          row: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 128,
          pixelWidth: 128,
          pixelHeight: 128,
          moduleColumns: 4,
          moduleRows: 4,
        }),
    ).toThrowError(/positive integer/)

    expect(
      () =>
        createCabinet({
          id: 'cab-1',
          grid,
          column: -1,
          row: 0,
          x: 0,
          y: 0,
          width: 128,
          height: 128,
          pixelWidth: 128,
          pixelHeight: 128,
          moduleColumns: 4,
          moduleRows: 4,
        }),
    ).toThrowError(/non-negative integer/)

    expect(
      () =>
        createCabinet({
          id: 'cab-1',
          grid,
          column: 0,
          row: 0,
          x: 0,
          y: 0,
          width: 128,
          height: 128,
          pixelWidth: 128,
          pixelHeight: 128,
          moduleColumns: 0,
          moduleRows: 4,
        }),
    ).toThrowError(/positive integer/)
  })
})