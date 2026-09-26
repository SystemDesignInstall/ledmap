import { describe, expect, it } from 'vitest'
import {
  LEDMAP_GENERIC_REF001, validateHardwareProfile,
  type HardwareProfileBundle, type HardwareProfileRef, type ProfileIdentity, type SplitLevel,
} from '../../src/index.js'
import { entry, mutableBundle, section, transportSection, type MutableRecord } from './fixtures.js'

const bundleIdentity: ProfileIdentity = { id: 'ledmap.test.ref', version: '1.0.0' }
const bundleRef: HardwareProfileRef = { profileId: bundleIdentity.id, profileVersion: bundleIdentity.version }
const splitLevel: SplitLevel = 'CABINET'

function codes(value: unknown): string[] {
  return validateHardwareProfile(value).checks.map(check => check.code)
}

function report(value: unknown) {
  return validateHardwareProfile(value)
}

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

const identityHolders: readonly { readonly name: string; readonly path: readonly (string | number)[]; readonly pick: (bundle: MutableRecord) => MutableRecord }[] = [
  { name: 'bundle', path: ['identity'], pick: bundle => section(bundle, 'identity') },
  { name: 'processor', path: ['processorProfiles', 0, 'identity'], pick: bundle => section(entry(bundle, 'processorProfiles'), 'identity') },
  { name: 'port', path: ['portProfiles', 0, 'identity'], pick: bundle => section(entry(bundle, 'portProfiles'), 'identity') },
  { name: 'receiver', path: ['receiverProfiles', 0, 'identity'], pick: bundle => section(entry(bundle, 'receiverProfiles'), 'identity') },
  { name: 'module', path: ['moduleProfiles', 0, 'identity'], pick: bundle => section(entry(bundle, 'moduleProfiles'), 'identity') },
  { name: 'addressing', path: ['addressingProfile', 'identity'], pick: bundle => section(section(bundle, 'addressingProfile'), 'identity') },
]

const identityHoldersForVersion = identityHolders.map(holder => ({
  ...holder,
  setVersion: (bundle: MutableRecord, version: string) => { holder.pick(bundle)['version'] = version },
}))

describe('7E identity contract', () => {
  it('exposes ProfileIdentity, HardwareProfileRef and a closed SplitLevel of CABINET', () => {
    expect(bundleIdentity).toEqual({ id: 'ledmap.test.ref', version: '1.0.0' })
    expect(bundleRef).toEqual({ profileId: 'ledmap.test.ref', profileVersion: '1.0.0' })
    expect(splitLevel).toBe('CABINET')
  })

  it('keeps PixelTransportProfile an embedded bundle configuration without independent identity', () => {
    expect(Object.prototype.hasOwnProperty.call(LEDMAP_GENERIC_REF001.pixelTransportProfile, 'identity')).toBe(false)
    const bundle: HardwareProfileBundle = {
      ...LEDMAP_GENERIC_REF001,
      pixelTransportProfile: { ...LEDMAP_GENERIC_REF001.pixelTransportProfile, identity: { id: 'x', version: '1.0.0' } } as HardwareProfileBundle['pixelTransportProfile'],
    }
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([['pixelTransportProfile', 'identity']])
  })

  it('accepts the identity of the bundle and of every identity-bearing constituent profile', () => {
    expect(validateHardwareProfile(LEDMAP_GENERIC_REF001)).toEqual({ valid: true, checks: [] })
    expect(LEDMAP_GENERIC_REF001.identity.id).toBe('ledmap.generic.ref001')
    expect(LEDMAP_GENERIC_REF001.processorProfiles[0]!.identity.id).toBe('ledmap.generic.ref001.processor')
    expect(LEDMAP_GENERIC_REF001.portProfiles[0]!.identity.id).toBe('ledmap.generic.ref001.port')
    expect(LEDMAP_GENERIC_REF001.receiverProfiles[0]!.identity.id).toBe('ledmap.generic.ref001.receiver')
    expect(LEDMAP_GENERIC_REF001.moduleProfiles[0]!.identity.id).toBe('ledmap.generic.ref001.module')
    expect(LEDMAP_GENERIC_REF001.addressingProfile.identity.id).toBe('ledmap.generic.ref001.addressing')
  })

  it.each(identityHolders)('reports a missing $name identity object as a shape violation', holder => {
    const bundle = mutableBundle()
    let target: MutableRecord = bundle
    for (const step of holder.path.slice(0, -1)) target = target[step as string] as MutableRecord
    delete target[holder.path[holder.path.length - 1] as string]
    expect(paths(bundle, 'PROFILE_SHAPE_INVALID')).toEqual([holder.path])
  })

  it('reports missing identity fields separately from wrong shapes', () => {
    const bundle = mutableBundle()
    delete section(bundle, 'identity')['version']
    delete section(entry(bundle, 'moduleProfiles'), 'identity')['id']
    expect(paths(bundle, 'PROFILE_FIELD_MISSING')).toEqual([['identity', 'version'], ['moduleProfiles', 0, 'identity', 'id']])
  })

  it('rejects a non-string identifier, an identifier with whitespace and an empty identifier', () => {
    for (const value of [1, 'ledmap test', '']) {
      const bundle = mutableBundle()
      section(bundle, 'identity')['id'] = value
      expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([['identity', 'id']])
    }
  })

  it('rejects a non-string version in the structural pass', () => {
    const bundle = mutableBundle()
    section(bundle, 'identity')['version'] = 1
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
  })

  it.each(identityHoldersForVersion)('reports a malformed $name version as the last check', holder => {
    const bundle = mutableBundle()
    if (holder.name !== 'bundle') section(bundle, 'identity')['version'] = 'bad'
    holder.setVersion(bundle, '1.0')
    const paths = holder.name === 'bundle'
      ? [['identity', 'version']]
      : [['identity', 'version'], [...holder.path, 'version']]
    const report = validateHardwareProfile(bundle)
    expect(report.checks).toEqual(paths.map(path => expect.objectContaining({ code: 'PROFILE_VERSION_INVALID', path })))
    expect(report.valid).toBe(false)
  })

  it('accepts a PATCH version and rejects leading-zero components', () => {
    const bundle = mutableBundle()
    section(bundle, 'identity')['version'] = '1.2.3'
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    section(bundle, 'identity')['version'] = '01.2.3'
    expect(codes(bundle)).toEqual(['PROFILE_VERSION_INVALID'])
  })

  it('rejects duplicate ids inside one profile array and a collision with the bundle id', () => {
    const bundle = mutableBundle()
    const modules = section(bundle, 'moduleProfiles') as unknown as unknown[]
    modules.push({ ...entry(bundle, 'moduleProfiles') })
    expect(paths(bundle, 'PROFILE_DUPLICATE_ID')).toEqual([['moduleProfiles', 1, 'identity', 'id']])
    const colliding = mutableBundle()
    section(entry(colliding, 'moduleProfiles'), 'identity')['id'] = 'ledmap.test.bundle'
    expect(paths(colliding, 'PROFILE_DUPLICATE_ID')).toEqual([['moduleProfiles', 0, 'identity', 'id']])
  })

  it('rejects a collision between the addressing profile id and the bundle id', () => {
    const bundle = mutableBundle()
    section(section(bundle, 'addressingProfile'), 'identity')['id'] = 'ledmap.test.bundle'
    expect(paths(bundle, 'PROFILE_DUPLICATE_ID')).toEqual([['addressingProfile', 'identity', 'id']])
  })

  it('keeps the collision, the unresolvable reference and the version check in the fixed phase order', () => {
    const bundle = mutableBundle()
    section(section(bundle, 'addressingProfile'), 'identity')['id'] = 'ledmap.test.bundle'
    section(section(bundle, 'addressingProfile'), 'identity')['version'] = 'bad'
    expect(report(bundle).checks).toEqual([
      expect.objectContaining({ code: 'PROFILE_DUPLICATE_ID', path: ['addressingProfile', 'identity', 'id'] }),
      expect.objectContaining({ code: 'PROFILE_REFERENCE_UNKNOWN', path: ['processorProfiles', 0, 'addressingProfileId'] }),
      expect.objectContaining({ code: 'PROFILE_VERSION_INVALID', path: ['addressingProfile', 'identity', 'version'] }),
    ])
  })

  it('reports every collision with the bundle id in one report', () => {
    const bundle = mutableBundle()
    for (const holder of identityHolders) {
      if (holder.name === 'bundle') continue
      holder.pick(bundle)['id'] = 'ledmap.test.bundle'
    }
    expect(paths(bundle, 'PROFILE_DUPLICATE_ID')).toEqual([
      ['processorProfiles', 0, 'identity', 'id'],
      ['portProfiles', 0, 'identity', 'id'],
      ['receiverProfiles', 0, 'identity', 'id'],
      ['moduleProfiles', 0, 'identity', 'id'],
      ['addressingProfile', 'identity', 'id'],
    ])
  })

  it('allows the same id in different profile arrays and resolves references array-locally', () => {
    const bundle = mutableBundle()
    const ports = section(bundle, 'portProfiles') as unknown as unknown[]
    ports.push({ ...entry(bundle, 'portProfiles'), identity: { id: 'ledmap.test.module', version: '1.0.0' } })
    expect(validateHardwareProfile(bundle).valid).toBe(true)
  })

  it('reports an unresolvable moduleProfileId', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['moduleProfileId'] = 'missing'
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([['pixelTransportProfile', 'moduleProfileId']])
  })

  it.each([
    ['processor addressingProfileId', (bundle: MutableRecord) => { entry(bundle, 'processorProfiles')['addressingProfileId'] = 'ledmap.test.other' }, ['processorProfiles', 0, 'addressingProfileId']],
    ['receiver portProfileId', (bundle: MutableRecord) => { entry(bundle, 'receiverProfiles')['portProfileId'] = 'missing' }, ['receiverProfiles', 0, 'portProfileId']],
    ['port receiverProfileIds', (bundle: MutableRecord) => { entry(bundle, 'portProfiles')['receiverProfileIds'] = ['missing'] }, ['portProfiles', 0, 'receiverProfileIds', 0]],
    ['processor portProfileIds', (bundle: MutableRecord) => { entry(bundle, 'processorProfiles')['portProfileIds'] = ['ledmap.test.port', 'missing'] }, ['processorProfiles', 0, 'portProfileIds', 1]],
  ])('reports an unresolvable %s reference', (_name, mutate, path) => {
    const bundle = mutableBundle()
    mutate(bundle)
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([path])
  })

  it('reports every unresolvable reference in one aggregate report', () => {
    const bundle = mutableBundle()
    transportSection(bundle)['moduleProfileId'] = 'missing'
    entry(bundle, 'receiverProfiles')['portProfileId'] = 'missing'
    entry(bundle, 'processorProfiles')['addressingProfileId'] = 'missing'
    expect(paths(bundle, 'PROFILE_REFERENCE_UNKNOWN')).toEqual([
      ['pixelTransportProfile', 'moduleProfileId'],
      ['processorProfiles', 0, 'addressingProfileId'],
      ['receiverProfiles', 0, 'portProfileId'],
    ])
  })

  it('rejects unknown fields in the bundle and in every profile object', () => {
    const bundle = mutableBundle()
    bundle['confidence'] = 'high'
    entry(bundle, 'processorProfiles')['priority'] = 1
    transportSection(bundle)['customLookup'] = 'vendor'
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([
      ['confidence'],
      ['pixelTransportProfile', 'customLookup'],
      ['processorProfiles', 0, 'priority'],
    ])
  })

  it.each([
    ['MODULE', 'PROFILE_SPLIT_LEVEL_UNSUPPORTED'],
    ['PIXEL_BLOCK', 'PROFILE_SPLIT_LEVEL_UNSUPPORTED'],
    ['CABINET', 'PROFILE_FIELD_INVALID'],
  ])('narrows splitLevel %s to %s', (declared, expected) => {
    const bundle = mutableBundle()
    bundle['splitLevel'] = declared
    expect(paths(bundle, expected)).toEqual([['splitLevel']])
    expect(codes(bundle)).toEqual([expected])
  })

  it('does not freeze or mutate caller-owned input', () => {
    const bundle = mutableBundle()
    const before = JSON.stringify(bundle)
    const report = validateHardwareProfile(bundle)
    expect(report.valid).toBe(true)
    expect(Object.isFrozen(bundle)).toBe(false)
    expect(Object.isFrozen(bundle['identity'])).toBe(false)
    expect(Object.isFrozen(transportSection(bundle))).toBe(false)
    expect(JSON.stringify(bundle)).toBe(before)
  })
})
