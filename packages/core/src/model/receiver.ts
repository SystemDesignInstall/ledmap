import { asReceiverId, type CabinetId, type PortId, type ProcessorId, type ReceiverId } from './ids.js'
import { assertNonNegativeInteger, assertPositiveInteger } from './coordinates.js'
import { DomainError } from './errors.js'

export interface Receiver {
  readonly id: ReceiverId
  readonly index: number
  readonly processor: ProcessorId
  readonly port: PortId
  readonly cabinets: readonly CabinetId[]
  readonly pixelCapacity?: number
}

export interface CreateReceiverInput {
  id: string
  index: number
  processor: ProcessorId
  port: PortId
  cabinets?: readonly CabinetId[]
  pixelCapacity?: number
}

const noCabinets: readonly CabinetId[] = []

export function receiverCabinetCount(receiver: Pick<Receiver, 'cabinets'>): number {
  return receiver.cabinets.length
}

export function createReceiver(input: CreateReceiverInput): Receiver {
  assertNonNegativeInteger('index', input.index)
  if (input.pixelCapacity !== undefined) {
    assertPositiveInteger('pixelCapacity', input.pixelCapacity)
    if (!Number.isSafeInteger(input.pixelCapacity)) {
      throw new DomainError('INVALID_DIMENSION', `pixelCapacity must be a safe integer, got ${input.pixelCapacity}`)
    }
  }
  return {
    id: asReceiverId(input.id),
    index: input.index,
    processor: input.processor,
    port: input.port,
    cabinets: input.cabinets ?? noCabinets,
    ...(input.pixelCapacity === undefined ? {} : { pixelCapacity: input.pixelCapacity }),
  }
}
