import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  validateProject, resolveMapping, createProcessor, createPort, createReceiver,
  type ValidateProjectInput,
} from '../../src/index.js'
import * as mappingEngine from '../../src/mapping-engine/index.js'
import * as remapEngine from '../../src/remap-engine/index.js'
import * as hardwareEngine from '../../src/hardware-engine/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { assertFrozen, referenceMapping, smallMapping } from '../mapping-engine/fixtures.js'
import { copy, passed, projectFixture, setAt } from './fixtures.js'

afterEach(() => vi.restoreAllMocks())

describe('Project validation acceptance', () => {
  it.each([false, true])('validates REF-001 offset=%s with the accepted pipeline only', offset => {
    const input = deepFreeze({ mapping: referenceMapping(offset), rules: [] })
    const mapping = vi.spyOn(mappingEngine, 'resolveMapping')
    const remap = vi.spyOn(remapEngine, 'resolveRemap')
    const hardware = vi.spyOn(hardwareEngine, 'resolveHardware')
    const allocator = vi.spyOn(hardwareEngine, 'allocateHardware')
    const forward = vi.spyOn(mappingEngine, 'mapInputPixel')
    const reverse = vi.spyOn(mappingEngine, 'unmapHardwarePixel')
    expect(validateProject(input)).toEqual({ valid: true, diagnostics: [], checks: passed })
    expect(mapping).toHaveBeenCalledExactlyOnceWith(input.mapping)
    expect(hardware).toHaveBeenCalledExactlyOnceWith(input.mapping.hardwareTopology)
    const snapshot = mapping.mock.results[0]!.value as ReturnType<typeof resolveMapping>
    expect(snapshot.hardware.pixelCount).toBe(196608)
    assertFrozen(snapshot)
    expect(remap).toHaveBeenCalledExactlyOnceWith({ mapping: snapshot, rules: input.rules })
    expect(remap.mock.calls[0]![0].mapping).toBe(snapshot)
    expect(allocator).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it('validates multiple processors while preserving their explicit order', () => {
    const base = smallMapping(2, 1, 1, 1, 2, 3)
    const topology = base.hardwareTopology
    const p = topology.processors[0]!
    const q = createProcessor({ id: 'Q', name: 'First in signal order', portCount: 1 })
    const port = createPort({ id: 'Q:0', processor: q.id, index: 0, receiverCapacity: 1 })
    const receiver = createReceiver({ id: 'RQ', processor: q.id, port: port.id, index: 99, cabinets: [topology.cabinets[1]!.id] })
    const input = { mapping: { ...base, hardwareTopology: {
      ...topology, processors: [p, q], processorOrder: [q.id, p.id], ports: [...topology.ports, port],
      receivers: [{ ...topology.receivers[0]!, cabinets: [topology.cabinets[0]!.id] }, receiver],
      receiverOrder: [...topology.receiverOrder, { port: port.id, receivers: [receiver.id] }],
    } }, rules: [] }
    const expected = resolveMapping(input.mapping)
    const before = copy(input)
    expect(validateProject(input)).toEqual({ valid: true, diagnostics: [], checks: passed })
    expect(input).toEqual(before)
    expect(resolveMapping(input.mapping)).toEqual(expected)
    expect(expected.hardware.ports.map(p => p.processor)).toEqual([q.id, p.id])
    expect(expected.hardware.ports.map(p => p.receivers[0]!.portBase)).toEqual([0, 0])
  })

  it('is deterministic under entity-array permutations without sorting explicit signal orders', () => {
    const mapping = referenceMapping()
    const t = mapping.hardwareTopology
    const input = { mapping: { ...mapping, hardwareTopology: {
      ...t, processors: [...t.processors].reverse(), ports: [...t.ports].reverse(),
      receivers: [...t.receivers].reverse(), cabinets: [...t.cabinets].reverse(), modules: [...t.modules].reverse(),
      receiverOrder: [...t.receiverOrder].reverse(),
    } }, rules: [] }
    const before = copy(input)
    expect(validateProject(input)).toEqual(validateProject({ mapping, rules: [] }))
    expect(validateProject(input)).toEqual(validateProject(input))
    expect(input).toEqual(before)
    expect(resolveMapping(input.mapping)).toEqual(resolveMapping(mapping))
  })

  it('does not add ordering compatibility or physical-origin semantics to valid', () => {
    const input = projectFixture()
    setAt(input, ['mapping', 'grid', 'ordering'], { numbering: 'row', direction: 'bottom-to-top', startCorner: 'bottom-right', snake: true })
    setAt(input, ['mapping', 'hardwareTopology', 'cabinets', 0, 'origin'], { x: -1, y: NaN })
    expect(validateProject(input)).toEqual({ valid: true, diagnostics: [], checks: passed })
  })

  it('does not trim names or normalize IDs', () => {
    const input = projectFixture()
    setAt(input, ['mapping', 'inputCanvas', 'id'], '  input  ')
    setAt(input, ['mapping', 'region', 'inputCanvas'], '  input  ')
    setAt(input, ['mapping', 'screen', 'name'], '')
    const before = copy(input)
    expect(validateProject(input).valid).toBe(true)
    expect(input).toEqual(before)
  })

  it('does not emit unused-capacity warnings or run allocation', () => {
    const input = projectFixture()
    setAt(input, ['mapping', 'hardwareTopology', 'processors', 0, 'portCount'], 4)
    setAt(input, ['mapping', 'hardwareTopology', 'ports', 0, 'receiverCapacity'], 4)
    setAt(input, ['mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity'], 100)
    const allocator = vi.spyOn(hardwareEngine, 'allocateHardware')
    expect(validateProject(input)).toEqual({ valid: true, diagnostics: [], checks: passed })
    expect(allocator).not.toHaveBeenCalled()
  })
})

describe('Project report ownership and compactness', () => {
  it.each(['valid', 'input', 'mapping', 'remap'] as const)('returns deeply immutable %s report without mutating input', stage => {
    const input = projectFixture()
    if (stage === 'input') setAt(input, ['mapping', 'region', 'inputRect'], null)
    if (stage === 'mapping') setAt(input, ['mapping', 'region', 'inputRect', 'x'], 999)
    if (stage === 'remap') setAt(input, ['rules'], [{}])
    const before = copy(input)
    const report = validateProject(input)
    const saved = copy(report)
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.mapping)).toBe(false)
    expect(Object.isFrozen(input.rules)).toBe(false)
    assertFrozen(report)
    expect(() => { (report.checks as unknown[]).push({}) }).toThrow(TypeError)
    expect(() => { Object.assign(report.checks[0]!, { status: 'changed' }) }).toThrow(TypeError)
    if (report.diagnostics.length > 0) {
      expect(() => { Object.assign(report.diagnostics[0]!, { message: 'changed' }) }).toThrow(TypeError)
      expect(() => { (report.diagnostics[0]!.path as unknown[]).push('changed') }).toThrow(TypeError)
    }
    setAt(input, ['mapping'], null)
    setAt(input, ['rules'], [1, 2, 3])
    expect(report).toEqual(saved)
    expect(Object.keys(report).sort()).toEqual(['checks', 'diagnostics', 'valid'])
    expect(validateProject(deepFreeze(before))).toEqual(report)
  })

  it('validates MAX_SAFE_INTEGER pixels without a pixel-sized report or pixel traversal', () => {
    const tiny = projectFixture()
    const width = Number.MAX_SAFE_INTEGER
    const input: ValidateProjectInput = { mapping: {
      ...tiny.mapping,
      inputCanvas: { ...tiny.mapping.inputCanvas, resolution: { width, height: 1 } },
      screen: { ...tiny.mapping.screen, resolution: { width, height: 1 } },
      region: {
        ...tiny.mapping.region,
        inputRect: { x: 0, y: 0, width, height: 1 },
        screenRect: { x: 0, y: 0, width, height: 1 },
      },
      hardwareTopology: {
        ...tiny.mapping.hardwareTopology,
        cabinets: tiny.mapping.hardwareTopology.cabinets.map(c => ({ ...c, pixelWidth: width, pixelHeight: 1 })),
        modules: tiny.mapping.hardwareTopology.modules.map(m => ({ ...m, pixelWidth: width, pixelHeight: 1 })),
      },
    }, rules: [] }
    const forward = vi.spyOn(mappingEngine, 'mapInputPixel')
    const reverse = vi.spyOn(mappingEngine, 'unmapHardwarePixel')
    expect(validateProject(input)).toEqual(validateProject(tiny))
    expect(validateProject(input).valid).toBe(true)
    expect(forward).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it('does not enumerate missing cells of a huge incomplete Grid', () => {
    const input = projectFixture()
    setAt(input, ['mapping', 'grid', 'columns'], 1000000000)
    const result = validateProject(input)
    expect(result.valid).toBe(false)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.code).toBe('MAPPING_INCOMPLETE')
    expect(result.checks).toHaveLength(3)
  })
})
