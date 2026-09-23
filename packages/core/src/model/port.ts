import { asPortId, type PortId, type ProcessorId, type ReceiverId } from './ids.js'
import { assertNonNegativeInteger, assertPositiveInteger } from './coordinates.js'

export interface Port {
  readonly id: PortId
  readonly processor: ProcessorId
  readonly index: number
  readonly receiverCapacity: number
  readonly receivers: readonly ReceiverId[]
}

export interface CreatePortInput {
  id: string
  processor: ProcessorId
  index: number
  receiverCapacity: number
  receivers?: readonly ReceiverId[]
}

const noReceivers: readonly ReceiverId[] = []

export function portReceiverCount(port: Pick<Port, 'receivers'>): number {
  return port.receivers.length
}

export function createPort(input: CreatePortInput): Port {
  assertNonNegativeInteger('index', input.index)
  assertPositiveInteger('receiverCapacity', input.receiverCapacity)
  return {
    id: asPortId(input.id),
    processor: input.processor,
    index: input.index,
    receiverCapacity: input.receiverCapacity,
    receivers: input.receivers ?? noReceivers,
  }
}