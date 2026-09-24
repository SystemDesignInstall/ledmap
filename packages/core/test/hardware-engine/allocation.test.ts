import { describe, expect, it } from 'vitest'
import {
  allocateHardware, resolveHardware, createPort, createProcessor, createReceiver,
  type AllocateHardwareInput, type AllocationProposal,
} from '../../src/index.js'
import { allocationFixture } from './allocation-fixtures.js'
import { cabinetFixture, deepFreeze } from './fixtures.js'

function assignments(proposal: AllocationProposal) {
  return proposal.topology.receivers.map(receiver => [...receiver.cabinets])
}

function assertFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) assertFrozen(child)
  }
}

describe('hardware first-fit allocation', () => {
  it('revisits an earlier receiver for a smaller cabinet after skipping it for a larger one', () => {
    const proposal = allocateHardware(allocationFixture())
    expect(assignments(proposal)).toEqual([['C0', 'C2'], ['C1'], []])
    const mapping = resolveHardware(proposal.topology)
    expect(mapping.pixelCount).toBe(13)
    expect(mapping.ports[0]!.receivers.map(receiver => [receiver.portBase, receiver.pixelCount]))
      .toEqual([[0, 6], [6, 7]])
  })

  it('preserves fixed order and ownership, appending only to available space', () => {
    const input = allocationFixture([2, 3, 4, 1, 2], [8, 4, 1], [[3, 0], [2], []])
    const proposal = allocateHardware(input)
    expect(assignments(proposal)).toEqual([['C3', 'C0', 'C1', 'C4'], ['C2'], []])
    expect(input.receivers.map(receiver => receiver.cabinets)).toEqual([['C3', 'C0'], ['C2'], []])
  })

  it('accepts fully fixed topology with an empty cabinetOrder without relocating cabinets', () => {
    const input = allocationFixture([4, 7, 2], [6, 7, 2], [[0], [1], [2]])
    expect(assignments(allocateHardware(input))).toEqual([['C0'], ['C1'], ['C2']])
    expect(resolveHardware(allocateHardware(input).topology)).toEqual(resolveHardware(input))
  })

  it('leaves receivers without a limit unconstrained and does not invent their unused pixel capacity', () => {
    const proposal = allocateHardware(allocationFixture([4, 7, 2], [undefined, 7, 1]))
    expect(assignments(proposal)).toEqual([['C0', 'C1', 'C2'], [], []])
    expect(proposal.topology.receivers[0]).not.toHaveProperty('pixelCapacity')
    expect(proposal.diagnostics.filter(diagnostic => diagnostic.level === 'receiver')).toEqual([
      { level: 'receiver', receiver: 'R-earlier-label', unit: 'pixels', used: 0, capacity: 7 },
      { level: 'receiver', receiver: 'R-empty', unit: 'pixels', used: 0, capacity: 1 },
    ])
  })

  it('uses explicit cabinetOrder independently of cabinet collection order', () => {
    const input = allocationFixture([2, 2, 2], [4, 4, 1])
    expect(assignments(allocateHardware({ ...input, cabinetOrder: [...input.cabinetOrder].reverse() })))
      .toEqual([['C2', 'C1'], ['C0'], []])
  })

  it('uses processorOrder, ascending Port.index and explicit receiverOrder regardless of entity arrays and labels', () => {
    const base = allocationFixture([1, 1, 1, 1], [1, 1, 1])
    const processor = createProcessor({ id: 'Z', name: 'Last label, first processor', portCount: 1 })
    const port = createPort({ id: 'Z:0', processor: processor.id, index: 0, receiverCapacity: 1 })
    const receiver = createReceiver({ id: 'RZ', processor: processor.id, port: port.id, index: 99, pixelCapacity: 1 })
    const input: AllocateHardwareInput = {
      ...base, processors: [...base.processors, processor], ports: [...base.ports].reverse().concat(port),
      receivers: [...base.receivers].reverse().concat(receiver), cabinets: [...base.cabinets].reverse(), modules: [...base.modules].reverse(),
      processorOrder: [processor.id, ...base.processorOrder],
      receiverOrder: [...base.receiverOrder].reverse().map(order => ({ ...order, receivers: [...order.receivers].reverse() }))
        .concat({ port: port.id, receivers: [receiver.id] }),
    }
    const mapping = resolveHardware(allocateHardware(input).topology)
    expect(mapping.ports.flatMap(value => value.receivers.map(item => [item.receiver, item.cabinets.map(cabinet => cabinet.cabinet)])))
      .toEqual([['RZ', ['C0']], ['R-earlier-label', ['C1']], ['R-later-label', ['C2']], ['R-empty', ['C3']]])
  })

  it('reports unused pixels, receiver slots and port slots, including empty entities', () => {
    const input = allocationFixture([4], [6, 7, 1])
    const proposal = allocateHardware({ ...input, processors: input.processors.map(processor => ({ ...processor, portCount: 4 })) })
    expect(proposal.diagnostics).toEqual([
      { level: 'processor', processor: 'P', unit: 'ports', used: 3, capacity: 4 },
      { level: 'port', port: 'P:0', unit: 'receivers', used: 2, capacity: 3 },
      { level: 'receiver', receiver: 'R-later-label', unit: 'pixels', used: 4, capacity: 6 },
      { level: 'receiver', receiver: 'R-earlier-label', unit: 'pixels', used: 0, capacity: 7 },
      { level: 'port', port: 'P:1', unit: 'receivers', used: 1, capacity: 3 },
      { level: 'receiver', receiver: 'R-empty', unit: 'pixels', used: 0, capacity: 1 },
      { level: 'port', port: 'P:2', unit: 'receivers', used: 0, capacity: 3 },
    ])
  })

  it('does not emit unused diagnostics for fully occupied capacity at any level', () => {
    const input = allocationFixture([6, 7, 1], [6, 7, 1])
    const proposal = allocateHardware({
      ...input, processors: input.processors.map(processor => ({ ...processor, portCount: 2 })),
      ports: input.ports.slice(0, 2).map((port, index) => ({ ...port, receiverCapacity: index === 0 ? 2 : 1 })),
      receiverOrder: input.receiverOrder.slice(0, 2),
    })
    expect(proposal.diagnostics).toEqual([])
  })

  it('accepts an empty topology and reports capacity on a processor without ports', () => {
    const empty: AllocateHardwareInput = {
      processors: [], ports: [], receivers: [], cabinets: [], modules: [], processorOrder: [], receiverOrder: [], cabinetOrder: [],
    }
    expect(resolveHardware(allocateHardware(empty).topology)).toEqual({ pixelCount: 0, ports: [] })
    expect(allocateHardware(empty).diagnostics).toEqual([])
    const processor = createProcessor({ id: 'Empty', name: 'Empty', portCount: 4 })
    expect(allocateHardware({ ...empty, processors: [processor], processorOrder: [processor.id] }).diagnostics)
      .toEqual([{ level: 'processor', processor: processor.id, unit: 'ports', used: 0, capacity: 4 }])
  })

  it('is deterministic on deeply frozen input and returns separate deeply frozen proposals', () => {
    const input = deepFreeze(allocationFixture())
    const first = allocateHardware(input)
    const second = allocateHardware(input)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    assertFrozen(first)
    assertFrozen(second)
    for (const collection of ['processors', 'ports', 'receivers', 'cabinets', 'modules', 'receiverOrder'] as const) {
      expect(first.topology[collection]).not.toBe(input[collection])
      expect(first.topology[collection][0]).not.toBe(input[collection][0])
      expect(first.topology[collection][0]).not.toBe(second.topology[collection][0])
    }
    const shuffled = {
      ...input, processors: [...input.processors].reverse(), ports: [...input.ports].reverse(),
      receivers: [...input.receivers].reverse(), cabinets: [...input.cabinets].reverse(), modules: [...input.modules].reverse(),
      receiverOrder: [...input.receiverOrder].reverse(),
    }
    const other = allocateHardware(shuffled)
    expect(resolveHardware(other.topology)).toEqual(resolveHardware(first.topology))
    expect(other.diagnostics).toEqual(first.diagnostics)
  })

  it('does not freeze or retain mutable input objects, arrays or cabinet origins', () => {
    const source = allocationFixture()
    const input = {
      ...source, processors: source.processors.map(value => ({ ...value })), ports: source.ports.map(value => ({ ...value })),
      cabinets: source.cabinets.map(value => ({ ...value, origin: { ...value.origin } })), modules: source.modules.map(value => ({ ...value })),
      receivers: source.receivers.map(value => ({ ...value, cabinets: [...value.cabinets] })),
      processorOrder: [...source.processorOrder], cabinetOrder: [...source.cabinetOrder],
      receiverOrder: source.receiverOrder.map(value => ({ ...value, receivers: [...value.receivers] })),
    }
    const proposal = allocateHardware(input)
    input.processors[0]!.portCount = 99
    input.ports[0]!.index = 99
    input.cabinets[0]!.pixelWidth = 99
    input.cabinets[0]!.origin.x = 99
    input.modules[0]!.pixelWidth = 99
    input.receivers[0]!.cabinets.push(source.cabinets[0]!.id)
    input.receivers[0]!.pixelCapacity = 99
    input.receiverOrder[0]!.receivers.length = 0
    input.processorOrder.length = 0
    input.cabinetOrder.length = 0
    expect(proposal).toEqual(allocateHardware(source))
  })
})

describe('hardware capacity boundaries', () => {
  it('accepts an exact pixel limit and rejects a load one pixel over it in allocator and resolver', () => {
    const exact = allocationFixture([4, 2], [6, 1, 1], [[0, 1], [], []])
    expect(resolveHardware(exact).pixelCount).toBe(6)
    expect(assignments(allocateHardware(exact))).toEqual([['C0', 'C1'], [], []])
    const overflow = allocationFixture([4, 3], [6, 1, 1], [[0, 1], [], []])
    expect(() => resolveHardware(overflow)).toThrowError(/HARDWARE_CAPACITY_EXCEEDED/)
    expect(() => allocateHardware(overflow)).toThrowError(/HARDWARE_CAPACITY_EXCEEDED/)
  })

  it.each([
    { name: 'one oversized atomic cabinet despite sufficient aggregate space', sizes: [8], capacities: [6, 7, 1] },
    { name: 'leftover cabinet after all receivers fill', sizes: [6, 7, 1, 1], capacities: [6, 7, 1] },
    { name: 'fragmented space without splitting or backtracking', sizes: [4, 4, 6, 6], capacities: [10, 10, 1] },
  ])('rejects $name without returning partial topology', ({ sizes, capacities }) => {
    const input = deepFreeze(allocationFixture(sizes, capacities))
    expect(() => allocateHardware(input)).toThrowError(/HARDWARE_CAPACITY_EXCEEDED/)
    expect(input.receivers.every(receiver => receiver.cabinets.length === 0)).toBe(true)
  })

  it('rejects fixed overload even if another receiver could hold it', () => {
    const input = deepFreeze(allocationFixture([7, 1], [6, 100, 100], [[0], [], []]))
    expect(() => allocateHardware(input)).toThrowError(/HARDWARE_CAPACITY_EXCEEDED: Receiver R-later-label: fixed/)
    expect(input.receivers[0]!.cabinets).toEqual(['C0'])
  })

  it('rejects allocation when no receivers are provided', () => {
    const input = allocationFixture([1])
    expect(() => allocateHardware({ ...input, receivers: [], receiverOrder: input.receiverOrder.map(order => ({ ...order, receivers: [] })) }))
      .toThrowError(/HARDWARE_CAPACITY_EXCEEDED/)
  })

  it('validates complete proposals through resolveHardware, including aggregate project overflow', () => {
    const input = allocationFixture([2 ** 52, 2 ** 52], [2 ** 52, 1, 2 ** 52])
    expect(() => allocateHardware(input)).toThrowError(/HARDWARE_OVERFLOW: Project pixel count/)
  })

  it('accepts MAX_SAFE_INTEGER total and rejects unsafe accumulated loads without a pixel limit', () => {
    const exact = allocationFixture([Number.MAX_SAFE_INTEGER - 1, 1], [Number.MAX_SAFE_INTEGER, 1, 1])
    expect(resolveHardware(allocateHardware(exact).topology).pixelCount).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => allocateHardware(allocationFixture([2 ** 52, 2 ** 52], [undefined, 1, 1])))
      .toThrowError(/HARDWARE_OVERFLOW: Receiver/)
  })

  it('checks real module geometry for every cabinet before assigning it', () => {
    const input = allocationFixture()
    const part = cabinetFixture('Different', 3, 2, 5, 7)
    const proposal = allocateHardware({
      ...input, cabinets: [part.cabinet], modules: part.modules, cabinetOrder: [part.cabinet.id],
      receivers: input.receivers.map(receiver => ({ ...receiver, pixelCapacity: 210 })),
    })
    expect(resolveHardware(proposal.topology).pixelCount).toBe(210)
    expect(() => allocateHardware({ ...input, modules: input.modules.slice(1) })).toThrowError(/HARDWARE_LAYOUT_MISMATCH/)
  })
})
