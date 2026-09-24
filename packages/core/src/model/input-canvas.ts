import { asInputCanvasId, type InputCanvasId } from './ids.js'
import { createSize, type Size } from './coordinates.js'
import { DomainError } from './errors.js'

export interface InputCanvas {
  readonly id: InputCanvasId
  readonly resolution: Size
}

export interface CreateInputCanvasInput {
  id: string
  resolution: Size
}

export function createInputCanvas(input: CreateInputCanvasInput): InputCanvas {
  const resolution = createSize(input.resolution.width, input.resolution.height)
  if (!Number.isSafeInteger(resolution.width) || !Number.isSafeInteger(resolution.height)) {
    throw new DomainError('INVALID_DIMENSION', 'InputCanvas resolution must use safe integers')
  }
  return { id: asInputCanvasId(input.id), resolution }
}
