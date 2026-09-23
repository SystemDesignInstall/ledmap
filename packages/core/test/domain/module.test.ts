import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  createCabinet,
  createModule,
  modulePixelCount,
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

function buildModule(cabinet = buildCabinet(), column = 0, row = 0, width = 32, height = 32, pixelWidth = 32, pixelHeight = 32) {
  return createModule({
    id: 'mod-1',
    cabinet,
    column,
    row,
    width,
    height,
    pixelWidth,
    pixelHeight,
  })
}

describe('Module', () => {
  it('places a module at its grid cell and derives local origin', () => {
    const cabinet = buildCabinet()
    const module = buildModule(cabinet, 1, 2)

    expect(module.localX).toBe(1 * 32)
    expect(module.localY).toBe(2 * 32)
    expect(module.width).toBe(32)
    expect(module.cabinet).toBe(cabinet.id)
  })

  it('derives module pixel count', () => {
    expect(modulePixelCount(buildModule())).toBe(32 * 32)
    expect(modulePixelCount(buildModule())).toBe(1024)
  })

  it('rejects a module outside the cabinet module grid', () => {
    const cabinet = buildCabinet()

    expect(() => buildModule(cabinet, 4, 0)).toThrowError(/MODULE_OUT_OF_RANGE/)
    expect(() => buildModule(cabinet, 0, 4)).toThrowError(/MODULE_OUT_OF_RANGE/)
  })

  it('rejects modules whose sizes do not tile the cabinet', () => {
    const cabinet = buildCabinet()

    expect(() => buildModule(cabinet, 0, 0, 30, 32)).toThrowError(/MODULE_GRID_MISMATCH/)
    expect(() => buildModule(cabinet, 0, 0, 32, 32, 30, 32)).toThrowError(/MODULE_PIXEL_MISMATCH/)
  })

  it('rejects invalid module dimensions', () => {
    expect(() => buildModule(buildCabinet(), 0, 0, 0, 32)).toThrowError(/positive integer/)
    expect(() => buildModule(buildCabinet(), -1, 0)).toThrowError(/non-negative integer/)
  })
})