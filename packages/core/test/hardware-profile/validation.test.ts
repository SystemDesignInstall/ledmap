import { describe, expect, it } from 'vitest'
import { LEDMAP_GENERIC_REF001, validateHardwareProfile, type HardwareProfileValidationCode } from '../../src/index.js'
import { entry, mutableBundle, section, transportSection, type MutableRecord } from './fixtures.js'

const closedCodes: readonly HardwareProfileValidationCode[] = [
  'PROFILE_SHAPE_INVALID',
  'PROFILE_FIELD_MISSING',
  'PROFILE_FIELD_INVALID',
  'PROFILE_VERSION_INVALID',
  'PROFILE_REFERENCE_UNKNOWN',
  'PROFILE_DUPLICATE_ID',
  'PROFILE_CAPACITY_INVALID',
  'PROFILE_SPLIT_LEVEL_UNSUPPORTED',
  'PROFILE_MASK_INVALID',
  'PROFILE_TRANSPORT_INCONSISTENT',
]

function report(value: unknown) {
  return validateHardwareProfile(value)
}

function codes(value: unknown): string[] {
  return report(value).checks.map(check => check.code)
}

function paths(value: unknown, code: string): unknown[][] {
  return report(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

describe('7E aggregate validation report', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['string', 'ledmap.generic.ref001'],
    ['number', 7],
    ['boolean', true],
    ['undefined', undefined],
  ])('reports a non-object %s root as a single shape violation', (_name, input) => {
    expect(report(input)).toEqual({
      valid: false,
      checks: [{ code: 'PROFILE_SHAPE_INVALID', path: [], message: 'expected a hardware profile bundle object' }],
    })
  })

  it('validates LEDMAP-GENERIC-REF001 and reports valid only for an empty check list', () => {
    expect(report(LEDMAP_GENERIC_REF001)).toEqual({ valid: true, checks: [] })
    expect(report(mutableBundle())).toEqual({ valid: true, checks: [] })
    expect(report({ ...LEDMAP_GENERIC_REF001, model: '' }).valid).toBe(false)
  })

  it('emits only codes of the closed v1 enum and never a non-error severity', () => {
    const bundle = mutableBundle()
    bundle['unknown'] = 1
    transportSection(bundle)['moduleProfileId'] = 'missing'
    entry(bundle, 'moduleProfiles')['physicalWidth'] = -4
    section(bundle, 'identity')['version'] = 'x'
    const produced = report(bundle)
    for (const check of produced.checks) {
      expect(closedCodes).toContain(check.code)
      expect(Object.keys(check).sort()).toEqual(['code', 'message', 'path'])
    }
  })

  it('orders checks as structural with numeric domains first, then references, transport and version', () => {
    const bundle = mutableBundle()
    bundle['unknownField'] = 1
    entry(bundle, 'moduleProfiles')['physicalWidth'] = 0
    transportSection(bundle)['moduleProfileId'] = 'missing'
    entry(bundle, 'processorProfiles')['maxPorts'] = -1
    section(bundle, 'identity')['version'] = '1'
    expect(codes(bundle)).toEqual([
      'PROFILE_FIELD_INVALID',
      'PROFILE_CAPACITY_INVALID',
      'PROFILE_FIELD_INVALID',
      'PROFILE_REFERENCE_UNKNOWN',
      'PROFILE_VERSION_INVALID',
    ])
  })

  it('orders declared capacity checks between referential integrity and transport invariants', () => {
    const bundle = mutableBundle()
    entry(bundle, 'receiverProfiles')['portProfileId'] = 'missing'
    entry(bundle, 'processorProfiles')['maxPorts'] = 0
    transportSection(bundle)['transportPixelCountPerCabinet'] = 99
    expect(codes(bundle)).toEqual([
      'PROFILE_REFERENCE_UNKNOWN',
      'PROFILE_CAPACITY_INVALID',
      'PROFILE_TRANSPORT_INCONSISTENT',
    ])
  })

  it('collects every independent structural violation in one report', () => {
    const bundle = mutableBundle()
    delete section(bundle, 'identity')['id']
    delete bundle['family']
    section(bundle, 'addressingProfile')['portAddressingMode'] = 'SERIAL'
    section(bundle, 'addressingProfile')['addressWidthBits'] = -1
    transportSection(bundle)['scanMode'] = 'DIAGONAL'
    expect(paths(bundle, 'PROFILE_FIELD_MISSING')).toEqual([['identity', 'id'], ['family']])
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([
      ['pixelTransportProfile', 'scanMode'],
      ['addressingProfile', 'portAddressingMode'],
      ['addressingProfile', 'addressWidthBits'],
    ])
  })

  it('is deterministic across repeated runs and free of input identity', () => {
    const bundle = mutableBundle()
    delete section(bundle, 'identity')['id']
    entry(bundle, 'processorProfiles')['addressingProfileId'] = 'missing'
    const first = JSON.stringify(report(bundle))
    const second = JSON.stringify(report(bundle))
    expect(second).toBe(first)
    const copy = JSON.parse(JSON.stringify(bundle)) as MutableRecord
    expect(JSON.stringify(report(copy))).toBe(first)
  })

  it('produces a deeply frozen report without freezing the input', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['moduleProfileId'] = 'missing'
    const result = report(bundle)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.checks)).toBe(true)
    expect(Object.isFrozen(result.checks[0])).toBe(true)
    expect(Object.isFrozen(result.checks[0]!.path)).toBe(true)
    expect(Object.isFrozen(bundle)).toBe(false)
    expect(Object.isFrozen(transportSection(bundle))).toBe(false)
    expect(() => { (result.checks as unknown as unknown[]).push({}) }).toThrow()
  })
})

describe('7E dependency and skip semantics', () => {
  it('skips the module reference check when moduleProfileId is structurally absent', () => {
    const bundle = mutableBundle()
    delete transportSection(bundle)['moduleProfileId']
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_MISSING'])
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([])
  })

  it('skips the module reference check when a module profile object is malformed', () => {
    const bundle = mutableBundle()
    ;(section(bundle, 'moduleProfiles') as unknown as unknown[])[0] = 'ledmap.test.module'
    expect(codes(bundle)).toEqual(['PROFILE_SHAPE_INVALID'])
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('skips dependent geometry, mask and transport checks when the module geometry is invalid', () => {
    const bundle = mutableBundle()
    entry(bundle, 'moduleProfiles')['physicalWidth'] = -4
    entry(bundle, 'moduleProfiles')['moduleCountX'] = -2
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID', 'PROFILE_FIELD_INVALID'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('skips the port reference checks when the port array holds a malformed entry', () => {
    const bundle = mutableBundle()
    ;(section(bundle, 'portProfiles') as unknown as unknown[])[0] = { identity: 7 }
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([])
    expect(codes(bundle)).toContain('PROFILE_SHAPE_INVALID')
  })

  it('skips the addressing reference check when the bundle addressing profile is malformed', () => {
    const bundle = mutableBundle()
    section(bundle, 'addressingProfile')['identity'] = 5
    expect(codes(bundle)).toEqual(['PROFILE_SHAPE_INVALID'])
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([])
  })

  it('skips the transport count check when the mask dimensions do not match the derived geometry', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 4, height: 2, activePixels: [0] }
    expect(codes(bundle)).toEqual(['PROFILE_MASK_INVALID'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('skips the transport count check when a mask entry is out of range', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [0, 99] }
    expect(codes(bundle)).toEqual(['PROFILE_MASK_INVALID'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('skips the transport count check when the declared count is invalid', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['transportPixelCountPerCabinet'] = 0
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT')).toEqual([])
  })

  it('runs the transport count check when the mask matches the derived geometry', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = { width: 8, height: 2, activePixels: [0, 1] }
    transportSection(bundle)['transportPixelCountPerCabinet'] = 99
    expect(paths(bundle, 'PROFILE_TRANSPORT_INCONSISTENT'))
      .toEqual([['pixelTransportProfile', 'transportPixelCountPerCabinet']])
  })

  it('reports a reference error for a resolvable collection even when other fields are invalid', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['moduleProfileId'] = 'missing'
    entry(bundle, 'moduleProfiles')['physicalWidth'] = 0
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID', 'PROFILE_REFERENCE_UNKNOWN'])
  })

  it('reports a non-object mask as a shape violation without cascade', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['activePixelMask'] = [0, 1, 2]
    expect(codes(bundle)).toEqual(['PROFILE_SHAPE_INVALID'])
  })

  it('reports a non-array profile collection as a field violation without cascade', () => {
    const bundle = mutableBundle()
    bundle['receiverProfiles'] = { '0': entry(bundle, 'receiverProfiles') }
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
  })
})
