import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  validateProject, resolveMapping, resolveRemap, DomainError,
  type ValidateProjectInput, type RemapRuleDescriptor,
} from '../../src/index.js'
import * as mappingEngine from '../../src/mapping-engine/index.js'
import * as remapEngine from '../../src/remap-engine/index.js'
import * as hardwareEngine from '../../src/hardware-engine/index.js'
import { smallMapping } from '../mapping-engine/fixtures.js'
import { domainError, inputFailed, mappingFailed, projectFixture, remapFailed, setAt } from './fixtures.js'

afterEach(() => vi.restoreAllMocks())

const semanticCases = [
  { name: 'unknown InputCanvas reference', path: ['region', 'inputCanvas'], value: 'missing', code: 'MAPPING_UNKNOWN_REFERENCE' },
  { name: 'unknown Grid parent', path: ['grid', 'screen'], value: 'missing', code: 'MAPPING_UNKNOWN_REFERENCE' },
  { name: 'missing Screen membership', path: ['screen', 'mappingRegions'], value: [], code: 'MAPPING_INCOMPLETE' },
  { name: 'missing selected Grid membership', path: ['screen', 'cabinetGrids'], value: ['other'], code: 'MAPPING_UNKNOWN_REFERENCE' },
  { name: 'source bounds', path: ['region', 'inputRect', 'x'], value: 999, code: 'MAPPING_OUT_OF_RANGE' },
  { name: 'destination bounds', path: ['region', 'screenRect', 'x'], value: 999, code: 'MAPPING_OUT_OF_RANGE' },
  { name: 'unsafe arithmetic', path: ['grid', 'columns'], value: Number.MAX_SAFE_INTEGER, code: 'MAPPING_OVERFLOW' },
  { name: 'missing cell', path: ['grid', 'columns'], value: 2, code: 'MAPPING_INCOMPLETE' },
  { name: 'cell outside Grid', path: ['hardwareTopology', 'cabinets', 0, 'column'], value: 1, code: 'MAPPING_OUT_OF_RANGE' },
  { name: 'unknown cabinet Grid', path: ['hardwareTopology', 'cabinets', 0, 'grid'], value: 'missing', code: 'MAPPING_UNKNOWN_REFERENCE' },
  { name: 'unknown hardware reference', path: ['hardwareTopology', 'ports', 0, 'processor'], value: 'missing', code: 'HARDWARE_UNKNOWN_REFERENCE' },
  { name: 'missing processor order', path: ['hardwareTopology', 'processorOrder'], value: [], code: 'HARDWARE_INCOMPLETE' },
  { name: 'missing receiver order', path: ['hardwareTopology', 'receiverOrder'], value: [], code: 'HARDWARE_INCOMPLETE' },
  { name: 'missing Cabinet assignment', path: ['hardwareTopology', 'receivers', 0, 'cabinets'], value: [], code: 'HARDWARE_INCOMPLETE' },
  { name: 'Receiver pixel capacity', path: ['hardwareTopology', 'receivers', 0, 'pixelCapacity'], value: 5, code: 'HARDWARE_CAPACITY_EXCEEDED' },
  { name: 'Processor port capacity', path: ['hardwareTopology', 'ports', 0, 'index'], value: 1, code: 'HARDWARE_CAPACITY_EXCEEDED' },
  { name: 'missing module', path: ['hardwareTopology', 'modules'], value: [], code: 'HARDWARE_LAYOUT_MISMATCH' },
  { name: 'module geometry', path: ['hardwareTopology', 'modules', 0, 'width'], value: 999, code: 'HARDWARE_LAYOUT_MISMATCH' },
  { name: 'Cabinet transform', path: ['hardwareTopology', 'cabinets', 0, 'rotation'], value: 90, code: 'HARDWARE_UNSUPPORTED_TRANSFORM' },
]

function expectMappingFailure(input: ValidateProjectInput, code: string): void {
  const direct = domainError(() => resolveMapping(input.mapping))
  const mapping = vi.spyOn(mappingEngine, 'resolveMapping')
  const remap = vi.spyOn(remapEngine, 'resolveRemap')
  const allocator = vi.spyOn(hardwareEngine, 'allocateHardware')
  const result = validateProject(input)
  expect(direct.code).toBe(code)
  expect(result.valid).toBe(false)
  expect(result.checks).toEqual(mappingFailed)
  expect(result.diagnostics).toEqual([{
    severity: 'error', stage: 'mapping', code: direct.code, message: direct.message, path: ['mapping'],
  }])
  expect(mapping).toHaveBeenCalledExactlyOnceWith(input.mapping)
  expect(remap).not.toHaveBeenCalled()
  expect(allocator).not.toHaveBeenCalled()
}

describe('Project delegates Mapping and Hardware semantics', () => {
  it.each(semanticCases)('preserves $name code and full message', ({ path, value, code }) => {
    expectMappingFailure(setAt(projectFixture(), ['mapping', ...path], value), code)
  })

  it.each([NaN, Infinity, -Infinity, 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('delegates numeric semantics for %s', value => {
    expectMappingFailure(setAt(projectFixture(), ['mapping', 'inputCanvas', 'resolution', 'width'], value), 'MAPPING_INVALID_VALUE')
  })

  it('distinguishes duplicate CabinetId from physical cell collision', () => {
    const input: ValidateProjectInput = { mapping: smallMapping(2, 1, 1, 1, 2, 3), rules: [] }
    const topology = input.mapping.hardwareTopology
    const repeated = { ...input, mapping: { ...input.mapping, hardwareTopology: { ...topology, cabinets: [...topology.cabinets, topology.cabinets[0]!] } } }
    expectMappingFailure(repeated, 'HARDWARE_DUPLICATE')
    vi.restoreAllMocks()
    const collision = { ...input, mapping: { ...input.mapping, hardwareTopology: { ...topology, cabinets: topology.cabinets.map(c => ({ ...c, column: 0 })) } } }
    expectMappingFailure(collision, 'MAPPING_DUPLICATE')
  })

  it('preserves port capacity and parent mismatch errors without rebuilding topology', () => {
    const input = projectFixture()
    const topology = input.mapping.hardwareTopology
    const first = topology.receivers[0]!
    const second = { ...first, id: 'other' as typeof first.id, cabinets: [] }
    const exceeded = { ...topology, receivers: [first, second], receiverOrder: [{ port: first.port, receivers: [first.id, second.id] }] }
    expectMappingFailure({ ...input, mapping: { ...input.mapping, hardwareTopology: exceeded } }, 'HARDWARE_CAPACITY_EXCEEDED')
    vi.restoreAllMocks()
    const p = topology.processors[0]!
    const q = { ...p, id: 'Q' as typeof p.id }
    const mismatch = { ...topology, processors: [p, q], processorOrder: [p.id, q.id], receivers: [{ ...first, processor: q.id }] }
    expectMappingFailure({ ...input, mapping: { ...input.mapping, hardwareTopology: mismatch } }, 'HARDWARE_PARENT_MISMATCH')
  })

  it('preserves a Cabinet Engine error without a namespace prefix', () => {
    const input = setAt(projectFixture(), ['mapping', 'hardwareTopology', 'cabinets', 0, 'moduleColumns'], 3)
    const code = domainError(() => resolveMapping(input.mapping)).code
    expect(code).not.toMatch(/^(MAPPING|HARDWARE|REMAP|PROJECT)_/)
    expectMappingFailure(input, code)
  })
})

describe('Project Remap stage', () => {
  it.each([
    { name: 'empty descriptor', rules: [{}] },
    { name: 'unknown descriptor', rules: [{ id: 'r', type: 'unknown', version: '1' }] },
    { name: 'wrong fields', rules: [{ id: null, version: 7, type: [] }] },
    { name: 'primitive', rules: [1] },
    { name: 'null', rules: [null] },
    { name: 'undefined', rules: [undefined] },
    { name: 'sparse', rules: new Array(2) },
  ])('delegates nonempty $name rules', ({ rules }) => {
    const input = { ...projectFixture(), rules: rules as RemapRuleDescriptor[] }
    const direct = domainError(() => resolveRemap({ mapping: resolveMapping(input.mapping), rules: input.rules }))
    const result = validateProject(input)
    expect(result.valid).toBe(false)
    expect(result.checks).toEqual(remapFailed)
    expect(result.diagnostics).toEqual([{
      severity: 'error', stage: 'remap', code: 'REMAP_UNSUPPORTED_RULE', message: direct.message, path: ['rules'],
    }])
  })

  it('does not access rules elements or descriptor properties', () => {
    const getter = vi.fn(() => { throw new Error('Do not interpret rules') })
    const rules: RemapRuleDescriptor[] = []
    Object.defineProperty(rules, '0', { get: getter })
    expect(validateProject({ ...projectFixture(), rules }).diagnostics[0]!.code).toBe('REMAP_UNSUPPORTED_RULE')
    const descriptor = Object.defineProperty({}, 'id', { get: getter }) as RemapRuleDescriptor
    expect(validateProject({ ...projectFixture(), rules: [descriptor] }).diagnostics[0]!.code).toBe('REMAP_UNSUPPORTED_RULE')
    expect(getter).not.toHaveBeenCalled()
  })

  it('retains unknown source fields for upstream validation and uses root path for other Remap errors', () => {
    const base = projectFixture()
    const input = { ...base, mapping: { ...base.mapping, inputCanvas: { ...base.mapping.inputCanvas, extra: [] } } }
    const direct = domainError(() => resolveRemap({ mapping: resolveMapping(input.mapping), rules: [] }))
    expect(direct.code).toBe('REMAP_INVALID_VALUE')
    expect(validateProject(input)).toEqual({
      valid: false, checks: remapFailed,
      diagnostics: [{ severity: 'error', stage: 'remap', code: direct.code, message: direct.message, path: [] }],
    })
  })
})

describe('Project stage dependencies and unexpected exceptions', () => {
  it('blocks both engines on shape defects even with semantic and rule defects', () => {
    const input = projectFixture()
    setAt(input, ['rules'], [{}])
    setAt(input, ['mapping', 'region', 'inputRect', 'x'], 999)
    setAt(input, ['mapping', 'screen', 'name'], null)
    const mapping = vi.spyOn(mappingEngine, 'resolveMapping')
    const remap = vi.spyOn(remapEngine, 'resolveRemap')
    const result = validateProject(input)
    expect(result.checks).toEqual(inputFailed)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.path).toEqual(['mapping', 'screen', 'name'])
    expect(mapping).not.toHaveBeenCalled()
    expect(remap).not.toHaveBeenCalled()
  })

  it('returns only the first upstream semantic failure and blocks nonempty Remap rules', () => {
    const input = projectFixture()
    setAt(input, ['rules'], [{}])
    setAt(input, ['mapping', 'region', 'inputRect', 'x'], 999)
    setAt(input, ['mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity'], 1)
    expectMappingFailure(input, 'MAPPING_OUT_OF_RANGE')
  })

  it.each(['mapping', 'remap'] as const)('rethrows the exact unexpected exception from %s', stage => {
    const unexpected = new TypeError('implementation failure')
    if (stage === 'mapping') vi.spyOn(mappingEngine, 'resolveMapping').mockImplementation(() => { throw unexpected })
    else vi.spyOn(remapEngine, 'resolveRemap').mockImplementation(() => { throw unexpected })
    let caught: unknown
    try { validateProject(projectFixture()) } catch (error) { caught = error }
    expect(caught).toBe(unexpected)
  })

  it('does not classify a plain thrown object by a code-shaped property', () => {
    const unexpected = { code: 'MAPPING_INVALID_VALUE', message: 'not DomainError' }
    vi.spyOn(mappingEngine, 'resolveMapping').mockImplementation(() => { throw unexpected })
    let caught: unknown
    try { validateProject(projectFixture()) } catch (error) { caught = error }
    expect(caught).toBe(unexpected)
  })

  it('does not parse message text to manufacture entity paths', () => {
    const error = new DomainError('HARDWARE_CAPACITY_EXCEEDED', 'Receiver R01 / modules[2].pixelWidth: exact text')
    vi.spyOn(mappingEngine, 'resolveMapping').mockImplementation(() => { throw error })
    expect(validateProject(projectFixture()).diagnostics).toEqual([{
      stage: 'mapping', severity: 'error', code: error.code, message: error.message, path: ['mapping'],
    }])
  })
})
