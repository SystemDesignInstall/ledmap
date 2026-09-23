import { asReceiverId, type CabinetId, type PortId, type ProcessorId, type ReceiverId } from './ids.js'
import { assertNonNegativeInteger } from './coordinates.js'

export interface Receiver {
  readonly id: ReceiverId
  readonly index: number
  readonly processor: ProcessorId
  readonly port: PortId
  readonly cabinets: readonly CabinetId[]
}

export interface CreateReceiverInput {
  id: string
  index: number
  processor: ProcessorId
  port: PortId
  cabinets?: readonly CabinetId[]
}

const noCabinets: readonly CabinetId[] = []

export function receiverCabinetCount(receiver: Pick<Receiver, 'cabinets'>): number {
  return receiver.cabinets.length
}

export function createReceiver(input: CreateReceiverInput): Receiver {
  assertNonNegativeInteger('index', input.index)
  return {
    id: asReceiverId(input.id),
    index: input.index,
    processor: input.processor,
    port: input.port,
    cabinets: input.cabinets ?? noCabinets,
  }
}