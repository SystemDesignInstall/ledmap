import { describe, expect, it } from 'vitest'
import {
  LEDMAP_GENERIC_REF001, addressPixel, createReceiver, resolveHardware, validateHardwareProfile,
  type HardwareProfileBundle,
} from '../../src/index.js'
import { referenceTopology } from '../hardware-engine/fixtures.js'
import { entry, mutableBundle, section, type MutableRecord } from './fixtures.js'

function codes(value: unknown): string[] {
  return validateHardwareProfile(value).checks.map(check => check.code)
}

function paths(value: unknown, code: string): unknown[][] {
  return validateHardwareProfile(value).checks.filter(check => check.code === code).map(check => [...check.path])
}

function withoutOptionalLimits(): MutableRecord {
  const bundle = mutableBundle()
  delete entry(bundle, 'portProfiles')['maxTransportPixels']
  delete entry(bundle, 'portProfiles')['maxReceivers']
  delete entry(bundle, 'receiverProfiles')['maxTransportPixels']
  delete entry(bundle, 'receiverProfiles')['maxCabinets']
  return bundle
}

describe('7E capacity and undeclared constraints', () => {
  it('accepts a bundle that omits every optional transport limit', () => {
    const bundle = withoutOptionalLimits()
    expect(validateHardwareProfile(bundle)).toEqual({ valid: true, checks: [] })
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([])
  })

  it('requires the declared maxPorts of a processor profile', () => {
    const bundle = mutableBundle()
    delete entry(bundle, 'processorProfiles')['maxPorts']
    expect(paths(bundle, 'PROFILE_FIELD_MISSING')).toEqual([['processorProfiles', 0, 'maxPorts']])
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([])
  })

  it('accepts zero as a declared finite limit and keeps it distinct from absence', () => {
    const bundle = mutableBundle()
    entry(bundle, 'portProfiles')['maxTransportPixels'] = 0
    entry(bundle, 'portProfiles')['maxReceivers'] = 0
    entry(bundle, 'receiverProfiles')['maxTransportPixels'] = 0
    entry(bundle, 'receiverProfiles')['maxCabinets'] = 0
    entry(bundle, 'processorProfiles')['maxPorts'] = 0
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([
      ['processorProfiles', 0, 'maxPorts'],
      ['portProfiles', 0, 'maxReceivers'],
    ])
    const undeclared = withoutOptionalLimits()
    expect(paths(undeclared, 'PROFILE_CAPACITY_INVALID')).toEqual([])
    expect(validateHardwareProfile(undeclared).valid).toBe(true)
  })

  it.each([
    ['negative', -1],
    ['fractional', 2.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a %s declared limit as PROFILE_CAPACITY_INVALID', (_name, value) => {
    for (const [key, array] of [
      ['maxPorts', 'processorProfiles'],
      ['maxTransportPixels', 'portProfiles'],
      ['maxReceivers', 'portProfiles'],
      ['maxTransportPixels', 'receiverProfiles'],
      ['maxCabinets', 'receiverProfiles'],
    ] as const) {
      const bundle = mutableBundle()
      entry(bundle, array)[key] = value
      expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([[array, 0, key]])
    }
  })

  it('reports a non-numeric declared limit as a field violation, not as a capacity violation', () => {
    const bundle = mutableBundle()
    entry(bundle, 'receiverProfiles')['maxCabinets'] = '4'
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
  })

  it('checks a declared port limit against the referenced port count', () => {
    const bundle = mutableBundle()
    entry(bundle, 'processorProfiles')['portProfileIds'] = ['ledmap.test.port', 'ledmap.test.port']
    entry(bundle, 'processorProfiles')['maxPorts'] = 2
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    entry(bundle, 'processorProfiles')['maxPorts'] = 1
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([['processorProfiles', 0, 'maxPorts']])
  })

  it('checks a declared receiver limit against the referenced receiver count', () => {
    const bundle = mutableBundle()
    entry(bundle, 'portProfiles')['receiverProfileIds'] = ['ledmap.test.receiver', 'ledmap.test.receiver']
    entry(bundle, 'portProfiles')['maxReceivers'] = 2
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    entry(bundle, 'portProfiles')['maxReceivers'] = 1
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([['portProfiles', 0, 'maxReceivers']])
  })

  it('skips a declared limit check when the referenced collection is structurally invalid', () => {
    const bundle = mutableBundle()
    entry(bundle, 'processorProfiles')['portProfileIds'] = 'ledmap.test.port'
    expect(codes(bundle)).toEqual(['PROFILE_FIELD_INVALID'])
    expect(paths(bundle, 'PROFILE_CAPACITY_INVALID')).toEqual([])
  })

  it('declares the reference capacities in transport pixels exactly as specified', () => {
    const receiver = LEDMAP_GENERIC_REF001.receiverProfiles[0]!
    const port = LEDMAP_GENERIC_REF001.portProfiles[0]!
    const processor = LEDMAP_GENERIC_REF001.processorProfiles[0]!
    expect(receiver.maxTransportPixels).toBe(65536)
    expect(receiver.maxCabinets).toBe(4)
    expect(port.maxTransportPixels).toBe(131072)
    expect(port.maxReceivers).toBe(2)
    expect(processor.maxPorts).toBe(4)
    expect(processor.portProfileIds).toHaveLength(4)
    expect(receiver.maxTransportPixels).toBe(4 * LEDMAP_GENERIC_REF001.pixelTransportProfile.transportPixelCountPerCabinet)
    expect(port.maxTransportPixels).toBe(2 * receiver.maxTransportPixels!)
  })

  it('keeps profile transport capacity separate from the 6B Receiver.pixelCapacity', () => {
    const topology = referenceTopology()
    const baseline = resolveHardware(topology)
    const withProfile = resolveHardware({ ...topology, profile: LEDMAP_GENERIC_REF001 } as unknown as typeof topology)
    expect(withProfile).toEqual(baseline)
    expect(baseline.pixelCount).toBe(196608)
    expect(topology.receivers.map(receiver => receiver.pixelCapacity)).toEqual([undefined, undefined, undefined])
    const capped = resolveHardware({
      ...topology,
      receivers: topology.receivers.map(receiver => createReceiver({
        id: receiver.id, index: receiver.index, processor: receiver.processor, port: receiver.port,
        cabinets: receiver.cabinets, pixelCapacity: 65536,
      })),
    })
    expect(capped.pixelCount).toBe(196608)
    expect(capped).toEqual(baseline)
    const address = addressPixel(baseline, { cabinet: topology.cabinets[0]!.id, coordinate: { x: 0, y: 0 } })
    expect(address.dataIndex).toBe(0)
    expect(Object.prototype.hasOwnProperty.call(LEDMAP_GENERIC_REF001.receiverProfiles[0]!, 'pixelCapacity')).toBe(false)
    expect(JSON.stringify(baseline)).not.toContain('maxTransportPixels')
    expect(JSON.stringify(baseline)).not.toContain('ledmap.generic.ref001')
  })

  it('never treats an omitted limit as an unlimited capacity claim', () => {
    const bundle = withoutOptionalLimits() as unknown as HardwareProfileBundle
    const declared = Object.prototype.hasOwnProperty.call(entry(bundle as unknown as MutableRecord, 'portProfiles'), 'maxTransportPixels')
    expect(declared).toBe(false)
    expect(validateHardwareProfile(bundle).valid).toBe(true)
    expect(validateHardwareProfile(bundle).checks.some(check => check.message.includes('unlimited'))).toBe(false)
  })

  it('keeps the bundle-level descriptive fields free of profile confidence semantics', () => {
    const bundle = mutableBundle()
    bundle['confidence'] = 0.5
    bundle['unbounded'] = true
    expect(paths(bundle, 'PROFILE_FIELD_INVALID')).toEqual([['confidence'], ['unbounded']])
  })

  it('preserves declared limits of a frozen reference profile as immutable data', () => {
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001)).toBe(true)
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001.receiverProfiles)).toBe(true)
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001.receiverProfiles[0])).toBe(true)
    expect(Object.isFrozen(section(LEDMAP_GENERIC_REF001 as unknown as MutableRecord, 'identity'))).toBe(true)
  })
})
