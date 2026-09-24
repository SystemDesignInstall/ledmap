import { describe, expect, it } from 'vitest'
import {
  addressPixel, locatePixel, globalRemapIndex, resolveHardware,
  asCabinetId, asPortId, asProcessorId, asReceiverId,
  type HardwareTopologyInput, type PortPixelKey,
} from '../../src/index.js'
import { cabinetFixture, smallTopology } from './fixtures.js'

type InvalidCase = {
  name: string
  code: string
  change: (input: HardwareTopologyInput) => HardwareTopologyInput
}

const cases: readonly InvalidCase[] = [
  { name: 'missing processor order', code: 'INCOMPLETE', change: input => ({ ...input, processorOrder: [] }) },
  { name: 'duplicate processor order', code: 'DUPLICATE', change: input => ({ ...input, processorOrder: [...input.processorOrder, ...input.processorOrder] }) },
  { name: 'unknown processor order', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, processorOrder: [asProcessorId('missing')] }) },
  { name: 'unknown port parent', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, ports: input.ports.map(port => ({ ...port, processor: asProcessorId('missing') })) }) },
  { name: 'duplicate port index', code: 'DUPLICATE', change: input => ({ ...input, ports: input.ports.map(port => ({ ...port, index: 0 })) }) },
  { name: 'processor port capacity', code: 'CAPACITY_EXCEEDED', change: input => ({ ...input, processors: input.processors.map(processor => ({ ...processor, portCount: 1 })) }) },
  { name: 'receiver count capacity', code: 'CAPACITY_EXCEEDED', change: input => ({ ...input, ports: input.ports.map(port => ({ ...port, receiverCapacity: 1 })) }) },
  { name: 'unknown receiver processor', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, processor: asProcessorId('missing') })) }) },
  { name: 'unknown receiver port', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, port: asPortId('missing') })) }) },
  { name: 'unknown receiver order port', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, receiverOrder: [{ port: asPortId('missing'), receivers: [] }] }) },
  { name: 'duplicate receiver order port', code: 'DUPLICATE', change: input => ({ ...input, receiverOrder: [...input.receiverOrder, input.receiverOrder[0]!] }) },
  { name: 'missing empty port order', code: 'INCOMPLETE', change: input => ({ ...input, receiverOrder: input.receiverOrder.slice(0, 2) }) },
  { name: 'unknown receiver in order', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, receiverOrder: [{ port: input.ports[0]!.id, receivers: [asReceiverId('missing')] }] }) },
  { name: 'duplicate receiver assignment', code: 'DUPLICATE', change: input => ({ ...input, receiverOrder: [{ port: input.ports[0]!.id, receivers: [input.receivers[0]!.id, input.receivers[0]!.id] }] }) },
  { name: 'missing receiver assignment', code: 'INCOMPLETE', change: input => ({ ...input, receiverOrder: input.receiverOrder.map(order => ({ ...order, receivers: [] })) }) },
  { name: 'receiver assigned to wrong port', code: 'PARENT_MISMATCH', change: input => ({ ...input, receiverOrder: [{ port: input.ports[0]!.id, receivers: [input.receivers[2]!.id] }] }) },
  { name: 'unknown cabinet assignment', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [asCabinetId('missing')] })) }) },
  { name: 'duplicate cabinet on receiver', code: 'DUPLICATE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [...receiver.cabinets, ...receiver.cabinets] })) }) },
  { name: 'duplicate cabinet across receivers', code: 'DUPLICATE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [input.cabinets[0]!.id] })) }) },
  { name: 'missing cabinet assignment', code: 'INCOMPLETE', change: input => ({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [] })) }) },
  { name: 'unknown module cabinet', code: 'UNKNOWN_REFERENCE', change: input => ({ ...input, modules: input.modules.map(module => ({ ...module, cabinet: asCabinetId('missing') })) }) },
  { name: 'missing module', code: 'LAYOUT_MISMATCH', change: input => ({ ...input, modules: input.modules.slice(1) }) },
  { name: 'duplicate module position', code: 'DUPLICATE', change: input => ({ ...input, modules: input.modules.map(module => ({ ...module, column: 0, row: 0 })) }) },
  { name: 'inconsistent module pixel size', code: 'LAYOUT_MISMATCH', change: input => ({ ...input, modules: input.modules.map(module => ({ ...module, pixelWidth: module.pixelWidth + 1 })) }) },
  { name: 'inconsistent module physical size', code: 'LAYOUT_MISMATCH', change: input => ({ ...input, modules: input.modules.map(module => ({ ...module, width: module.width + 1 })) }) },
  { name: 'inconsistent module local origin', code: 'LAYOUT_MISMATCH', change: input => ({ ...input, modules: input.modules.map(module => ({ ...module, localX: module.localX + 1 })) }) },
  { name: 'rotation', code: 'UNSUPPORTED_TRANSFORM', change: input => ({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, rotation: 90 })) }) },
  { name: 'horizontal flip', code: 'UNSUPPORTED_TRANSFORM', change: input => ({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, flipH: true })) }) },
  { name: 'vertical flip', code: 'UNSUPPORTED_TRANSFORM', change: input => ({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, flipV: true })) }) },
]

describe('hardware topology validation', () => {
  it.each(cases)('rejects $name', ({ code, change }) => {
    expect(() => resolveHardware(change(smallTopology()))).toThrowError(new RegExp(`HARDWARE_${code}`))
  })

  it.each(['processors', 'ports', 'receivers', 'cabinets', 'modules'] as const)('rejects duplicate %s IDs', collection => {
    const input = smallTopology()
    expect(() => resolveHardware({ ...input, [collection]: [...input[collection], input[collection][0]!] })).toThrowError(/HARDWARE_DUPLICATE/)
  })

  it('rejects a receiver whose known processor disagrees with its port', () => {
    const input = smallTopology()
    const extra = { ...input.processors[0]!, id: asProcessorId('Q') }
    expect(() => resolveHardware({
      ...input, processors: [...input.processors, extra], processorOrder: [...input.processorOrder, extra.id],
      receivers: input.receivers.map(receiver => ({ ...receiver, processor: extra.id })),
    })).toThrowError(/HARDWARE_PARENT_MISMATCH/)
  })

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capacity or geometry %s', value => {
    const input = smallTopology()
    expect(() => resolveHardware({ ...input, processors: input.processors.map(processor => ({ ...processor, portCount: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware({ ...input, ports: input.ports.map(port => ({ ...port, receiverCapacity: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, pixelWidth: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware({ ...input, modules: input.modules.map(module => ({ ...module, pixelWidth: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid metadata indices %s', index => {
    const input = smallTopology()
    expect(() => resolveHardware({ ...input, ports: input.ports.map(port => ({ ...port, index })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, index })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware({ ...input, modules: input.modules.map(module => ({ ...module, column: index })) })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })

  it('rejects non-integral cabinet subdivision through the existing Cabinet Engine', () => {
    const input = smallTopology()
    expect(() => resolveHardware({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, pixelWidth: cabinet.pixelWidth + 1 })) })).toThrowError(/INVALID_DIMENSION/)
  })
})

function largeTopology(scope: 'receiver' | 'port' | 'project', first = 2 ** 52, second = 2 ** 52): HardwareTopologyInput {
  const input = smallTopology()
  const parts = [cabinetFixture('Large-A', 1, 1, first, 1), cabinetFixture('Large-B', 1, 1, second, 1)]
  const assignments = scope === 'receiver' ? [[0, 1], [], []] : scope === 'port' ? [[0], [1], []] : [[0], [], [1]]
  return {
    ...input, cabinets: parts.map(part => part.cabinet), modules: parts.flatMap(part => part.modules),
    receivers: input.receivers.map((receiver, index) => ({ ...receiver, cabinets: assignments[index]!.map(position => parts[position]!.cabinet.id) })),
  }
}

describe('hardware cumulative safe integer validation', () => {
  it.each([
    ['receiver', 'Receiver R-later-label load'], ['port', 'Port P:0 load'], ['project', 'Project pixel count'],
  ] as const)('rejects unsafe %s load with individually safe cabinets', (scope, label) => {
    expect(() => resolveHardware(largeTopology(scope))).toThrowError(`HARDWARE_OVERFLOW: ${label} exceeds the safe integer range`)
  })

  it.each(['receiver', 'port', 'project'] as const)('accepts a total of MAX_SAFE_INTEGER with %s boundaries', scope => {
    const mapping = resolveHardware(largeTopology(scope, Number.MAX_SAFE_INTEGER - 1, 1))
    expect(mapping.pixelCount).toBe(Number.MAX_SAFE_INTEGER)
    const pixel = { cabinet: asCabinetId('Large-B'), coordinate: { x: 0, y: 0 } }
    const address = addressPixel(mapping, pixel)
    expect(address.dataIndex).toBe(scope === 'project' ? 0 : Number.MAX_SAFE_INTEGER - 1)
    const key = { ...address.hardware, dataIndex: address.dataIndex }
    expect(globalRemapIndex(mapping, key)).toBe(Number.MAX_SAFE_INTEGER - 1)
    expect(locatePixel(mapping, key)).toMatchObject({ cabinet: pixel.cabinet, cabinetCoordinate: pixel.coordinate })
    expect(mapping.ports.at(-1)!.globalBase).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('hardware lookup boundaries', () => {
  const input = smallTopology()
  const mapping = resolveHardware(input)
  const key: PortPixelKey = { processor: input.processors[0]!.id, port: input.ports[0]!.id, dataIndex: 0 }

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 217])('rejects invalid dataIndex %s without wrapping', dataIndex => {
    expect(() => locatePixel(mapping, { ...key, dataIndex })).toThrowError(/HARDWARE_INVALID_VALUE|HARDWARE_OUT_OF_RANGE/)
    expect(() => globalRemapIndex(mapping, { ...key, dataIndex })).toThrowError(/HARDWARE_INVALID_VALUE|HARDWARE_OUT_OF_RANGE/)
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cabinet coordinates %s', value => {
    expect(() => addressPixel(mapping, { cabinet: asCabinetId('A'), coordinate: { x: value, y: 0 } })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
    expect(() => addressPixel(mapping, { cabinet: asCabinetId('A'), coordinate: { x: 0, y: value } })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })

  it('rejects unknown entities, missing processor context, empty ports and exclusive geometry bounds', () => {
    expect(() => addressPixel(mapping, { cabinet: asCabinetId('missing'), coordinate: { x: 0, y: 0 } })).toThrowError(/HARDWARE_UNKNOWN_REFERENCE/)
    for (const invalid of [
      { ...key, port: asPortId('missing') }, { ...key, processor: asProcessorId('missing') },
      { dataIndex: 0 } as PortPixelKey,
    ]) {
      expect(() => locatePixel(mapping, invalid)).toThrowError(/HARDWARE_UNKNOWN_REFERENCE/)
      expect(() => globalRemapIndex(mapping, invalid)).toThrowError(/HARDWARE_UNKNOWN_REFERENCE/)
    }
    for (const port of input.ports.slice(1)) {
      expect(() => locatePixel(mapping, { ...key, port: port.id })).toThrowError(/HARDWARE_OUT_OF_RANGE/)
      expect(() => globalRemapIndex(mapping, { ...key, port: port.id })).toThrowError(/HARDWARE_OUT_OF_RANGE/)
    }
    expect(() => addressPixel(mapping, { cabinet: asCabinetId('A'), coordinate: { x: 15, y: 0 } })).toThrowError(/ORDERING_OUT_OF_RANGE/)
    expect(() => addressPixel(mapping, { cabinet: asCabinetId('A'), coordinate: { x: 0, y: 14 } })).toThrowError(/ORDERING_OUT_OF_RANGE/)
  })
})
