import { type AllocateHardwareInput, type CabinetId } from '../../src/index.js'
import { cabinetFixture, referenceTopology, smallTopology } from './fixtures.js'

export function referenceAllocation(): AllocateHardwareInput {
  const input = referenceTopology()
  return {
    ...input,
    receivers: input.receivers.map(receiver => ({ ...receiver, cabinets: [], pixelCapacity: 65536 })),
    cabinetOrder: input.receivers.flatMap(receiver => receiver.cabinets),
  }
}

export function allocationFixture(
  sizes: readonly number[] = [4, 7, 2],
  capacities: readonly (number | undefined)[] = [6, 7, 1],
  fixed: readonly (readonly number[])[] = [[], [], []],
): AllocateHardwareInput {
  const input = smallTopology()
  const parts = sizes.map((size, index) => cabinetFixture(`C${index}`, 1, 1, size, 1))
  const assigned = new Set(fixed.flat())
  return {
    ...input,
    cabinets: parts.map(part => part.cabinet), modules: parts.flatMap(part => part.modules),
    receivers: input.receivers.map((receiver, index) => ({
      ...receiver,
      cabinets: (fixed[index] ?? []).map(position => parts[position]!.cabinet.id),
      ...(capacities[index] === undefined ? {} : { pixelCapacity: capacities[index] }),
    })),
    cabinetOrder: parts.flatMap((part, index): CabinetId[] => assigned.has(index) ? [] : [part.cabinet.id]),
  }
}
