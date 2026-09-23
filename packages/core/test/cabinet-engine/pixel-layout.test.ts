import { describe, expect, it } from 'vitest'
import {
  cabinetIndex,
  cabinetPixelCoordinate,
  decomposeCabinetPixel,
  moduleIndex,
  pixelIndexWithinModule,
  referenceCabinetLayout,
  type CabinetEngineConfig,
  type GridOrdering,
} from '../../src/index.js'
import { cabinetPixelLayoutDimensions } from '../../src/cabinet-engine/pixel-layout.js'

const layout = Object.freeze({
  moduleColumns: 3,
  moduleRows: 2,
  modulePixelWidth: 5,
  modulePixelHeight: 7,
})

describe('3 x 2 modules of 5 x 7 pixels', () => {
  it('also handles a single pixel cabinet', () => {
    const unit = { moduleColumns: 1, moduleRows: 1, modulePixelWidth: 1, modulePixelHeight: 1 }
    expect(decomposeCabinetPixel(unit, { x: 0, y: 0 })).toEqual({
      moduleColumn: 0, moduleRow: 0, moduleIndex: 0,
      pixelX: 0, pixelY: 0, pixelIndexWithinModule: 0, cabinetPixelOffset: 0,
    })
    expect(cabinetPixelCoordinate(unit, 0)).toEqual({ x: 0, y: 0 })
  })

  it('derives the rectangular geometry', () => {
    expect(cabinetPixelLayoutDimensions(layout)).toEqual({
      moduleCount: 6,
      modulePixelCount: 35,
      cabinetPixelWidth: 15,
      cabinetPixelHeight: 14,
      cabinetPixelCount: 210,
    })
  })

  it.each([
    { x: 0, y: 0, offset: 0 },
    { x: 4, y: 6, offset: 34 },
    { x: 5, y: 0, offset: 35 },
    { x: 0, y: 7, offset: 105 },
    { x: 14, y: 13, offset: 209 },
  ])('maps ($x,$y) to module-first offset $offset', ({ x, y, offset }) => {
    expect(decomposeCabinetPixel(layout, { x, y }).cabinetPixelOffset).toBe(offset)
    expect(cabinetPixelCoordinate(layout, offset)).toEqual({ x, y })
  })

  it('round-trips every coordinate and covers exactly all 210 offsets', () => {
    const offsets = new Set<number>()
    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 15; x += 1) {
        const coordinate = { x, y }
        const pixel = decomposeCabinetPixel(layout, coordinate)
        offsets.add(pixel.cabinetPixelOffset)
        expect(cabinetPixelCoordinate(layout, pixel.cabinetPixelOffset)).toEqual(coordinate)
      }
    }
    expect([...offsets].sort((a, b) => a - b)).toEqual(Array.from({ length: 210 }, (_, index) => index))
  })

  it('round-trips every offset against independent module-first traversal', () => {
    let offset = 0
    let module = 0
    for (const moduleY of [0, 7]) {
      for (const moduleX of [0, 5, 10]) {
        let pixel = 0
        for (let y = 0; y < 7; y += 1) {
          for (let x = 0; x < 5; x += 1) {
            const coordinate = cabinetPixelCoordinate(layout, offset)
            expect(coordinate).toEqual({ x: moduleX + x, y: moduleY + y })
            expect(decomposeCabinetPixel(layout, coordinate)).toEqual({
              moduleColumn: moduleX / 5,
              moduleRow: moduleY / 7,
              moduleIndex: module,
              pixelX: x,
              pixelY: y,
              pixelIndexWithinModule: pixel,
              cabinetPixelOffset: offset,
            })
            pixel += 1
            offset += 1
          }
        }
        module += 1
      }
    }
    expect(offset).toBe(210)
    expect(module).toBe(6)
  })

  it('accepts minimal module and pixel configurations without cabinet ordering', () => {
    const modules = Object.freeze({ moduleColumns: 3, moduleRows: 2 })
    expect([0, 1].map((row) => [0, 1, 2].map((column) => moduleIndex(modules, { column, row }))))
      .toEqual([[0, 1, 2], [3, 4, 5]])
    const pixels = Object.freeze({ modulePixelWidth: 5, modulePixelHeight: 7 })
    let expected = 0
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        expect(pixelIndexWithinModule(pixels, { x, y })).toBe(expected)
        expected += 1
      }
    }
    expect(expected).toBe(35)
  })

  it('keeps pixel layout independent from cabinet numbering, direction and snake', () => {
    const orderings: readonly GridOrdering[] = [
      { numbering: 'row', direction: 'left-to-right', startCorner: 'top-left', snake: false },
      { numbering: 'row', direction: 'right-to-left', startCorner: 'top-left', snake: true },
      { numbering: 'column', direction: 'top-to-bottom', startCorner: 'top-left', snake: true },
      { numbering: 'column', direction: 'bottom-to-top', startCorner: 'top-left', snake: false },
    ]
    const indexes = []
    for (const ordering of orderings) {
      const config: CabinetEngineConfig = Object.freeze({
        ...layout, columns: 4, rows: 3, ordering: Object.freeze(ordering),
      })
      indexes.push(cabinetIndex(config, { column: 0, row: 0 }))
      expect(moduleIndex(config, { column: 1, row: 1 })).toBe(4)
      expect(pixelIndexWithinModule(config, { x: 4, y: 6 })).toBe(34)
      expect(decomposeCabinetPixel(config, { x: 5, y: 0 }).cabinetPixelOffset).toBe(35)
      expect(cabinetPixelCoordinate(config, 35)).toEqual({ x: 5, y: 0 })
    }
    expect(indexes).toEqual([0, 3, 0, 2])
  })

  it('is deterministic and preserves frozen inputs without sharing returned state', () => {
    const coordinate = Object.freeze({ x: 12, y: 9 })
    const before = { ...layout }
    const first = decomposeCabinetPixel(layout, coordinate)
    const second = decomposeCabinetPixel(layout, coordinate)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    const inverse = cabinetPixelCoordinate(layout, first.cabinetPixelOffset)
    expect(cabinetPixelCoordinate(layout, first.cabinetPixelOffset)).toEqual(inverse)
    expect(cabinetPixelCoordinate(layout, first.cabinetPixelOffset)).not.toBe(inverse)
    expect(coordinate).toEqual({ x: 12, y: 9 })
    expect(layout).toEqual(before)
    expect(Object.isFrozen(referenceCabinetLayout)).toBe(true)
    expect(referenceCabinetLayout).toEqual({
      moduleColumns: 4, moduleRows: 4, modulePixelWidth: 32, modulePixelHeight: 32,
    })
  })
})
