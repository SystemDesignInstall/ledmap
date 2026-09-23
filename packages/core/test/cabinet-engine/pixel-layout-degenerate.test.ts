import { describe, expect, it } from 'vitest'
import { cabinetPixelCoordinate, decomposeCabinetPixel } from '../../src/index.js'

describe('degenerate cabinet pixel layouts', () => {
  it.each([
    {
      layout: { moduleColumns: 1, moduleRows: 3, modulePixelWidth: 2, modulePixelHeight: 1 },
      coordinates: [
        { x: 0, y: 0 }, { x: 1, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 },
      ],
    },
    {
      layout: { moduleColumns: 4, moduleRows: 1, modulePixelWidth: 1, modulePixelHeight: 3 },
      coordinates: [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
        { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 },
      ],
    },
    {
      layout: { moduleColumns: 3, moduleRows: 2, modulePixelWidth: 1, modulePixelHeight: 1 },
      coordinates: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      ],
    },
  ])('round-trips $layout.moduleColumns x $layout.moduleRows modules of $layout.modulePixelWidth x $layout.modulePixelHeight pixels', ({ layout, coordinates }) => {
    for (const [offset, coordinate] of coordinates.entries()) {
      expect(decomposeCabinetPixel(layout, coordinate).cabinetPixelOffset).toBe(offset)
      expect(cabinetPixelCoordinate(layout, offset)).toEqual(coordinate)
    }
    expect(() => cabinetPixelCoordinate(layout, coordinates.length)).toThrowError(/ORDERING_OUT_OF_RANGE/)
  })
})
