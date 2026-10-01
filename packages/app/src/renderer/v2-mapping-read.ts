import type { InputCanvas, LedMapProjectV2, MappingRegion } from '@ledmap/core'

export interface MappingRegionPatch {
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
}

export function inputCanvas(project: LedMapProjectV2): InputCanvas | null {
  return project.content.inputCanvases[0] ?? null
}

export function mappingRegions(project: LedMapProjectV2): readonly MappingRegion[] {
  return project.content.mappingRegions.map(region => ({
    id: region.id, inputCanvas: region.inputCanvasId, screen: region.screenId,
    grid: region.gridId, position: region.position, size: region.size,
  }))
}

export function findMappingRegion(project: LedMapProjectV2, id: string): MappingRegion | undefined {
  const region = project.content.mappingRegions.find(value => value.id === id)
  return region ? { id: region.id, inputCanvas: region.inputCanvasId, screen: region.screenId,
    grid: region.gridId, position: region.position, size: region.size } : undefined
}
