import { asPortId, type PortId, type ProcessorId } from './ids.js'
import { assertNonNegativeInteger, assertPositiveInteger } from './coordinates.js'
import type { Receiver } from './receiver.js'

export interface Port {
  readonly id: PortId
  readonly processor: ProcessorId
  readonly index: number
  readonly receiverCapacity: number
}

export interface CreatePortInput {
  id: string
  processor: ProcessorId
  index: number
  receiverCapacity: number
}

export function createPort(input: CreatePortInput): Port {
  assertNonNegativeInteger('index', input.index)
  assertPositiveInteger('receiverCapacity', input.receiverCapacity)
  return {
    id: asPortId(input.id),
    processor: input.processor,
    index: input.index,
    receiverCapacity: input.receiverCapacity,
  }
}

export function portReceiverCount(port: Port, receivers: readonly Receiver[]): number {
  return receivers.reduce(
    (count, receiver) => (receiver.port === port.id ? count + 1 : count),
    0,
  )
}