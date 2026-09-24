import { describe, expect, it } from 'vitest'
import {
  resolveMapping, mapInputPixel, unmapHardwarePixel, addressPixel, globalRemapIndex,
  asCabinetId, asModuleId, createProcessor, createPort, createReceiver,
  type GridOrdering, type ResolveMappingInput,
} from '../../src/index.js'
import { cabinetFixture, deepFreeze } from '../hardware-engine/fixtures.js'
import { assertFrozen, smallMapping, referenceMapping } from './fixtures.js'

type Mutable<T> = T extends string ? T : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

function mutable<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>
}

function arrayLengths(value: unknown): number[] {
  if (value === null || typeof value !== 'object') return []
  return [...(Array.isArray(value) ? [value.length] : []), ...Object.values(value).flatMap(arrayLengths)]
}

describe('Mapping geometry and hardware integration', () => {
  it.each([{ columns: 1, rows: 1 }, { columns: 1, rows: 3 }, { columns: 3, rows: 1 }, { columns: 2, rows: 2 }])(
    'maps a $columns x $rows Grid of rectangular Cabinets and Modules using pixel geometry', ({ columns, rows }) => {
      const input = smallMapping(columns, rows)
      const topology = input.hardwareTopology
      const mapping = resolveMapping({ ...input,
        grid: { ...input.grid, cabinetWidth: 30, cabinetHeight: 42 },
        hardwareTopology: {
          ...topology,
          cabinets: topology.cabinets.map(c => ({ ...c, width: c.width * 2, height: c.height * 3, origin: { x: 900, y: 800 } })),
          modules: topology.modules.map(m => ({ ...m, width: m.width * 2, height: m.height * 3, localX: m.localX * 2, localY: m.localY * 3 })),
        },
      })
      expect(mapping.gridPixelSize).toEqual({ width: columns * 15, height: rows * 14 })
      for (let y = 0; y < rows * 14; y += 1) {
        for (let x = 0; x < columns * 15; x += 1) {
          const cell = Math.floor(y / 14) * columns + Math.floor(x / 15)
          const cx = x % 15, cy = y % 14
          const module = Math.floor(cy / 7) * 3 + Math.floor(cx / 5)
          const actual = mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { x: x + 10, y: y + 20 } })
          expect(actual).toEqual({
            inputCoordinate: { x: x + 10, y: y + 20 }, screenCoordinate: { x, y },
            cabinet: `C${cell}`, cabinetCoordinate: { x: cx, y: cy },
            module: `C${cell}/M${String(module + 1).padStart(2, '0')}`, moduleCoordinate: { x: cx % 5, y: cy % 7 },
            address: {
              hardware: { processor: 'P', port: 'P:0', receiver: 'R' }, cabinet: `C${cell}`,
              module: `C${cell}/M${String(module + 1).padStart(2, '0')}`, coordinate: { x: cx % 5, y: cy % 7 },
              dataIndex: cell * 210 + module * 35 + (cy % 7) * 5 + cx % 5,
            },
          })
          expect(unmapHardwarePixel(mapping, { processor: actual.address.hardware.processor, port: actual.address.hardware.port, dataIndex: actual.address.dataIndex })).toEqual(actual)
        }
      }
    },
  )

  it('allows different Module grids with equal Cabinet pixel sizes', () => {
    const input = smallMapping(2, 1)
    const part = cabinetFixture('C1', 1, 1, 15, 14, 1, 0)
    const topology = input.hardwareTopology
    const mapping = resolveMapping({ ...input, hardwareTopology: {
      ...topology, cabinets: [topology.cabinets[0]!, part.cabinet],
      modules: [...topology.modules.filter(m => m.cabinet !== part.cabinet.id), ...part.modules],
    } })
    const first = mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { x: 24, y: 33 } })
    const second = mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { x: 39, y: 33 } })
    expect(first.module).toBe('C0/M06')
    expect(first.moduleCoordinate).toEqual({ x: 4, y: 6 })
    expect(second.module).toBe('C1/M01')
    expect(second.moduleCoordinate).toEqual({ x: 14, y: 13 })
    expect(second.address.dataIndex).toBe(419)
  })

  const orders: readonly GridOrdering[] = [false, true].flatMap(snake => [
    { numbering: 'row', direction: 'left-to-right', snake, startCorner: 'top-left' },
    { numbering: 'row', direction: 'right-to-left', snake, startCorner: 'top-left' },
    { numbering: 'column', direction: 'top-to-bottom', snake, startCorner: 'top-left' },
    { numbering: 'column', direction: 'bottom-to-top', snake, startCorner: 'top-left' },
  ] as const)

  it.each(orders)('ignores $numbering/$direction/Snake=$snake when topology is fixed', ordering => {
    const input = smallMapping()
    const original = resolveMapping(input)
    const mapping = resolveMapping({ ...input, grid: { ...input.grid, ordering } })
    expect(mapping.hardware).toEqual(original.hardware)
    for (let y = 20; y < 48; y += 1) {
      for (let x = 10; x < 40; x += 1) {
        const pixel = { inputCanvas: input.inputCanvas.id, inputCoordinate: { x, y } }
        expect(mapInputPixel(mapping, pixel)).toEqual(mapInputPixel(original, pixel))
      }
    }
  })

  it('uses physical cell coordinates despite array permutations and arbitrary Cabinet labels', () => {
    const input = smallMapping()
    const topology = input.hardwareTopology
    const labels = ['Z-last', 'A-first', 'not-an-index', '0']
    const ids = new Map(topology.cabinets.map((c, index) => [c.id, asCabinetId(labels[index]!)]))
    const renamed = {
      ...topology, cabinets: topology.cabinets.map(c => ({ ...c, id: ids.get(c.id)! })).reverse(),
      modules: topology.modules.map(m => ({ ...m, cabinet: ids.get(m.cabinet)! })).reverse(),
      receivers: topology.receivers.map(r => ({ ...r, cabinets: r.cabinets.map(id => ids.get(id)!) })).reverse(),
    }
    const mapping = resolveMapping({ ...input, hardwareTopology: renamed })
    for (const [index, label] of labels.entries()) {
      const actual = mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { x: 10 + (index % 2) * 15, y: 20 + Math.floor(index / 2) * 14 } })
      expect(actual.cabinet).toBe(label)
      expect(actual.address.dataIndex).toBe(index * 210)
    }
    const reference = referenceMapping()
    const r = reference.hardwareTopology
    expect(resolveMapping({ ...reference, hardwareTopology: {
      ...r, processors: [...r.processors].reverse(), ports: [...r.ports].reverse(), receivers: [...r.receivers].reverse(),
      cabinets: [...r.cabinets].reverse(), modules: [...r.modules].reverse(), receiverOrder: [...r.receiverOrder].reverse(),
    } })).toEqual(resolveMapping(reference))
  })

  it('changes only hardware address when explicit Cabinet signal order changes', () => {
    const input = smallMapping()
    const first = resolveMapping(input)
    const second = resolveMapping({ ...input, hardwareTopology: {
      ...input.hardwareTopology, receivers: input.hardwareTopology.receivers.map(r => ({ ...r, cabinets: [...r.cabinets].reverse() })),
    } })
    const pixel = { inputCanvas: input.inputCanvas.id, inputCoordinate: { x: 10, y: 20 } }
    const before = mapInputPixel(first, pixel)
    const after = mapInputPixel(second, pixel)
    expect(after).toEqual({ ...before, address: { ...before.address, dataIndex: 630 } })
    expect(after.address).toEqual(addressPixel(second.hardware, { cabinet: after.cabinet, coordinate: after.cabinetCoordinate }))
  })

  it('distinguishes identical Port-local indices on different processors in both directions', () => {
    const input = smallMapping(2, 1)
    const p = input.hardwareTopology.processors[0]!
    const q = createProcessor({ id: 'Q', name: 'First in order', portCount: 1 })
    const port = createPort({ id: 'Q:0', processor: q.id, index: 0, receiverCapacity: 1 })
    const secondCabinet = input.hardwareTopology.cabinets[1]!.id
    const receiver = createReceiver({ id: 'RQ', processor: q.id, port: port.id, index: 99, cabinets: [secondCabinet] })
    const mapping = resolveMapping({ ...input, hardwareTopology: {
      ...input.hardwareTopology, processors: [p, q], processorOrder: [q.id, p.id], ports: [...input.hardwareTopology.ports, port],
      receivers: [{ ...input.hardwareTopology.receivers[0]!, cabinets: [input.hardwareTopology.cabinets[0]!.id] }, receiver],
      receiverOrder: [...input.hardwareTopology.receiverOrder, { port: port.id, receivers: [receiver.id] }],
    } })
    for (const [x, processor, portId, global] of [[10, p.id, input.hardwareTopology.ports[0]!.id, 210], [25, q.id, port.id, 0]] as const) {
      const key = { processor, port: portId, dataIndex: 0 }
      const actual = mapInputPixel(mapping, { inputCanvas: input.inputCanvas.id, inputCoordinate: { x, y: 20 } })
      expect(actual.address.hardware.processor).toBe(processor)
      expect(actual.address.dataIndex).toBe(0)
      expect(unmapHardwarePixel(mapping, key)).toEqual(actual)
      expect(globalRemapIndex(mapping.hardware, key)).toBe(global)
    }
    expect(() => unmapHardwarePixel(mapping, { processor: p.id, port: port.id, dataIndex: 0 })).toThrowError(/HARDWARE_UNKNOWN_REFERENCE/)
  })
})

describe('Mapping immutable compact snapshot', () => {
  it('resolves deeply frozen inputs deterministically and freezes all outputs', () => {
    const input = deepFreeze(smallMapping())
    const first = resolveMapping(input)
    const second = resolveMapping(input)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    assertFrozen(first)
    assertFrozen(second)
    const query = deepFreeze({ inputCanvas: input.inputCanvas.id, inputCoordinate: { x: 10, y: 20 } })
    const mapped = mapInputPixel(first, query)
    expect(mapInputPixel(first, query)).toEqual(mapped)
    expect(mapped.inputCoordinate).not.toBe(query.inputCoordinate)
    assertFrozen(mapped)
    assertFrozen(unmapHardwarePixel(first, { processor: mapped.address.hardware.processor, port: mapped.address.hardware.port, dataIndex: mapped.address.dataIndex }))
    expect(mapped).not.toHaveProperty('globalRemapIndex')
  })

  it('does not freeze or retain mutable input at any model or hardware layer', () => {
    const input = mutable(smallMapping())
    const expected = resolveMapping(smallMapping())
    const actual = resolveMapping(input)
    input.inputCanvas.resolution.width = 999
    input.screen.resolution.height = 999
    input.screen.cabinetGrids.length = 0
    input.screen.mappingRegions.length = 0
    input.grid.ordering.snake = true
    input.grid.columns = 99
    input.region.position.x = 999
    input.region.size.width = 999
    input.hardwareTopology.cabinets[0]!.column = 99
    input.hardwareTopology.cabinets[0]!.origin.x = 999
    input.hardwareTopology.modules[0]!.id = asModuleId('changed')
    input.hardwareTopology.modules[0]!.pixelWidth = 999
    input.hardwareTopology.receivers[0]!.cabinets.length = 0
    input.hardwareTopology.receivers[0]!.index = 99
    input.hardwareTopology.ports[0]!.index = 99
    input.hardwareTopology.processors[0]!.portCount = 99
    input.hardwareTopology.processorOrder.length = 0
    input.hardwareTopology.receiverOrder[0]!.receivers.length = 0
    expect(actual).toEqual(expected)
    expect(mapInputPixel(actual, { inputCanvas: actual.inputCanvas.id, inputCoordinate: { x: 10, y: 20 } }).address.dataIndex).toBe(0)
  })

  it('keeps the same collection sizes for one pixel and MAX_SAFE_INTEGER pixels', () => {
    const tiny = resolveMapping(smallMapping(1, 1, 1, 1, 1, 1))
    const base = smallMapping(1, 1, 1, 1, 1, 1)
    const width = Number.MAX_SAFE_INTEGER
    const input: ResolveMappingInput = {
      ...base, inputCanvas: { ...base.inputCanvas, resolution: { width, height: 1 } },
      screen: { ...base.screen, resolution: { width, height: 1 } },
      region: { ...base.region, position: { x: 0, y: 0 }, size: { width, height: 1 } },
      hardwareTopology: {
        ...base.hardwareTopology, cabinets: base.hardwareTopology.cabinets.map(c => ({ ...c, pixelWidth: width })),
        modules: base.hardwareTopology.modules.map(m => ({ ...m, pixelWidth: width })),
      },
    }
    const large = resolveMapping(input)
    expect(large.cells).toHaveLength(1)
    expect(large.hardware.pixelCount).toBe(width)
    expect(arrayLengths(large)).toEqual(arrayLengths(tiny))
    const pixel = mapInputPixel(large, { inputCanvas: large.inputCanvas.id, inputCoordinate: { x: width - 1, y: 0 } })
    expect(pixel.address.dataIndex).toBe(width - 1)
    expect(unmapHardwarePixel(large, { processor: pixel.address.hardware.processor, port: pixel.address.hardware.port, dataIndex: width - 1 })).toEqual(pixel)
  })
})
