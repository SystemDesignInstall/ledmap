import { describe, expect, it } from 'vitest'
import { asCabinetGridId, asInputCanvasId, asScreenId, createInputCanvas, createMappingRegion } from '../../src/index.js'

const region = {
  id: 'region', inputCanvas: asInputCanvasId('input'), screen: asScreenId('screen'), grid: asCabinetGridId('grid'),
  position: { x: 100, y: 50 }, size: { width: 512, height: 384 },
}

describe('Mapping domain model', () => {
  it('creates an InputCanvas with a separate size and a region with explicit source ownership', () => {
    const resolution = { width: 1920, height: 1080 }
    const canvas = createInputCanvas({ id: 'input', resolution })
    expect(canvas).toEqual({ id: 'input', resolution })
    expect(canvas.resolution).not.toBe(resolution)
    const value = createMappingRegion(region)
    expect(value).toEqual(region)
    expect(value.position).not.toBe(region.position)
    expect(value.size).not.toBe(region.size)
    expect(createInputCanvas({ id: 'large', resolution: { width: Number.MAX_SAFE_INTEGER, height: 1 } }).resolution.width).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid dimensions %s', value => {
    for (const axis of ['width', 'height'] as const) {
      expect(() => createInputCanvas({ id: 'input', resolution: { width: 1, height: 1, [axis]: value } })).toThrowError(/INVALID_DIMENSION/)
      expect(() => createMappingRegion({ ...region, size: { ...region.size, [axis]: value } })).toThrowError(/INVALID_DIMENSION/)
    }
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid source positions %s', value => {
    for (const axis of ['x', 'y'] as const) {
      expect(() => createMappingRegion({ ...region, position: { ...region.position, [axis]: value } })).toThrowError(/INVALID_COORDINATE/)
    }
  })
})
