import { describe, expect, it } from 'vitest'
import {
  resolveRemap, mapRemappedInputPixel, unmapRemappedHardwarePixel,
  resolveMapping, mapInputPixel, unmapHardwarePixel, DomainError,
  asInputCanvasId, asProcessorId, asPortId,
  type RemapRuleDescriptor, type ResolveRemapInput,
} from '../../src/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { smallMapping, referenceMapping, assertFrozen } from '../mapping-engine/fixtures.js'
import { resolvedReferenceMapping } from './fixtures.js'

const descriptor = { id: 'r1', version: '1.0.0', type: 'unknown-rule' }

function errorFrom(action: () => unknown): DomainError {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    return error as DomainError
  }
  throw new Error('Expected DomainError')
}

const nonEmptyRules: { name: string; rules: unknown[] }[] = [
  { name: 'unknown type', rules: [descriptor] },
  { name: 'multiple descriptors', rules: [descriptor, { ...descriptor, id: 'r2' }] },
  { name: 'missing descriptor fields', rules: [{}] },
  { name: 'invalid descriptor fields', rules: [{ id: null, version: 3, type: [] }] },
  { name: 'null element', rules: [null] },
  { name: 'undefined element', rules: [undefined] },
  { name: 'primitive element', rules: [42] },
  { name: 'sparse array', rules: new Array<unknown>(1) },
]

describe('Remap v1 input boundary and error order', () => {
  const mapping = resolvedReferenceMapping()

  it.each(nonEmptyRules)('rejects $name without descriptor validation', ({ rules }) => {
    const error = errorFrom(() => resolveRemap({ mapping, rules: rules as RemapRuleDescriptor[] }))
    expect(error.code).toBe('REMAP_UNSUPPORTED_RULE')
    expect(Object.isFrozen(rules)).toBe(false)
  })

  it('does not read elements of non-empty rules', () => {
    const rules: RemapRuleDescriptor[] = []
    Object.defineProperty(rules, '0', { get: () => { throw new Error('Descriptor must not be read') } })
    expect(errorFrom(() => resolveRemap({ mapping, rules })).code).toBe('REMAP_UNSUPPORTED_RULE')
  })

  it.each([
    { name: 'undefined', input: undefined },
    { name: 'null', input: null },
    { name: 'number', input: 1 },
    { name: 'array wrapper', input: [] },
    { name: 'missing mapping', input: { rules: [] } },
    { name: 'null mapping', input: { mapping: null, rules: [] } },
    { name: 'primitive mapping', input: { mapping: 1, rules: [] } },
    { name: 'array mapping', input: { mapping: Object.freeze([]), rules: [] } },
    { name: 'missing rules', input: { mapping } },
    { name: 'null rules', input: { mapping, rules: null } },
    { name: 'object rules', input: { mapping, rules: {} } },
    { name: 'string rules', input: { mapping, rules: '' } },
  ])('rejects $name with REMAP_INVALID_VALUE', ({ input }) => {
    expect(errorFrom(() => resolveRemap(input as ResolveRemapInput)).code).toBe('REMAP_INVALID_VALUE')
  })

  it.each([false, true])('rejects mutable mapping before rules, nonempty=%s', nonempty => {
    const mutable = { ...mapping }
    const input = { mapping: mutable, rules: nonempty ? [descriptor] : [] }
    expect(errorFrom(() => resolveRemap(input)).code).toBe('REMAP_INVALID_VALUE')
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(mutable)).toBe(false)
    expect(mutable).toEqual(mapping)
    expect(Object.isFrozen(input.rules)).toBe(false)
  })

  const shallowMappings = [
    { name: 'cells array', mapping: Object.freeze({ ...mapping, cells: [...mapping.cells] }) },
    { name: 'cell object', mapping: Object.freeze({ ...mapping, cells: Object.freeze(mapping.cells.map(c => ({ ...c }))) }) },
    { name: 'canvas resolution', mapping: Object.freeze({ ...mapping, inputCanvas: Object.freeze({ ...mapping.inputCanvas, resolution: { ...mapping.inputCanvas.resolution } }) }) },
    { name: 'hardware receiver spans', mapping: Object.freeze({ ...mapping, hardware: Object.freeze({ ...mapping.hardware, ports: Object.freeze(mapping.hardware.ports.map(p => Object.freeze({ ...p, receivers: [...p.receivers] }))) }) }) },
  ]

  it.each(shallowMappings)('rejects frozen mapping with mutable $name before nonempty rules', ({ mapping: shallow }) => {
    expect(errorFrom(() => resolveRemap({ mapping: shallow, rules: [descriptor] })).code).toBe('REMAP_INVALID_VALUE')
    expect(shallow).toEqual(mapping)
    expect(() => assertFrozen(shallow)).toThrow('Expected a deeply frozen value')
  })

  it('checks non-enumerable and symbol references for mutable aliases', () => {
    for (const key of ['hidden', Symbol('hidden')]) {
      const shallow = { ...mapping }
      Object.defineProperty(shallow, key, { value: [], enumerable: false })
      Object.freeze(shallow)
      expect(errorFrom(() => resolveRemap({ mapping: shallow, rules: [] })).code).toBe('REMAP_INVALID_VALUE')
    }
  })

  it('rejects accessors without invoking caller-owned behavior', () => {
    const shallow = { ...mapping }
    Object.defineProperty(shallow, 'cells', { get: () => { throw new Error('Getter must not be called') } })
    Object.freeze(shallow)
    expect(errorFrom(() => resolveRemap({ mapping: shallow, rules: [] })).code).toBe('REMAP_INVALID_VALUE')
  })

  it.each([new Map(), new Set(), new Date(), () => undefined])('rejects frozen state that is not immutable snapshot data: %s', state => {
    const shallow = Object.freeze({ ...mapping, state: Object.freeze(state) })
    expect(errorFrom(() => resolveRemap({ mapping: shallow, rules: [] })).code).toBe('REMAP_INVALID_VALUE')
  })
})

describe('Remap identity, ownership and determinism', () => {
  it('shares the validated snapshot even if wrapper getters return changing values', () => {
    const mapping = resolvedReferenceMapping()
    let mappingReads = 0
    let rulesReads = 0
    const input = {
      get mapping() { mappingReads += 1; return mappingReads === 1 ? mapping : { ...mapping } },
      get rules() { rulesReads += 1; return rulesReads === 1 ? [] : [descriptor] },
    }
    const remap = resolveRemap(input)
    expect(remap.source).toBe(mapping)
    expect(mappingReads).toBe(1)
    expect(rulesReads).toBe(1)
    expect(Object.isFrozen(input)).toBe(false)
    assertFrozen(remap)
  })

  it('accepts deeply frozen input and shares the accepted 7A snapshot', () => {
    const mapping = resolvedReferenceMapping()
    const input = deepFreeze({ mapping, rules: [] })
    const remap = resolveRemap(input)
    expect(remap.source).toBe(mapping)
    expect(remap.source.hardware).toBe(mapping.hardware)
    expect(remap.source.cells).toBe(mapping.cells)
    expect(remap.rules).toEqual([])
    expect(remap.rules).not.toBe(input.rules)
    assertFrozen(remap)
    const pixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 42, y: 43 } }
    const actual = mapRemappedInputPixel(remap, pixel)
    expect(actual).toEqual(mapInputPixel(mapping, pixel))
    assertFrozen(actual)
    const key = { processor: actual.address.hardware.processor, port: actual.address.hardware.port, dataIndex: actual.address.dataIndex }
    expect(unmapRemappedHardwarePixel(remap, key)).toEqual(actual)
    assertFrozen(unmapRemappedHardwarePixel(remap, key))
  })

  it('owns its empty rules and does not retain or freeze the mutable wrapper or array', () => {
    const mapping = resolvedReferenceMapping()
    const rules: RemapRuleDescriptor[] = []
    const input = { mapping, rules }
    const remap = resolveRemap(input)
    expect(input).toEqual({ mapping, rules: [] })
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(rules)).toBe(false)
    expect(remap.rules).not.toBe(rules)
    const pixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 42, y: 43 } }
    const before = mapRemappedInputPixel(remap, pixel)
    input.mapping = resolvedReferenceMapping(true)
    input.rules = [descriptor]
    rules.push(descriptor)
    expect(remap.source).toBe(mapping)
    expect(remap.rules).toEqual([])
    expect(mapRemappedInputPixel(remap, pixel)).toEqual(before)
    const key = { processor: before.address.hardware.processor, port: before.address.hardware.port, dataIndex: before.address.dataIndex }
    expect(unmapRemappedHardwarePixel(remap, key)).toEqual(before)
    assertFrozen(remap)
  })

  it('is deterministic for repeated calls and equivalent 7A snapshots', () => {
    const mapping = resolvedReferenceMapping()
    const first = resolveRemap({ mapping, rules: [] })
    const second = resolveRemap({ mapping, rules: [] })
    const equivalent = resolveRemap({ mapping: resolvedReferenceMapping(), rules: [] })
    expect(second).not.toBe(first)
    expect(second).toEqual(first)
    expect(equivalent).toEqual(first)
    const pixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 42, y: 43 } }
    expect(mapRemappedInputPixel(second, pixel)).toEqual(mapRemappedInputPixel(first, pixel))
    expect(mapRemappedInputPixel(equivalent, pixel)).toEqual(mapRemappedInputPixel(first, pixel))
  })

  it('keeps compact storage and delegates the last pixel at MAX_SAFE_INTEGER', () => {
    const base = smallMapping(1, 1, 1, 1, 1, 1)
    const width = Number.MAX_SAFE_INTEGER
    const mapping = resolveMapping({
      ...base, inputCanvas: { ...base.inputCanvas, resolution: { width, height: 1 } },
      screen: { ...base.screen, resolution: { width, height: 1 } },
      region: { ...base.region, position: { x: 0, y: 0 }, size: { width, height: 1 } },
      hardwareTopology: {
        ...base.hardwareTopology, cabinets: base.hardwareTopology.cabinets.map(c => ({ ...c, pixelWidth: width })),
        modules: base.hardwareTopology.modules.map(m => ({ ...m, pixelWidth: width })),
      },
    })
    const remap = resolveRemap({ mapping, rules: [] })
    expect(remap.source).toBe(mapping)
    expect(Object.keys(remap).sort()).toEqual(['rules', 'source'])
    expect(remap.rules).toHaveLength(0)
    expect(remap.source.cells).toHaveLength(1)
    const pixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: width - 1, y: 0 } }
    const actual = mapRemappedInputPixel(remap, pixel)
    expect(actual).toEqual(mapInputPixel(mapping, pixel))
    expect(actual.address.dataIndex).toBe(width - 1)
    const key = { processor: actual.address.hardware.processor, port: actual.address.hardware.port, dataIndex: width - 1 }
    expect(unmapRemappedHardwarePixel(remap, key)).toEqual(actual)
  })
})

describe('Remap preserves upstream lookup errors', () => {
  const mapping = resolveMapping(referenceMapping(true))
  const remap = resolveRemap({ mapping, rules: [] })

  it.each([
    { name: 'left of region', x: 99, y: 50, code: 'MAPPING_OUT_OF_RANGE' },
    { name: 'above region', x: 100, y: 49, code: 'MAPPING_OUT_OF_RANGE' },
    { name: 'right of region', x: 612, y: 50, code: 'MAPPING_OUT_OF_RANGE' },
    { name: 'below region', x: 100, y: 434, code: 'MAPPING_OUT_OF_RANGE' },
    { name: 'negative', x: -1, y: 50, code: 'MAPPING_INVALID_VALUE' },
    { name: 'fraction', x: 100.5, y: 50, code: 'MAPPING_INVALID_VALUE' },
    { name: 'NaN', x: NaN, y: 50, code: 'MAPPING_INVALID_VALUE' },
    { name: 'Infinity', x: Infinity, y: 50, code: 'MAPPING_INVALID_VALUE' },
  ])('preserves forward error for $name', ({ x, y, code }) => {
    const pixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y } }
    const actual = errorFrom(() => mapRemappedInputPixel(remap, pixel))
    const expected = errorFrom(() => mapInputPixel(mapping, pixel))
    expect(actual.code).toBe(code)
    expect(actual.message).toBe(expected.message)
  })

  it('preserves MAPPING_UNKNOWN_REFERENCE', () => {
    const pixel = { inputCanvas: asInputCanvasId('other'), inputCoordinate: { x: 100, y: 50 } }
    const actual = errorFrom(() => mapRemappedInputPixel(remap, pixel))
    expect(actual.code).toBe('MAPPING_UNKNOWN_REFERENCE')
    expect(actual.message).toBe(errorFrom(() => mapInputPixel(mapping, pixel)).message)
  })

  it.each([
    { processor: 'missing', port: 'P01:01', dataIndex: 0, code: 'HARDWARE_UNKNOWN_REFERENCE' },
    { processor: 'P01', port: 'missing', dataIndex: 0, code: 'HARDWARE_UNKNOWN_REFERENCE' },
    { processor: 'P01', port: 'P01:01', dataIndex: 131072, code: 'HARDWARE_OUT_OF_RANGE' },
    { processor: 'P01', port: 'P01:02', dataIndex: 65536, code: 'HARDWARE_OUT_OF_RANGE' },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(dataIndex => ({ processor: 'P01', port: 'P01:01', dataIndex, code: 'HARDWARE_INVALID_VALUE' })),
  ])('preserves reverse error for $processor/$port/$dataIndex', ({ processor, port, dataIndex, code }) => {
    const key = { processor: asProcessorId(processor), port: asPortId(port), dataIndex }
    const actual = errorFrom(() => unmapRemappedHardwarePixel(remap, key))
    expect(actual.code).toBe(code)
    expect(actual.message).toBe(errorFrom(() => unmapHardwarePixel(mapping, key)).message)
  })
})
