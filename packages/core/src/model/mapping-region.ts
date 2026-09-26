import { asMappingRegionId, type CabinetGridId, type InputCanvasId, type MappingRegionId, type ScreenId } from './ids.js'
import { createPixelRect, type PixelRect } from './coordinates.js'
import { DomainError } from './errors.js'
import { createMappingTransform, type MappingTransform } from './mapping-transform.js'

export interface MappingRegion {
  readonly id: MappingRegionId
  readonly inputCanvas: InputCanvasId
  readonly screen: ScreenId
  readonly grid: CabinetGridId
  readonly inputRect: PixelRect
  readonly screenRect: PixelRect
  readonly transform: MappingTransform
}

export interface CreateMappingRegionInput {
  id: string
  inputCanvas: InputCanvasId
  screen: ScreenId
  grid: CabinetGridId
  inputRect: PixelRect
  screenRect: PixelRect
  transform: MappingTransform
}

export function createMappingRegion(input: CreateMappingRegionInput): MappingRegion {
  const inputRect = createPixelRect(input.inputRect.x, input.inputRect.y, input.inputRect.width, input.inputRect.height)
  const screenRect = createPixelRect(input.screenRect.x, input.screenRect.y, input.screenRect.width, input.screenRect.height)
  const transform = createMappingTransform(input.transform)
  validateMaskBounds(transform, inputRect)
  return {
    id: asMappingRegionId(input.id),
    inputCanvas: input.inputCanvas,
    screen: input.screen,
    grid: input.grid,
    inputRect,
    screenRect,
    transform,
  }
}

function validateMaskBounds(transform: MappingTransform, inputRect: PixelRect): void {
  for (const point of transform.mask?.points ?? []) {
    if (point.x > inputRect.width || point.y > inputRect.height) {
      throw new DomainError('INVALID_MASK', 'PolygonMask points must be inside the input-local rectangle bounds')
    }
  }
}
