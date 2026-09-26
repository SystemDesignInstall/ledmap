import { describe, expect, it } from 'vitest'
import {
  resolveTransportPixel, unresolveTransportPixel, validateHardwareProfile,
  type HardwareProfileBundle,
} from '../../src/index.js'
import { mutableBundle, transportSection } from './fixtures.js'

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

function codes(value: unknown): string[] {
  return validateHardwareProfile(value).checks.map(check => check.code)
}

function withMask(activePixelMask: unknown, count = activePixelsOf(activePixelMask).length): HardwareProfileBundle {
  const bundle = mutableBundle()
  transportSection(bundle)['activePixelMask'] = activePixelMask
  transportSection(bundle)['transportPixelCountPerCabinet'] = count
  return bundle as unknown as HardwareProfileBundle
}

function activePixelsOf(mask: unknown): number[] {
  return ((mask as { activePixels?: number[] }).activePixels ?? [])
}

describe('7E active pixel mask semantics', () => {
  it('rejects a mask whose dimensions do not match the derived cabinet geometry', () => {
    const bundle = withMask({ width: 4, height: 2, activePixels: [0, 1] })
    expect(paths(bundle, 'PROFILE_MASK_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask']])
  })

  it('rejects a mask that omits the height of the derived geometry', () => {
    const bundle = withMask({ width: 8, activePixels: [0, 1] })
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_MISSING'])
  })

  it('rejects a mask with an unknown extra field', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [0, 1], invert: true })
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask', 'invert']])
  })

  it('rejects an entry outside the mask bounds', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [0, 1, 16] })
    expect(paths(bundle, 'PROFILE_MASK_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels', 2]])
  })

  it('rejects a membership set that is not strictly increasing', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [0, 1, 1] })
    expect(paths(bundle, 'PROFILE_MASK_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels', 2]])
  })

  it('rejects an empty membership set', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [] })
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT'))
      .toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels']])
  })

  it('rejects a declared count that differs from the membership cardinality', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [0, 1, 2] }, 4)
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT'))
      .toEqual([['pixelTransportProfile', 'transportPixelCountPerCabinet']])
  })

  it('accepts a full geometry mask that declares no invalidation', () => {
    const all = Array.from({ length: 16 }, (_, index) => index)
    const bundle = withMask({ width: 8, height: 2, activePixels: all }, 16)
    expect(validateHardwareProfile(bundle)).toEqual({ valid: true, checks: [] })
  })

  it('accepts a sparse mask and stays consistent with the declared count', () => {
    const bundle = withMask({ width: 8, height: 2, activePixels: [0, 7, 15] }, 3)
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    expect(resolveTransportPixel(bundle, 0, 0)).toEqual({ active: true, transportIndex: 0 })
    expect(resolveTransportPixel(bundle, 7, 0)).toEqual({ active: true, transportIndex: 1 })
    expect(resolveTransportPixel(bundle, 7, 1)).toEqual({ active: true, transportIndex: 2 })
    expect(resolveTransportPixel(bundle, 1, 0).active).toBe(false)
    expect(unresolveTransportPixel(bundle, 2)).toEqual({ x: 7, y: 1 })
    expect(unresolveTransportPixel(bundle, 3)).toBeNull()
  })

  it('keeps row-major and column-major order distinct for the same sparse mask', () => {
    const rowMajor = withMask({ width: 8, height: 2, activePixels: [0, 7, 15] }, 3)
    const columnMajor = mutableBundle()
    transportSection(columnMajor)['scanMode'] = 'COLUMN_MAJOR'
    transportSection(columnMajor)['activePixelMask'] = { width: 8, height: 2, activePixels: [0, 7, 15] }
    transportSection(columnMajor)['transportPixelCountPerCabinet'] = 3
    const typed = columnMajor as unknown as HardwareProfileBundle
    expect(validateHardwareProfile(typed).valid).toBe(true)
    expect(unresolveTransportPixel(rowMajor, 0)).toEqual({ x: 0, y: 0 })
    expect(unresolveTransportPixel(rowMajor, 1)).toEqual({ x: 7, y: 0 })
    expect(unresolveTransportPixel(rowMajor, 2)).toEqual({ x: 7, y: 1 })
    expect(unresolveTransportPixel(typed, 0)).toEqual({ x: 0, y: 0 })
    expect(unresolveTransportPixel(typed, 1)).toEqual({ x: 7, y: 0 })
    expect(unresolveTransportPixel(typed, 2)).toEqual({ x: 7, y: 1 })
  })

  it('does not reject a full mask for a column-major profile', () => {
    const all = Array.from({ length: 16 }, (_, index) => index)
    const bundle = mutableBundle()
    transportSection(bundle)['scanMode'] = 'COLUMN_MAJOR'
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: all }
    transportSection(bundle)['transportPixelCountPerCabinet'] = 16
    expect(validateHardwareProfile(bundle as unknown as HardwareProfileBundle).valid).toBe(true)
  })
})
