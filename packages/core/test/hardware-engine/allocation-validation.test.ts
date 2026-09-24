import { describe, expect, it } from 'vitest'
import {
  allocateHardware, resolveHardware, asCabinetId, asPortId, asProcessorId, asReceiverId,
  type AllocateHardwareInput,
} from '../../src/index.js'
import { smallTopology } from './fixtures.js'
import { allocationFixture } from './allocation-fixtures.js'

function fixedAllocation(): AllocateHardwareInput {
  return { ...smallTopology(), cabinetOrder: [] }
}

describe('allocation cabinetOrder contract', () => {
  it.each([
    { name: 'unknown cabinet', code: 'UNKNOWN_REFERENCE', order: ['missing'] },
    { name: 'duplicate unassigned cabinet', code: 'DUPLICATE', order: ['C0', 'C0', 'C1', 'C2'] },
    { name: 'missing unassigned cabinet', code: 'INCOMPLETE', order: ['C0', 'C1'] },
  ])('rejects $name', ({ code, order }) => {
    expect(() => allocateHardware({ ...allocationFixture(), cabinetOrder: order.map(asCabinetId) }))
      .toThrowError(new RegExp(`HARDWARE_${code}`))
  })

  it('rejects a fixed cabinet listed again in cabinetOrder', () => {
    const input = allocationFixture([4, 7, 2], [6, 7, 1], [[0], [], []])
    expect(() => allocateHardware({ ...input, cabinetOrder: [asCabinetId('C0'), ...input.cabinetOrder] }))
      .toThrowError(/HARDWARE_DUPLICATE/)
  })

  it('rejects partial topology in the resolver while the allocator completes it', () => {
    const input = allocationFixture()
    expect(() => resolveHardware(input)).toThrowError(/HARDWARE_INCOMPLETE/)
    expect(resolveHardware(allocateHardware(input).topology).pixelCount).toBe(13)
  })
})

describe('raw receiver pixel capacity validation', () => {
  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid pixel capacity %s even on an empty receiver', pixelCapacity => {
    const input = fixedAllocation()
    const invalid = { ...input, receivers: input.receivers.map(receiver => ({ ...receiver, pixelCapacity })) }
    expect(() => allocateHardware(invalid)).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware(invalid)).toThrowError(/HARDWARE_INVALID_VALUE/)
    const emptyInvalid = {
      ...input, receivers: input.receivers.map((receiver, index) => index === 2 ? { ...receiver, pixelCapacity } : receiver),
    }
    expect(() => allocateHardware(emptyInvalid)).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => resolveHardware(emptyInvalid)).toThrowError(/HARDWARE_INVALID_VALUE/)
  })
})

type InvalidCase = {
  name: string
  code: string
  change: (input: AllocateHardwareInput) => AllocateHardwareInput
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

describe('allocation skeleton validation', () => {
  it.each(cases)('rejects $name', ({ code, change }) => {
    expect(() => allocateHardware(change(fixedAllocation()))).toThrowError(new RegExp(`HARDWARE_${code}`))
  })

  it.each(['processors', 'ports', 'receivers', 'cabinets', 'modules'] as const)('rejects duplicate %s IDs', collection => {
    const input = fixedAllocation()
    expect(() => allocateHardware({ ...input, [collection]: [...input[collection], input[collection][0]!] })).toThrowError(/HARDWARE_DUPLICATE/)
  })

  it('rejects a receiver whose known processor disagrees with its port', () => {
    const input = fixedAllocation()
    const extra = { ...input.processors[0]!, id: asProcessorId('Q') }
    expect(() => allocateHardware({
      ...input, processors: [...input.processors, extra], processorOrder: [...input.processorOrder, extra.id],
      receivers: input.receivers.map(receiver => ({ ...receiver, processor: extra.id })),
    })).toThrowError(/HARDWARE_PARENT_MISMATCH/)
  })

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capacity or geometry %s', value => {
    const input = fixedAllocation()
    expect(() => allocateHardware({ ...input, processors: input.processors.map(processor => ({ ...processor, portCount: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => allocateHardware({ ...input, ports: input.ports.map(port => ({ ...port, receiverCapacity: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => allocateHardware({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, pixelWidth: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => allocateHardware({ ...input, modules: input.modules.map(module => ({ ...module, pixelWidth: value })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid metadata indices %s', index => {
    const input = fixedAllocation()
    expect(() => allocateHardware({ ...input, ports: input.ports.map(port => ({ ...port, index })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => allocateHardware({ ...input, receivers: input.receivers.map(receiver => ({ ...receiver, index })) })).toThrowError(/HARDWARE_INVALID_VALUE/)
    expect(() => allocateHardware({ ...input, modules: input.modules.map(module => ({ ...module, column: index })) })).toThrowError(/INVALID_COORDINATE|ORDERING_OUT_OF_RANGE/)
  })

  it('rejects non-integral cabinet subdivision through the existing Cabinet Engine', () => {
    const input = fixedAllocation()
    expect(() => allocateHardware({ ...input, cabinets: input.cabinets.map(cabinet => ({ ...cabinet, pixelWidth: cabinet.pixelWidth + 1 })) })).toThrowError(/INVALID_DIMENSION/)
  })
})
