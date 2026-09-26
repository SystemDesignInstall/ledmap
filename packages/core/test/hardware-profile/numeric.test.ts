import { describe, expect, it } from 'vitest'
import { LEDMAP_GENERIC_REF001, validateHardwareProfile } from '../../src/index.js'
import { entry, mutableBundle, section, transportSection, type MutableRecord } from './fixtures.js'

function codes(value: unknown): string[] {
  return validateHardwareProfile(value).checks.map(check => check.code)
}

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

const outOfDomain = [0, -1, -32, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]

describe('7E numeric domains', () => {
  it.each([
    ['physicalWidth', (bundle: MutableRecord, value: number) => { entry(bundle, 'moduleProfiles')['physicalWidth'] = value }],
    ['physicalHeight', (bundle: MutableRecord, value: number) => { entry(bundle, 'moduleProfiles')['physicalHeight'] = value }],
    ['moduleCountX', (bundle: MutableRecord, value: number) => { entry(bundle, 'moduleProfiles')['moduleCountX'] = value }],
    ['moduleCountY', (bundle: MutableRecord, value: number) => { entry(bundle, 'moduleProfiles')['moduleCountY'] = value }],
    ['addressWidthBits', (bundle: MutableRecord, value: number) => { section(bundle, 'addressingProfile')['addressWidthBits'] = value }],
    ['transportPixelCountPerCabinet', (bundle: MutableRecord, value: number) => { transportSection(bundle)['transportPixelCountPerCabinet'] = value }],
  ])('rejects a %s outside the positive safe integer domain', (field, mutate) => {
    for (const value of outOfDomain) {
      const bundle = mutableBundle()
      mutate(bundle, value)
      const report = validateHardwareProfile(bundle)
      expect(report.valid).toBe(false)
      expect(report.checks.map(check => check.code)).toContain('PROFILE_FIELD_INVALID')
      expect(report.checks.some(check => check.path[check.path.length - 1] === field)).toBe(true)
    }
  })

  it('rejects a negative factor pair even when the derived product would be positive', () => {
    const bundle = mutableBundle()
    entry(bundle, 'moduleProfiles')['physicalWidth'] = -4
    entry(bundle, 'moduleProfiles')['physicalHeight'] = -2
    entry(bundle, 'moduleProfiles')['moduleCountX'] = -2
    entry(bundle, 'moduleProfiles')['moduleCountY'] = -1
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([
      ['moduleProfiles', 0, 'physicalWidth'],
      ['moduleProfiles', 0, 'physicalHeight'],
      ['moduleProfiles', 0, 'moduleCountX'],
      ['moduleProfiles', 0, 'moduleCountY'],
    ])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('rejects a derived cabinet geometry that leaves the safe integer range', () => {
    const bundle = mutableBundle()
    entry(bundle, 'moduleProfiles')['physicalWidth'] = 134217728
    entry(bundle, 'moduleProfiles')['physicalHeight'] = 134217728
    entry(bundle, 'moduleProfiles')['moduleCountX'] = 134217728
    entry(bundle, 'moduleProfiles')['moduleCountY'] = 134217728
    expect(codes(bundle)).toEqual(['PROFILE_TRANSPORT_INCONSISTENT'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([['pixelTransportProfile']])
  })

  it('rejects a declared transport count of zero because an empty transport set is unsupported', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['transportPixelCountPerCabinet'] = 0
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
  })

  it('rejects a mask whose width or height is outside the positive safe integer domain', () => {
    for (const value of outOfDomain) {
      const bundle = mutableBundle()
      transportSection(bundle)['activePixelMask'] = { width: value, height: 2, activePixels: [0] }
      expect(validateHardwareProfile(bundle).checks.map(check => check.code)).toContain('PROFILE_FIELD_INVALID')
      const heightBundle = mutableBundle()
      transportSection(heightBundle)['activePixelMask'] = { width: 2, height: value, activePixels: [0] }
      expect(validateHardwareProfile(heightBundle).checks.map(check => check.code)).toContain('PROFILE_FIELD_INVALID')
    }
  })

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['not a number', Number.NaN],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a %s activePixels entry', (_name, value) => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [value] }
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels', 0]])
  })

  it('rejects a non-numeric activePixels container', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: 16 }
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
  })

  it('rejects an out-of-range activePixels entry as a mask violation', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [0, 16] }
    expect(paths(bundle, 'PROFILE_MASK_INVALID')).toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels', 1]])
  })

  it.each([
    ['duplicate', [0, 1, 1]],
    ['descending', [0, 5, 3]],
    ['repeated zero', [0, 0]],
  ])('rejects a %s membership set that is not strictly increasing', (_name, activePixels) => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels }
    expect(codes(bundle)).toEqual(['PROFILE_MASK_INVALID'])
  })

  it('rejects an empty membership set as an unsupported empty transport set', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [] }
    expect(codes(bundle)).toEqual(['PROFILE_TRANSPORT_INCONSISTENT'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT'))
      .toEqual([['pixelTransportProfile', 'activePixelMask', 'activePixels']])
  })

  it('accepts a single active pixel as the minimal non-empty transport set', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [0] }
    transportSection(bundle)['transportPixelCountPerCabinet'] = 1
    expect(validateHardwareProfile(bundle)).toEqual({ valid: true, checks: [] })
  })

  it('keeps the reference profile inside every numeric domain', () => {
    expect(validateHardwareProfile(LEDMAP_GENERIC_REF001).valid).toBe(true)
    expect(LEDMAP_GENERIC_REF001.pixelTransportProfile.transportPixelCountPerCabinet).toBe(16384)
    expect(LEDMAP_GENERIC_REF001.addressingProfile.addressWidthBits).toBe(23)
    expect(Object.prototype.hasOwnProperty.call(LEDMAP_GENERIC_REF001.pixelTransportProfile, 'activePixelMask')).toBe(false)
  })
})
