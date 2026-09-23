import { describe, expect, it } from 'vitest'
import {
  createPixelCoordinate,
  createPoint,
  createSize,
  isWithinBounds,
  type Coord2D,
} from '../../src/model/index.js'

describe('value objects', () => {
  it('creates a valid size', () => {
    expect(createSize(128, 384)).toEqual({ width: 128, height: 384 })
  })

  it('rejects non-positive dimensions', () => {
    expect(() => createSize(0, 384)).toThrowError(/positive integer/)
    expect(() => createSize(128, -1)).toThrowError(/positive integer/)
    expect(() => createSize(128.5, 384)).toThrowError(/positive integer/)
  })

  it('creates a valid point', () => {
    expect(createPoint(0, 10)).toEqual({ x: 0, y: 10 })
  })

  it('rejects negative coordinates', () => {
    expect(() => createPoint(-1, 10)).toThrowError(/non-negative integer/)
    expect(() => createPixelCoordinate(5, -3)).toThrowError(/non-negative integer/)
  })

  it('validates a pixel sits inside bounds', () => {
    const bounds = { width: 128, height: 128 }
    const inside: Coord2D = { x: 127, y: 0 }
    const outside: Coord2D = { x: 128, y: 0 }
    const edgeY: Coord2D = { x: 0, y: 128 }

    expect(isWithinBounds(inside, bounds)).toBe(true)
    expect(isWithinBounds(outside, bounds)).toBe(false)
    expect(isWithinBounds(edgeY, bounds)).toBe(false)
  })
})