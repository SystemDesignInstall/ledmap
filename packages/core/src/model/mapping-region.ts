import { asMappingRegionId, type CabinetGridId, type InputCanvasId, type MappingRegionId, type ScreenId } from './ids.js'
import { createPixelCoordinate, createSize, type PixelCoordinate, type Size } from './coordinates.js'
import { DomainError } from './errors.js'

export interface MappingRegion {
  readonly id: MappingRegionId
  readonly inputCanvas: InputCanvasId
  readonly screen: ScreenId
  readonly grid: CabinetGridId
  readonly position: PixelCoordinate
  readonly size: Size
}

export interface CreateMappingRegionInput {
  id: string
  inputCanvas: InputCanvasId
  screen: ScreenId
  grid: CabinetGridId
  position: PixelCoordinate
  size: Size
}

export function createMappingRegion(input: CreateMappingRegionInput): MappingRegion {
  const position = createPixelCoordinate(input.position.x, input.position.y)
  const size = createSize(input.size.width, input.size.height)
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) {
    throw new DomainError('INVALID_COORDINATE', 'MappingRegion position must use safe integers')
  }
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)) {
    throw new DomainError('INVALID_DIMENSION', 'MappingRegion size must use safe integers')
  }
  return {
    id: asMappingRegionId(input.id),
    inputCanvas: input.inputCanvas,
    screen: input.screen,
    grid: input.grid,
    position,
    size,
  }
}
