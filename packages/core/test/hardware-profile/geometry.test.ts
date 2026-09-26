import { describe, expect, it } from 'vitest'
import { LEDMAP_GENERIC_REF001, resolveTransportPixel, validateHardwareProfile, type HardwareProfileBundle } from '../../src/index.js'
import { entry, mutableBundle, section, transportSection, type MutableRecord } from './fixtures.js'

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

function withExtraModule(): HardwareProfileBundle {
  return {
    ...LEDMAP_GENERIC_REF001,
    moduleProfiles: [
      { identity: { id: 'ledmap.generic.ref001.module.large', version: '1.0.0' }, physicalWidth: 64, physicalHeight: 64, moduleCountX: 2, moduleCountY: 2 },
      ...LEDMAP_GENERIC_REF001.moduleProfiles,
    ],
  }
}

describe('7E derived physical cabinet geometry', () => {
  it('derives 128x128 from the referenced module profile of REF-001', () => {
    expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, 0, 0)).toEqual({ active: true, transportIndex: 0 })
    expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, 127, 127)).toEqual({ active: true, transportIndex: 16383 })
    expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, 128, 0)).toEqual({ active: false, transportIndex: null })
    expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, 0, 128)).toEqual({ active: false, transportIndex: null })
  })

  it('uses exactly the module profile named by moduleProfileId and ignores the others', () => {
    const bundle = withExtraModule()
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    expect(resolveTransportPixel(bundle, 127, 127).transportIndex).toBe(16383)
    expect(resolveTransportPixel(bundle, 128, 0).active).toBe(false)
  })

  it('is insensitive to the order of the module profile array', () => {
    const bundle = withExtraModule()
    const reversed: HardwareProfileBundle = { ...bundle, moduleProfiles: [...bundle.moduleProfiles].reverse() }
    expect(validateHardwareProfile(reversed).valid).toBe(true)
    expect(resolveTransportPixel(reversed, 5, 7)).toEqual(resolveTransportPixel(bundle, 5, 7))
  })

  it('follows moduleProfileId when the referenced profile changes', () => {
    const bundle = mutableBundle()
    entry(bundle, 'moduleProfiles')['physicalWidth'] = 2
    entry(bundle, 'moduleProfiles')['physicalHeight'] = 2
    entry(bundle, 'moduleProfiles')['moduleCountX'] = 2
    entry(bundle, 'moduleProfiles')['moduleCountY'] = 2
    transportSection(bundle)['transportPixelCountPerCabinet'] = 16
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    const typed = bundle as unknown as HardwareProfileBundle
    expect(resolveTransportPixel(typed, 3, 3)).toEqual({ active: true, transportIndex: 15 })
    expect(resolveTransportPixel(typed, 4, 0).active).toBe(false)
  })

  it('reports an unresolvable moduleProfileId and skips every geometry dependent check', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['moduleProfileId'] = 'missing'
    transportSection(bundle)['transportPixelCountPerCabinet'] = 12345
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([['pixelTransportProfile', 'moduleProfileId']])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('rejects a module geometry whose product leaves the safe integer range', () => {
    const bundle = mutableBundle()
    entry(bundle, 'moduleProfiles')['physicalWidth'] = 134217728
    entry(bundle, 'moduleProfiles')['moduleCountX'] = 134217728
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([['pixelTransportProfile']])
  })

  it('never stores derived geometry in the profile', () => {
    const stored = JSON.stringify(LEDMAP_GENERIC_REF001)
    expect(stored).not.toContain('physicalCabinetWidth')
    expect(stored).not.toContain('physicalCabinetHeight')
    expect(section(LEDMAP_GENERIC_REF001 as unknown as MutableRecord, 'model')).toBe('ref001')
  })
})
