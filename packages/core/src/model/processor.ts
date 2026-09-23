import { asProcessorId, type ProcessorId } from './ids.js'
import { assertPositiveInteger } from './coordinates.js'

export interface Processor {
  readonly id: ProcessorId
  readonly name: string
  readonly portCount: number
}

export interface CreateProcessorInput {
  id: string
  name: string
  portCount: number
}

export function createProcessor(input: CreateProcessorInput): Processor {
  assertPositiveInteger('portCount', input.portCount)
  return {
    id: asProcessorId(input.id),
    name: input.name,
    portCount: input.portCount,
  }
}