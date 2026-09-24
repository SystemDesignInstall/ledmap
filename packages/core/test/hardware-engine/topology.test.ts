import { describe, expect, it } from 'vitest'
import {
  addressPixel, locatePixel, globalRemapIndex, resolveHardware,
  asCabinetId, createPort, createProcessor, createReceiver,
} from '../../src/index.js'
import { cabinetFixture, deepFreeze, smallTopology } from './fixtures.js'

describe('explicit hardware topology', () => {
  it('uses actual variable cabinet sizes and preserves explicit receiver and cabinet order', () => {
    const input = deepFreeze(smallTopology())
    const mapping = resolveHardware(input)
    expect(mapping.pixelCount).toBe(217)
    expect(mapping.ports.map(port => [port.index, port.globalBase, port.pixelCount])).toEqual([[0, 0, 217], [1, 217, 0], [2, 217, 0]])
    expect(mapping.ports[0]!.receivers.map(receiver => [receiver.receiver, receiver.portBase, receiver.pixelCount]))
      .toEqual([['R-later-label', 0, 216], ['R-earlier-label', 216, 1]])
    expect(mapping.ports[0]!.receivers[0]!.cabinets.map(cabinet => [cabinet.cabinet, cabinet.receiverBase, cabinet.portBase, cabinet.pixelCount]))
      .toEqual([['A', 0, 0, 210], ['B', 210, 210, 6]])
    expect(mapping.ports[1]!.receivers[0]!.pixelCount).toBe(0)
    for (const [cabinet, coordinate, expected] of [
      ['A', { x: 5, y: 0 }, 35], ['A', { x: 14, y: 13 }, 209],
      ['B', { x: 0, y: 0 }, 210], ['B', { x: 1, y: 2 }, 215], ['C', { x: 0, y: 0 }, 216],
    ] as const) {
      const address = addressPixel(mapping, { cabinet: asCabinetId(cabinet), coordinate })
      expect(address.dataIndex).toBe(expected)
      expect(locatePixel(mapping, { ...address.hardware, dataIndex: expected }).cabinetCoordinate).toEqual(coordinate)
    }
    for (let dataIndex = 0; dataIndex < 217; dataIndex += 1) {
      const key = { processor: input.processors[0]!.id, port: input.ports[0]!.id, dataIndex }
      const pixel = locatePixel(mapping, key)
      expect(addressPixel(mapping, { cabinet: pixel.cabinet, coordinate: pixel.cabinetCoordinate }).dataIndex).toBe(dataIndex)
      expect(globalRemapIndex(mapping, key)).toBe(dataIndex)
    }
  })

  it('distinguishes two Processor / Port index 0 / dataIndex 0 keys and follows explicit processor order', () => {
    const base = smallTopology()
    const processor = createProcessor({ id: 'Z', name: 'A label that must not control order', portCount: 1 })
    const port = createPort({ id: 'Z:0', processor: processor.id, index: 0, receiverCapacity: 1 })
    const part = cabinetFixture('D')
    const receiver = createReceiver({ id: 'R-Z', processor: processor.id, port: port.id, index: 0, cabinets: [part.cabinet.id] })
    const input = deepFreeze({
      ...base, processors: [...base.processors, processor], ports: [...base.ports, port],
      receivers: [...base.receivers, receiver], cabinets: [...base.cabinets, part.cabinet], modules: [...base.modules, ...part.modules],
      processorOrder: [processor.id, base.processors[0]!.id],
      receiverOrder: [...base.receiverOrder, { port: port.id, receivers: [receiver.id] }],
    })
    const mapping = resolveHardware(input)
    const keyP = { processor: base.processors[0]!.id, port: base.ports[0]!.id, dataIndex: 0 }
    const keyZ = { processor: processor.id, port: port.id, dataIndex: 0 }
    expect(mapping.pixelCount).toBe(223)
    expect(mapping.ports.map(value => [value.processor, value.index])).toEqual([['Z', 0], ['P', 0], ['P', 1], ['P', 2]])
    expect(locatePixel(mapping, keyP).cabinet).toBe('A')
    expect(locatePixel(mapping, keyZ).cabinet).toBe('D')
    expect(globalRemapIndex(mapping, keyZ)).toBe(0)
    expect(globalRemapIndex(mapping, keyP)).toBe(6)
    expect(() => locatePixel(mapping, { ...keyP, processor: processor.id })).toThrowError(/HARDWARE_UNKNOWN_REFERENCE/)
    const swapped = resolveHardware({ ...input, processorOrder: [...input.processorOrder].reverse() })
    expect(globalRemapIndex(swapped, keyP)).toBe(0)
    expect(globalRemapIndex(swapped, keyZ)).toBe(217)
    for (const [key, count] of [[keyP, 217], [keyZ, 6]] as const) {
      for (let dataIndex = 0; dataIndex < count; dataIndex += 1) {
        const fullKey = { ...key, dataIndex }
        expect(locatePixel(mapping, fullKey)).toEqual(locatePixel(swapped, fullKey))
        const pixel = locatePixel(mapping, fullKey)
        const address = addressPixel(mapping, { cabinet: pixel.cabinet, coordinate: pixel.cabinetCoordinate })
        expect({ processor: address.hardware.processor, port: address.hardware.port, dataIndex: address.dataIndex }).toEqual(fullKey)
      }
    }
  })

  it('uses Port.index and explicit lists regardless of collection order or Receiver.index', () => {
    const input = smallTopology()
    const original = resolveHardware(input)
    expect(resolveHardware({
      ...input, ports: [...input.ports].reverse(), modules: [...input.modules].reverse(), cabinets: [...input.cabinets].reverse(),
      receivers: [...input.receivers].reverse().map(receiver => ({ ...receiver, index: 17 })),
      receiverOrder: [...input.receiverOrder].reverse(),
    })).toEqual(original)
    const changed = resolveHardware({
      ...input, receiverOrder: input.receiverOrder.map(order => ({ ...order, receivers: [...order.receivers].reverse() })),
    })
    expect(addressPixel(changed, { cabinet: asCabinetId('C'), coordinate: { x: 0, y: 0 } }).dataIndex).toBe(0)
    expect(addressPixel(changed, { cabinet: asCabinetId('A'), coordinate: { x: 0, y: 0 } }).dataIndex).toBe(1)
    const changedCabinets = resolveHardware({
      ...input, receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [...receiver.cabinets].reverse() })),
    })
    expect(addressPixel(changedCabinets, { cabinet: asCabinetId('B'), coordinate: { x: 0, y: 0 } }).dataIndex).toBe(0)
    expect(addressPixel(changedCabinets, { cabinet: asCabinetId('A'), coordinate: { x: 0, y: 0 } }).dataIndex).toBe(6)
  })

  it('does not retain mutable input arrays and deeply freezes the derived result', () => {
    const source = smallTopology()
    const input = {
      ...source, processorOrder: [...source.processorOrder],
      receivers: source.receivers.map(receiver => ({ ...receiver, cabinets: [...receiver.cabinets] })),
      modules: source.modules.map(module => ({ ...module })),
      cabinets: source.cabinets.map(cabinet => ({ ...cabinet })),
      receiverOrder: source.receiverOrder.map(order => ({ ...order, receivers: [...order.receivers] })),
    }
    const mapping = resolveHardware(input)
    input.processorOrder.length = 0
    input.receiverOrder[0]!.receivers.length = 0
    input.receivers[0]!.cabinets.length = 0
    input.cabinets[0]!.pixelWidth = 1
    input.modules[0]!.id = source.modules[1]!.id
    expect(mapping).toEqual(resolveHardware(source))
    function assertFrozen(value: unknown): void {
      if (value !== null && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true)
        for (const child of Object.values(value)) assertFrozen(child)
      }
    }
    assertFrozen(mapping)
    const address = addressPixel(mapping, { cabinet: asCabinetId('A'), coordinate: { x: 0, y: 0 } })
    assertFrozen(address)
    assertFrozen(locatePixel(mapping, { ...address.hardware, dataIndex: address.dataIndex }))
  })

  it('allows empty, consistent topology and does not pad unused port capacity', () => {
    expect(resolveHardware({ processors: [], ports: [], receivers: [], cabinets: [], modules: [], processorOrder: [], receiverOrder: [] }))
      .toEqual({ pixelCount: 0, ports: [] })
    const input = smallTopology()
    const empty = resolveHardware({ ...input, cabinets: [], modules: [], receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [] })) })
    expect(empty.pixelCount).toBe(0)
    expect(empty.ports.map(port => [port.globalBase, port.pixelCount])).toEqual([[0, 0], [0, 0], [0, 0]])
    const sparse = resolveHardware({ ...input, ports: input.ports.slice(0, 2), receiverOrder: input.receiverOrder.slice(0, 2) })
    expect(sparse.pixelCount).toBe(217)
  })
})
