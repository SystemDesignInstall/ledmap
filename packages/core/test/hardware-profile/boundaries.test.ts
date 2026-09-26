import { describe, expect, it } from 'vitest'
import {
  LEDMAP_GENERIC_REF001, resolveTransportPixel, unresolveTransportPixel, validateHardwareProfile,
} from '../../src/index.js'
import { entry, mutableBundle, section, transportSection } from './fixtures.js'

function codes(value: unknown): string[] {
  return validateHardwareProfile(value).checks.map(check => check.code)
}

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

describe('7E validation boundaries', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'ledmap'],
    ['a number', 7],
    ['a boolean', true],
    ['an array', []],
  ])('reports %s as a shape violation without throwing', (_name, value) => {
    const report = validateHardwareProfile(value)
    expect(report.valid).toBe(false)
    expect(report.checks.map(check => check.code)).toEqual(['PROFILE_SHAPE_INVALID'])
    expect(report.checks[0]!.path).toEqual([])
  })

  it('reports an array profile collection and a null element without cascading', () => {
    expect(codes({ ...mutableBundle(), receiverProfiles: {} })).toEqual(['PROFILE_FIELD_INVALID'])
    const bundle = mutableBundle()
    const receivers = section(bundle, 'receiverProfiles') as unknown as unknown[]
    receivers.push(null)
    expect(paths(bundle, 'PROFILE_SHAPE_INVALID')).toEqual([['receiverProfiles', 1]])
    expect(paths(bundle, 'PROFILE_FIELD_MISSING')).toEqual([])
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('produces a byte-identical report for two independently constructed equal bundles', () => {
    const first = validateHardwareProfile(mutableBundle())
    const second = validateHardwareProfile(mutableBundle())
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    const failing = mutableBundle()
    entry(failing, 'moduleProfiles')['physicalWidth'] = 0
    section(failing, 'identity')['version'] = 'bad'
    transportSection(failing)['moduleProfileId'] = 'missing'
    expect(JSON.stringify(validateHardwareProfile(failing))).toBe(JSON.stringify(validateHardwareProfile(failing)))
  })

  it('orders unknown fields deterministically regardless of insertion order', () => {
    const first = mutableBundle()
    first['zeta'] = 1
    first['alpha'] = 2
    first['Beta'] = 3
    const second = mutableBundle()
    second['Beta'] = 3
    second['alpha'] = 2
    second['zeta'] = 1
    expect(paths(first, 'PROFILE_FIELD_INVALID')).toEqual(paths(second, 'PROFILE_FIELD_INVALID'))
    expect(paths(first, 'PROFILE_FIELD_INVALID')).toEqual([['Beta'], ['alpha'], ['zeta']])
  })

  it('returns a deeply frozen report', () => {
    const report = validateHardwareProfile(mutableBundle())
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.checks)).toBe(true)
    const failing = mutableBundle()
    section(failing, 'identity')['version'] = 'bad'
    const invalid = validateHardwareProfile(failing)
    expect(Object.isFrozen(invalid)).toBe(true)
    expect(Object.isFrozen(invalid.checks)).toBe(true)
    expect(Object.isFrozen(invalid.checks[0])).toBe(true)
    expect(Object.isFrozen(invalid.checks[0]!.path)).toBe(true)
  })

  it('rejects prototype polluting keys as unknown fields', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const bundle = mutableBundle()
      Object.defineProperty(bundle, key, { value: 'polluted', enumerable: true, writable: true, configurable: true })
      expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toContainEqual([key])
      expect(Object.prototype.hasOwnProperty.call(bundle, key)).toBe(true)
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
    }
  })

  it('enforces immutability of the frozen reference profile', () => {
    expect(() => { (LEDMAP_GENERIC_REF001.identity as { id: string }).id = 'ledmap.evil' }).toThrow(TypeError)
    expect(() => { (LEDMAP_GENERIC_REF001.moduleProfiles as unknown[]).push({}) }).toThrow(TypeError)
    expect(LEDMAP_GENERIC_REF001.identity.id).toBe('ledmap.generic.ref001')
    expect(LEDMAP_GENERIC_REF001.moduleProfiles).toHaveLength(1)
  })

  it('accepts the minimal valid bundle that omits every optional limit', () => {
    const bundle = mutableBundle()
    delete entry(bundle, 'portProfiles')['maxTransportPixels']
    delete entry(bundle, 'portProfiles')['maxReceivers']
    delete entry(bundle, 'receiverProfiles')['maxTransportPixels']
    delete entry(bundle, 'receiverProfiles')['maxCabinets']
    expect(validateHardwareProfile(bundle)).toEqual({ valid: true, checks: [] })
  })

  it.each([
    ['0.0.0', true],
    ['10.20.30', true],
    ['1.0.0-rc1', false],
    ['1.0', false],
    ['1.0.0.0', false],
    ['1.0.0 ', false],
  ])('applies the semver boundary to version %s', (version, valid) => {
    const bundle = mutableBundle()
    section(bundle, 'identity')['version'] = version
    if (valid) {
      expect(validateHardwareProfile(bundle).valid).toBe(true)
    } else {
      expect(codes(bundle)).toEqual(['PROFILE_VERSION_INVALID'])
    }
  })

  it('keeps the transport API usable on a deeply frozen reference profile', () => {
    expect(resolveTransportPixel(LEDMAP_GENERIC_REF001, 64, 64)).toEqual({ active: true, transportIndex: 8256 })
    expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, 8256)).toEqual({ x: 64, y: 64 })
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001)).toBe(true)
  })

  it('never throws for a profile that failed validation and is used only for shapes', () => {
    const bundle = mutableBundle()
    delete bundle['pixelTransportProfile']
    section(bundle, 'moduleProfiles')['identity'] = 'broken'
    expect(validateHardwareProfile(bundle).valid).toBe(false)
    expect(() => validateHardwareProfile(bundle)).not.toThrow()
  })
})
