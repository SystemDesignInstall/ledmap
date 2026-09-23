import { describe, expect, it } from 'vitest'
import {
  decomposeReferenceCabinetPixel,
  referenceCabinetPixelCoordinate,
} from '../../src/index.js'

describe('ReferenceAddressingProfile-001 cabinet-local coordinates', () => {
  it.each([
    { x: 0, y: 0, offset: 0 },
    { x: 31, y: 0, offset: 31 },
    { x: 0, y: 1, offset: 32 },
    { x: 31, y: 31, offset: 1023 },
    { x: 32, y: 0, offset: 1024 },
    { x: 0, y: 32, offset: 4096 },
    { x: 127, y: 127, offset: 16383 },
  ])('maps ($x,$y) to cabinetPixelOffset $offset and back', ({ x, y, offset }) => {
    expect(decomposeReferenceCabinetPixel({ x, y }).cabinetPixelOffset).toBe(offset)
    expect(referenceCabinetPixelCoordinate(offset)).toEqual({ x, y })
  })

  it('exposes the full module-first decomposition across the first module boundary', () => {
    expect(decomposeReferenceCabinetPixel({ x: 31, y: 31 })).toEqual({
      moduleColumn: 0,
      moduleRow: 0,
      moduleIndex: 0,
      pixelX: 31,
      pixelY: 31,
      pixelIndexWithinModule: 1023,
      cabinetPixelOffset: 1023,
    })
    expect(decomposeReferenceCabinetPixel({ x: 32, y: 0 })).toEqual({
      moduleColumn: 1,
      moduleRow: 0,
      moduleIndex: 1,
      pixelX: 0,
      pixelY: 0,
      pixelIndexWithinModule: 0,
      cabinetPixelOffset: 1024,
    })
  })

  it('round-trips every cabinet coordinate and covers exactly 0 through 16383', () => {
    const offsets = new Set<number>()
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        const coordinate = { x, y }
        const result = decomposeReferenceCabinetPixel(coordinate)
        offsets.add(result.cabinetPixelOffset)
        expect(referenceCabinetPixelCoordinate(result.cabinetPixelOffset)).toEqual(coordinate)
      }
    }
    expect([...offsets].sort((a, b) => a - b)).toEqual(Array.from({ length: 16384 }, (_, index) => index))
  })

  it('matches independent module-by-module traversal for all offsets and inverse decompositions', () => {
    let offset = 0
    let moduleIndex = 0
    for (const moduleY of [0, 32, 64, 96]) {
      for (const moduleX of [0, 32, 64, 96]) {
        let pixelIndexWithinModule = 0
        for (let pixelY = 0; pixelY < 32; pixelY += 1) {
          for (let pixelX = 0; pixelX < 32; pixelX += 1) {
            const coordinate = referenceCabinetPixelCoordinate(offset)
            expect(coordinate).toEqual({ x: moduleX + pixelX, y: moduleY + pixelY })
            expect(decomposeReferenceCabinetPixel(coordinate)).toEqual({
              moduleColumn: moduleX / 32,
              moduleRow: moduleY / 32,
              moduleIndex,
              pixelX,
              pixelY,
              pixelIndexWithinModule,
              cabinetPixelOffset: offset,
            })
            offset += 1
            pixelIndexWithinModule += 1
          }
        }
        moduleIndex += 1
      }
    }
    expect(offset).toBe(16384)
    expect(moduleIndex).toBe(16)
  })

  it('is deterministic, preserves input and does not share returned state', () => {
    const coordinate = Object.freeze({ x: 100, y: 70 })
    const first = decomposeReferenceCabinetPixel(coordinate)
    const second = decomposeReferenceCabinetPixel(coordinate)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(coordinate).toEqual({ x: 100, y: 70 })
    const inverse = referenceCabinetPixelCoordinate(first.cabinetPixelOffset)
    expect(referenceCabinetPixelCoordinate(first.cabinetPixelOffset)).toEqual(inverse)
    expect(referenceCabinetPixelCoordinate(first.cabinetPixelOffset)).not.toBe(inverse)
  })

  it.each([-1, 128, 0.5, NaN, Infinity])('rejects invalid cabinet pixels %s on either axis', (value) => {
    expect(() => decomposeReferenceCabinetPixel({ x: value, y: 0 })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
    expect(() => decomposeReferenceCabinetPixel({ x: 0, y: value })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })

  it.each([-1, 16384, 0.5, NaN, Infinity])('rejects invalid cabinetPixelOffset %s', (offset) => {
    expect(() => referenceCabinetPixelCoordinate(offset)).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })
})
