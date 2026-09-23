import { asMappingRegionId, type CabinetGridId, type MappingRegionId, type ScreenId } from './ids.js'
import { createPixelCoordinate, createSize, type PixelCoordinate, type Size } from './coordinates.js'

export interface MappingRegion {
  readonly id: MappingRegionId
  readonly screen: ScreenId
  readonly grid: CabinetGridId
  readonly position: PixelCoordinate
  readonly size: Size
}

export interface CreateMappingRegionInput {
  id: string
  screen: ScreenId
  grid: CabinetGridId
  position: PixelCoordinate
  size: Size
}

export function createMappingRegion(input: CreateMappingRegionInput): MappingRegion {
  const position = createPixelCoordinate(input.position.x, input.position.y)
  const size = createSize(input.size.width, input.size.height)
  return {
    id: asMappingRegionId(input.id),
    screen: input.screen,
    grid: input.grid,
    position,
    size,
  }
}