import { asScreenId, type CabinetGridId, type MappingRegionId, type ScreenId } from './ids.js'
import { createSize, type Size } from './coordinates.js'

export interface Screen {
  readonly id: ScreenId
  readonly name: string
  readonly resolution: Size
  readonly mappingRegions: readonly MappingRegionId[]
  readonly cabinetGrids: readonly CabinetGridId[]
}

export interface CreateScreenInput {
  id: string
  name: string
  resolution: Size
  mappingRegions?: readonly MappingRegionId[]
  cabinetGrids?: readonly CabinetGridId[]
}

const noRegions: readonly MappingRegionId[] = []
const noGrids: readonly CabinetGridId[] = []

export function createScreen(input: CreateScreenInput): Screen {
  const resolution = createSize(input.resolution.width, input.resolution.height)
  return {
    id: asScreenId(input.id),
    name: input.name,
    resolution,
    mappingRegions: input.mappingRegions ?? noRegions,
    cabinetGrids: input.cabinetGrids ?? noGrids,
  }
}