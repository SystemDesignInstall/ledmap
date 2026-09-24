import { describe, expect, it } from 'vitest'
import {
  resolveMapping, mapInputPixel, unmapHardwarePixel, asInputCanvasId, asCabinetGridId, asMappingRegionId,
  asPortId, asProcessorId, type ResolveMappingInput,
} from '../../src/index.js'
import { otherScreen, referenceMapping, smallMapping } from './fixtures.js'

type Change = (input: ResolveMappingInput) => ResolveMappingInput
const cases: readonly { name: string; code: string; change: Change }[] = [
  { name: 'unknown InputCanvas', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, region: { ...i.region, inputCanvas: asInputCanvasId('other') } }) },
  { name: 'unknown region Screen', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, region: { ...i.region, screen: otherScreen } }) },
  { name: 'unknown Grid Screen', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, grid: { ...i.grid, screen: otherScreen } }) },
  { name: 'unknown target Grid', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, region: { ...i.region, grid: asCabinetGridId('other') } }) },
  { name: 'foreign Cabinet Grid', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, hardwareTopology: { ...i.hardwareTopology, cabinets: i.hardwareTopology.cabinets.map(c => ({ ...c, grid: asCabinetGridId('other') })) } }) },
  { name: 'missing Screen region', code: 'INCOMPLETE', change: i => ({ ...i, screen: { ...i.screen, mappingRegions: [] } }) },
  { name: 'missing Screen grid', code: 'INCOMPLETE', change: i => ({ ...i, screen: { ...i.screen, cabinetGrids: [] } }) },
  { name: 'wrong Screen region', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, screen: { ...i.screen, mappingRegions: [asMappingRegionId('other')] } }) },
  { name: 'wrong Screen grid', code: 'UNKNOWN_REFERENCE', change: i => ({ ...i, screen: { ...i.screen, cabinetGrids: [asCabinetGridId('other')] } }) },
  { name: 'extra Screen region', code: 'UNSUPPORTED_PROFILE', change: i => ({ ...i, screen: { ...i.screen, mappingRegions: [...i.screen.mappingRegions, asMappingRegionId('other')] } }) },
  { name: 'extra Screen grid', code: 'UNSUPPORTED_PROFILE', change: i => ({ ...i, screen: { ...i.screen, cabinetGrids: [...i.screen.cabinetGrids, asCabinetGridId('other')] } }) },
  { name: 'two different Cabinets in one cell', code: 'DUPLICATE', change: i => ({ ...i, hardwareTopology: { ...i.hardwareTopology, cabinets: i.hardwareTopology.cabinets.map(c => ({ ...c, column: 0, row: 0 })) } }) },
  { name: 'column outside Grid', code: 'OUT_OF_RANGE', change: i => ({ ...i, hardwareTopology: { ...i.hardwareTopology, cabinets: i.hardwareTopology.cabinets.map(c => ({ ...c, column: i.grid.columns })) } }) },
  { name: 'row outside Grid', code: 'OUT_OF_RANGE', change: i => ({ ...i, hardwareTopology: { ...i.hardwareTopology, cabinets: i.hardwareTopology.cabinets.map(c => ({ ...c, row: i.grid.rows })) } }) },
  { name: 'source outside canvas right', code: 'OUT_OF_RANGE', change: i => ({ ...i, region: { ...i.region, position: { ...i.region.position, x: i.region.position.x + 1 } } }) },
  { name: 'source outside canvas bottom', code: 'OUT_OF_RANGE', change: i => ({ ...i, region: { ...i.region, position: { ...i.region.position, y: i.region.position.y + 1 } } }) },
  { name: 'region width mismatch', code: 'SIZE_MISMATCH', change: i => ({ ...i, region: { ...i.region, size: { ...i.region.size, width: i.region.size.width - 1 } } }) },
  { name: 'region height mismatch', code: 'SIZE_MISMATCH', change: i => ({ ...i, region: { ...i.region, size: { ...i.region.size, height: i.region.size.height - 1 } } }) },
  { name: 'Screen width mismatch', code: 'SIZE_MISMATCH', change: i => ({ ...i, screen: { ...i.screen, resolution: { ...i.screen.resolution, width: 1 } } }) },
  { name: 'Screen height mismatch', code: 'SIZE_MISMATCH', change: i => ({ ...i, screen: { ...i.screen, resolution: { ...i.screen.resolution, height: 1 } } }) },
  { name: 'Grid cell count overflow', code: 'OVERFLOW', change: i => ({ ...i, grid: { ...i.grid, columns: Number.MAX_SAFE_INTEGER, rows: 2 } }) },
  { name: 'Grid pixel width overflow', code: 'OVERFLOW', change: i => ({ ...i, grid: { ...i.grid, columns: Math.floor(Number.MAX_SAFE_INTEGER / 15) + 1, rows: 1 } }) },
  { name: 'Grid pixel height overflow', code: 'OVERFLOW', change: i => ({ ...i, grid: { ...i.grid, columns: 1, rows: Math.floor(Number.MAX_SAFE_INTEGER / 14) + 1 } }) },
  { name: 'Grid pixel count overflow', code: 'OVERFLOW', change: i => ({ ...i, grid: { ...i.grid, columns: Math.floor(Number.MAX_SAFE_INTEGER / 15), rows: 1 } }) },
  { name: 'source right sum overflow', code: 'OVERFLOW', change: i => ({ ...i, region: { ...i.region, position: { ...i.region.position, x: Number.MAX_SAFE_INTEGER } } }) },
  { name: 'source bottom sum overflow', code: 'OVERFLOW', change: i => ({ ...i, region: { ...i.region, position: { ...i.region.position, y: Number.MAX_SAFE_INTEGER } } }) },
]

describe('Mapping validation', () => {
  it.each(cases)('rejects $name', ({ change, code }) => {
    expect(() => resolveMapping(change(smallMapping()))).toThrowError(new RegExp(`MAPPING_${code}`))
  })

  it('rejects a missing physical cell even with complete hardware assignments', () => {
    const input = smallMapping()
    const removed = input.hardwareTopology.cabinets[0]!.id
    expect(() => resolveMapping({ ...input, hardwareTopology: {
      ...input.hardwareTopology, cabinets: input.hardwareTopology.cabinets.slice(1),
      modules: input.hardwareTopology.modules.filter(m => m.cabinet !== removed),
      receivers: input.hardwareTopology.receivers.map(r => ({ ...r, cabinets: r.cabinets.filter(id => id !== removed) })),
    } })).toThrowError(/MAPPING_INCOMPLETE/)
    expect(() => resolveMapping({ ...input, hardwareTopology: { processors: [], ports: [], receivers: [], cabinets: [], modules: [], processorOrder: [], receiverOrder: [] } }))
      .toThrowError(/MAPPING_INCOMPLETE/)
  })

  it('rejects heterogeneous pixel sizes that Hardware Engine can resolve', () => {
    const input = smallMapping()
    const first = input.hardwareTopology.cabinets[0]!.id
    expect(() => resolveMapping({ ...input, hardwareTopology: {
      ...input.hardwareTopology,
      cabinets: input.hardwareTopology.cabinets.map(c => c.id === first ? c : { ...c, pixelWidth: c.pixelWidth * 2 }),
      modules: input.hardwareTopology.modules.map(m => m.cabinet === first ? m : { ...m, pixelWidth: m.pixelWidth * 2 }),
    } })).toThrowError(/MAPPING_SIZE_MISMATCH/)
  })

  it('preserves HARDWARE_DUPLICATE for a repeated CabinetId', () => {
    const input = smallMapping()
    expect(() => resolveMapping({ ...input, hardwareTopology: { ...input.hardwareTopology, cabinets: [...input.hardwareTopology.cabinets, input.hardwareTopology.cabinets[0]!] } }))
      .toThrowError(/HARDWARE_DUPLICATE/)
  })

  it('propagates incomplete assignments, capacity, module geometry and unsupported transforms', () => {
    const input = smallMapping()
    for (const [hardwareTopology, code] of [
      [{ ...input.hardwareTopology, receivers: input.hardwareTopology.receivers.map(r => ({ ...r, cabinets: [] })) }, 'HARDWARE_INCOMPLETE'],
      [{ ...input.hardwareTopology, receivers: input.hardwareTopology.receivers.map(r => ({ ...r, pixelCapacity: 1 })) }, 'HARDWARE_CAPACITY_EXCEEDED'],
      [{ ...input.hardwareTopology, modules: input.hardwareTopology.modules.slice(1) }, 'HARDWARE_LAYOUT_MISMATCH'],
      [{ ...input.hardwareTopology, cabinets: input.hardwareTopology.cabinets.map(c => ({ ...c, rotation: 90 })) }, 'HARDWARE_UNSUPPORTED_TRANSFORM'],
    ] as const) {
      expect(() => resolveMapping({ ...input, hardwareTopology })).toThrowError(new RegExp(code))
    }
  })

  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid mapping dimensions %s', value => {
    const input = smallMapping()
    for (const field of ['width', 'height'] as const) {
      for (const change of [
        { inputCanvas: { ...input.inputCanvas, resolution: { ...input.inputCanvas.resolution, [field]: value } } },
        { screen: { ...input.screen, resolution: { ...input.screen.resolution, [field]: value } } },
        { region: { ...input.region, size: { ...input.region.size, [field]: value } } },
      ]) expect(() => resolveMapping({ ...input, ...change })).toThrowError(/MAPPING_INVALID_VALUE/)
    }
    for (const field of ['columns', 'rows'] as const) {
      expect(() => resolveMapping({ ...input, grid: { ...input.grid, [field]: value } })).toThrowError(/MAPPING_INVALID_VALUE/)
    }
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid coordinates and cell indices %s', value => {
    const input = smallMapping()
    const mapping = resolveMapping(input)
    for (const axis of ['x', 'y'] as const) {
      expect(() => resolveMapping({ ...input, region: { ...input.region, position: { ...input.region.position, [axis]: value } } })).toThrowError(/MAPPING_INVALID_VALUE/)
      expect(() => mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { ...input.region.position, [axis]: value } })).toThrowError(/MAPPING_INVALID_VALUE/)
    }
    for (const field of ['column', 'row'] as const) {
      expect(() => resolveMapping({ ...input, hardwareTopology: {
        ...input.hardwareTopology, cabinets: input.hardwareTopology.cabinets.map(c => ({ ...c, [field]: value })),
      } })).toThrowError(/MAPPING_INVALID_VALUE/)
    }
  })
})

describe('Mapping lookup bounds', () => {
  const mapping = resolveMapping(referenceMapping(true))

  it.each([[99, 50], [100, 49], [612, 433], [611, 434], [0, 0], [1920, 1080]])('rejects Input (%s,%s) without clamp or wrap', (x, y) => {
    expect(() => mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y } })).toThrowError(/MAPPING_OUT_OF_RANGE/)
  })

  it('accepts all four inclusive corner pixels and rejects another InputCanvas', () => {
    for (const [x, y] of [[100, 50], [611, 50], [100, 433], [611, 433]] as const) {
      expect(mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y } }).inputCoordinate).toEqual({ x, y })
    }
    expect(() => mapInputPixel(mapping, { inputCanvas: asInputCanvasId('other'), inputCoordinate: { x: 100, y: 50 } })).toThrowError(/MAPPING_UNKNOWN_REFERENCE/)
  })

  it.each([
    { processor: 'missing', port: 'P01:01', dataIndex: 0, code: 'UNKNOWN_REFERENCE' },
    { processor: 'P01', port: 'missing', dataIndex: 0, code: 'UNKNOWN_REFERENCE' },
    { processor: 'P01', port: 'P01:02', dataIndex: 65536, code: 'OUT_OF_RANGE' },
    { processor: 'P01', port: 'P01:03', dataIndex: 0, code: 'OUT_OF_RANGE' },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(dataIndex => ({ processor: 'P01', port: 'P01:01', dataIndex, code: 'INVALID_VALUE' })),
  ])('preserves hardware error for $processor/$port/$dataIndex', ({ processor, port, dataIndex, code }) => {
    expect(() => unmapHardwarePixel(mapping, { processor: asProcessorId(processor), port: asPortId(port), dataIndex }))
      .toThrowError(new RegExp(`HARDWARE_${code}`))
  })
})
