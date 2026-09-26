import { createSize, type Size } from './coordinates.js'
import { DomainError } from './errors.js'
import { asOutputSurfaceId, type OutputSurfaceId, type ProcessorId } from './ids.js'

export interface OutputSurfaceTarget {
  readonly processor?: ProcessorId
  readonly outputIndex?: number
}

export interface OutputSurface {
  readonly id: OutputSurfaceId
  readonly name: string
  readonly resolution: Size
  readonly target?: OutputSurfaceTarget
}

export interface CreateOutputSurfaceInput {
  readonly id: string
  readonly name: string
  readonly resolution: Size
  readonly target?: OutputSurfaceTarget
}

export function createOutputSurface(input: CreateOutputSurfaceInput): OutputSurface {
  const resolution = createSize(input.resolution.width, input.resolution.height)
  if (input.target?.outputIndex !== undefined && (!Number.isSafeInteger(input.target.outputIndex) || input.target.outputIndex < 0)) {
    throw new DomainError('INVALID_OUTPUT_INDEX', 'OutputSurface target outputIndex must be a non-negative safe integer')
  }
  const target = input.target === undefined ? undefined : {
    ...(input.target.processor === undefined ? {} : { processor: input.target.processor }),
    ...(input.target.outputIndex === undefined ? {} : { outputIndex: input.target.outputIndex }),
  }
  return {
    id: asOutputSurfaceId(input.id),
    name: input.name,
    resolution,
    ...(target === undefined ? {} : { target }),
  }
}
