import { describe, expect, it } from 'vitest'
import { referencePixelIndexWithinModule } from '../../src/index.js'

describe('ReferenceAddressingProfile-001 pixel order', () => {
  it('visits all 1024 module pixels in row-major order without gaps', () => {
    let expectedIndex = 0
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        expect(referencePixelIndexWithinModule({ x, y })).toBe(expectedIndex)
        expectedIndex += 1
      }
    }
    expect(expectedIndex).toBe(1024)
  })

  it('is deterministic and preserves a frozen coordinate', () => {
    const coordinate = Object.freeze({ x: 31, y: 31 })
    expect(referencePixelIndexWithinModule(coordinate)).toBe(1023)
    expect(referencePixelIndexWithinModule(coordinate)).toBe(1023)
    expect(coordinate).toEqual({ x: 31, y: 31 })
  })

  it.each([-1, 32, 0.5, NaN, Infinity])('rejects invalid pixel coordinates %s on either axis', (value) => {
    expect(() => referencePixelIndexWithinModule({ x: value, y: 0 })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
    expect(() => referencePixelIndexWithinModule({ x: 0, y: value })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })
})
