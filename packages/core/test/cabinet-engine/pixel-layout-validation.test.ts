import { describe, expect, it } from 'vitest'
import {
  cabinetPixelCoordinate,
  decomposeCabinetPixel,
  moduleIndex,
  pixelIndexWithinModule,
  type CabinetPixelLayoutConfig,
} from '../../src/index.js'
import { cabinetPixelLayoutDimensions } from '../../src/cabinet-engine/pixel-layout.js'

const layout: CabinetPixelLayoutConfig = Object.freeze({
  moduleColumns: 3, moduleRows: 2, modulePixelWidth: 5, modulePixelHeight: 7,
})
const unitLayout: CabinetPixelLayoutConfig = Object.freeze({
  moduleColumns: 1, moduleRows: 1, modulePixelWidth: 1, modulePixelHeight: 1,
})
const dimensionNames = ['moduleColumns', 'moduleRows', 'modulePixelWidth', 'modulePixelHeight'] as const

describe('pixel layout dimensions and validation', () => {
  it('derives all five dimensions for 3x2 modules of 5x7 pixels', () => {
    expect(cabinetPixelLayoutDimensions(layout)).toEqual({
      moduleCount: 6,
      modulePixelCount: 35,
      cabinetPixelWidth: 15,
      cabinetPixelHeight: 14,
      cabinetPixelCount: 210,
    })
  })

  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid dimension %s at every relevant public entry point', value => {
      for (const field of dimensionNames) {
        const invalid = { ...layout, [field]: value }
        const error = new RegExp(`INVALID_DIMENSION.*${field}`)
        expect(() => decomposeCabinetPixel(invalid, { x: 0, y: 0 })).toThrowError(error)
        expect(() => cabinetPixelCoordinate(invalid, 0)).toThrowError(error)
        if (field === 'moduleColumns' || field === 'moduleRows') {
          expect(() => moduleIndex(invalid, { column: 0, row: 0 })).toThrowError(error)
        } else {
          expect(() => pixelIndexWithinModule(invalid, { x: 0, y: 0 })).toThrowError(error)
        }
      }
    },
  )

  it.each([
    { product: 'moduleCount', config: { ...unitLayout, moduleColumns: Number.MAX_SAFE_INTEGER, moduleRows: 2 } },
    { product: 'modulePixelCount', config: { ...unitLayout, modulePixelWidth: Number.MAX_SAFE_INTEGER, modulePixelHeight: 2 } },
    { product: 'cabinetPixelWidth', config: { ...unitLayout, moduleColumns: Number.MAX_SAFE_INTEGER, modulePixelWidth: 2 } },
    { product: 'cabinetPixelHeight', config: { ...unitLayout, moduleRows: Number.MAX_SAFE_INTEGER, modulePixelHeight: 2 } },
    { product: 'cabinetPixelCount', config: { ...unitLayout, moduleColumns: 2 ** 26, modulePixelHeight: 2 ** 27 } },
  ])('rejects unsafe derived $product before indexing', ({ product, config }) => {
    const error = new RegExp(`INVALID_DIMENSION.*${product}`)
    expect(() => decomposeCabinetPixel(config, { x: 0, y: 0 })).toThrowError(error)
    expect(() => cabinetPixelCoordinate(config, 0)).toThrowError(error)
    if (product === 'moduleCount') {
      expect(() => moduleIndex(config, { column: 0, row: 0 })).toThrowError(error)
    }
    if (product === 'modulePixelCount') {
      expect(() => pixelIndexWithinModule(config, { x: 0, y: 0 })).toThrowError(error)
    }
  })

  it.each(dimensionNames)('accepts MAX_SAFE_INTEGER for %s when all products remain safe', field => {
    const config = { ...unitLayout, [field]: Number.MAX_SAFE_INTEGER }
    const last = Number.MAX_SAFE_INTEGER - 1
    const coordinate = field === 'moduleColumns' || field === 'modulePixelWidth'
      ? { x: last, y: 0 }
      : { x: 0, y: last }
    expect(cabinetPixelLayoutDimensions(config).cabinetPixelCount).toBe(Number.MAX_SAFE_INTEGER)
    expect(decomposeCabinetPixel(config, coordinate).cabinetPixelOffset).toBe(last)
    expect(cabinetPixelCoordinate(config, last)).toEqual(coordinate)
    expect(() => cabinetPixelCoordinate(config, Number.MAX_SAFE_INTEGER)).toThrowError(/ORDERING_OUT_OF_RANGE/)
  })

  it('preserves exact arithmetic for a large safe product at the final module boundary', () => {
    const config = { ...unitLayout, moduleColumns: 2 ** 26, modulePixelHeight: 2 ** 27 - 1 }
    const last = 9007199187632127
    const coordinate = { x: 67108863, y: 134217726 }
    expect(decomposeCabinetPixel(config, coordinate).cabinetPixelOffset).toBe(last)
    expect(cabinetPixelCoordinate(config, last)).toEqual(coordinate)
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid coordinates and offsets %s', value => {
      const error = /INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/
      expect(() => moduleIndex(layout, { column: value, row: 0 })).toThrowError(error)
      expect(() => moduleIndex(layout, { column: 0, row: value })).toThrowError(error)
      expect(() => pixelIndexWithinModule(layout, { x: value, y: 0 })).toThrowError(error)
      expect(() => pixelIndexWithinModule(layout, { x: 0, y: value })).toThrowError(error)
      expect(() => decomposeCabinetPixel(layout, { x: value, y: 0 })).toThrowError(error)
      expect(() => decomposeCabinetPixel(layout, { x: 0, y: value })).toThrowError(error)
      expect(() => cabinetPixelCoordinate(layout, value)).toThrowError(error)
    },
  )

  it('rejects each exclusive upper bound', () => {
    expect(() => moduleIndex(layout, { column: 3, row: 0 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => moduleIndex(layout, { column: 0, row: 2 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => pixelIndexWithinModule(layout, { x: 5, y: 0 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => pixelIndexWithinModule(layout, { x: 0, y: 7 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => decomposeCabinetPixel(layout, { x: 15, y: 0 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => decomposeCabinetPixel(layout, { x: 0, y: 14 })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => cabinetPixelCoordinate(layout, 210)).toThrowError(/ORDERING_OUT_OF_RANGE/)
  })
})
