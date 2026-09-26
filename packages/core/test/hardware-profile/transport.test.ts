import { describe, expect, it } from 'vitest'
import {
  LEDMAP_GENERIC_REF001, resolveTransportPixel, unresolveTransportPixel, validateHardwareProfile,
  type HardwareProfileBundle,
} from '../../src/index.js'
import { mutableBundle, transportSection, type MutableRecord } from './fixtures.js'

function maskedBundle(scanMode: 'ROW_MAJOR' | 'COLUMN_MAJOR'): HardwareProfileBundle {
  const bundle = mutableBundle()
  transportSection(bundle)['scanMode'] = scanMode
  transportSection(bundle)['transportPixelCountPerCabinet'] = 6
  transportSection(bundle)['activePixelMask'] = {
    width: 8,
    height: 2,
    activePixels: [0, 1, 3, 8, 9, 15],
  }
  return bundle as unknown as HardwareProfileBundle
}

const activeCoordinates: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [3, 0], [0, 1], [1, 1], [7, 1],
]

describe('7E transport indexing without a mask', () => {
  it('maps every pixel of the reference cabinet in row-major order', () => {
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, x, y)).toEqual({ active: true, transportIndex: y * 128 + x })
      }
    }
  })

  it('inverts every reference transport index back to its coordinate', () => {
    for (let index = 0; index < 16384; index += 1) {
      expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, index)).toEqual({ x: index % 128, y: Math.floor(index / 128) })
    }
  })

  it('sweeps the full reference column-major transport set as a bijection', () => {
    const bundle = { ...LEDMAP_GENERIC_REF001, pixelTransportProfile: { ...LEDMAP_GENERIC_REF001.pixelTransportProfile, scanMode: 'COLUMN_MAJOR' as const } }
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    const seen = new Set<number>()
    for (let x = 0; x < 128; x += 1) {
      for (let y = 0; y < 128; y += 1) {
        const resolved = resolveTransportPixel(bundle, x, y)
        expect(resolved.active).toBe(true)
        expect(seen.has(resolved.transportIndex!)).toBe(false)
        seen.add(resolved.transportIndex!)
        expect(unresolveTransportPixel(bundle, resolved.transportIndex!)).toEqual({ x, y })
      }
    }
    expect(seen.size).toBe(16384)
    expect(Math.max(...seen)).toBe(16383)
  })

  it('rejects a transport index below the declared range and accepts the last one', () => {
    expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, -1)).toBeNull()
    expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, 16384)).toBeNull()
    expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, 16383)).toEqual({ x: 127, y: 127 })
  })

  it('rejects a non-integer coordinate or transport index', () => {
    expect(() => resolveTransportPixel(LEDMAP_GENERIC_REF001, 1.5, 0)).toThrow(TypeError)
    expect(() => resolveTransportPixel(LEDMAP_GENERIC_REF001, 0, Number.NaN)).toThrow(TypeError)
    expect(() => unresolveTransportPixel(LEDMAP_GENERIC_REF001, 0.5)).toThrow(TypeError)
  })
})

describe('7E transport indexing with a mask', () => {
  it('produces a different mapping for row-major and column-major scan modes', () => {
    const rowMajor = maskedBundle('ROW_MAJOR')
    const columnMajor = maskedBundle('COLUMN_MAJOR')
    expect(validateHardwareProfile(rowMajor).valid).toBe(true)
    expect(validateHardwareProfile(columnMajor).valid).toBe(true)
    const rowIndices = activeCoordinates.map(([x, y]) => resolveTransportPixel(rowMajor, x, y).transportIndex)
    const columnIndices = activeCoordinates.map(([x, y]) => resolveTransportPixel(columnMajor, x, y).transportIndex)
    expect(rowIndices).toEqual([0, 1, 2, 3, 4, 5])
    expect(columnIndices).toEqual([0, 2, 4, 1, 3, 5])
    expect(columnIndices).not.toEqual(rowIndices)
  })

  it('assigns compact transport indices only to active pixels', () => {
    const bundle = maskedBundle('ROW_MAJOR')
    expect(activeCoordinates.map(([x, y]) => resolveTransportPixel(bundle, x, y).transportIndex)).toEqual([0, 1, 2, 3, 4, 5])
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (activeCoordinates.some(([ax, ay]) => ax === x && ay === y)) continue
        expect(resolveTransportPixel(bundle, x, y)).toEqual({ active: false, transportIndex: null })
      }
    }
  })

  it('keeps a masked bijection for both scan modes over every active pixel', () => {
    for (const scanMode of ['ROW_MAJOR', 'COLUMN_MAJOR'] as const) {
      const bundle = maskedBundle(scanMode)
      const seen = new Set<number>()
      for (const [x, y] of activeCoordinates) {
        const resolved = resolveTransportPixel(bundle, x, y)
        expect(resolved.active).toBe(true)
        expect(seen.has(resolved.transportIndex!)).toBe(false)
        seen.add(resolved.transportIndex!)
        expect(unresolveTransportPixel(bundle, resolved.transportIndex!)).toEqual({ x, y })
      }
      expect(seen.size).toBe(6)
      expect(unresolveTransportPixel(bundle, 6)).toBeNull()
    }
  })

  it('reports an out-of-bounds coordinate inside the declared cabinet as inactive', () => {
    const bundle = maskedBundle('ROW_MAJOR')
    expect(resolveTransportPixel(bundle, 8, 0)).toEqual({ active: false, transportIndex: null })
    expect(resolveTransportPixel(bundle, 0, 2)).toEqual({ active: false, transportIndex: null })
  })

  it('returns frozen result objects without freezing or mutating the profile', () => {
    const bundle = maskedBundle('ROW_MAJOR')
    const resolved = resolveTransportPixel(bundle, 0, 0)
    const unresolved = unresolveTransportPixel(bundle, 0)
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(unresolved)).toBe(true)
    expect(Object.isFrozen(bundle)).toBe(false)
    expect(Object.isFrozen(bundle.pixelTransportProfile)).toBe(false)
    expect((bundle as unknown as MutableRecord)['pixelTransportProfile']).toEqual({
      moduleProfileId: 'ledmap.test.module',
      transportPixelCountPerCabinet: 6,
      scanMode: 'ROW_MAJOR',
      activePixelMask: { width: 8, height: 2, activePixels: [0, 1, 3, 8, 9, 15] },
    })
  })

  it('produces identical results for equal but distinct profile objects', () => {
    const first = maskedBundle('ROW_MAJOR')
    const second = maskedBundle('ROW_MAJOR')
    expect(first).not.toBe(second)
    expect(first.pixelTransportProfile).not.toBe(second.pixelTransportProfile)
    expect(resolveTransportPixel(first, 3, 1)).toEqual(resolveTransportPixel(second, 3, 1))
    expect(unresolveTransportPixel(first, 4)).toEqual(unresolveTransportPixel(second, 4))
  })
})
