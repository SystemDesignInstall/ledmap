import {
  asMappingRegionId,
  createInputCanvas,
  createMappingRegion,
  type MappingRegion,
} from '@ledmap/core'
import { createProject, findScreen, type Project } from './project.js'

export interface MappingRegionPatch {
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
}

function nextRegionId(project: Project): ReturnType<typeof asMappingRegionId> {
  const used = new Set<string>(project.source.mappingRegions.map(region => region.id))
  let serial = project.source.mappingRegions.length + 1
  while (used.has(`region-${serial}`)) serial += 1
  return asMappingRegionId(`region-${serial}`)
}

export function findMappingRegion(project: Project, regionId: string): MappingRegion | undefined {
  return project.source.mappingRegions.find(region => region.id === regionId)
}

export function setInputCanvasResolution(project: Project, width: number, height: number): Project {
  const inputCanvas = createInputCanvas({
    id: project.source.inputCanvas?.id ?? 'input-1',
    resolution: { width, height },
  })
  if (
    project.source.inputCanvas?.resolution.width === inputCanvas.resolution.width &&
    project.source.inputCanvas.resolution.height === inputCanvas.resolution.height
  ) return project
  return createProject({ ...project.source, inputCanvas })
}

export function addMappingRegion(
  project: Project,
  screenId: string,
  position?: { readonly x: number; readonly y: number },
): Project {
  const inputCanvas = project.source.inputCanvas
  if (!inputCanvas) throw new Error('Configure the Input Canvas before creating a Mapping Region.')
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown Screen: ${screenId}`)
  const offset = project.source.mappingRegions.length * 40
  const region = createMappingRegion({
    id: nextRegionId(project),
    inputCanvas: inputCanvas.id,
    screen: screen.screen.id,
    grid: screen.grid.id,
    position: position ?? { x: offset, y: offset },
    size: { ...screen.screen.resolution },
  })
  return createProject({
    ...project.source,
    screens: project.source.screens.map(source => source.id === screen.screen.id
      ? { ...source, mappingRegions: [...source.mappingRegions, region.id] }
      : source),
    mappingRegions: [...project.source.mappingRegions, region],
  })
}

export function updateMappingRegion(project: Project, regionId: string, patch: MappingRegionPatch): Project {
  const current = findMappingRegion(project, regionId)
  if (!current) throw new Error(`Unknown Mapping Region: ${regionId}`)
  const next = createMappingRegion({
    ...current,
    position: {
      x: patch.x ?? current.position.x,
      y: patch.y ?? current.position.y,
    },
    size: {
      width: patch.width ?? current.size.width,
      height: patch.height ?? current.size.height,
    },
  })
  if (
    next.position.x === current.position.x && next.position.y === current.position.y &&
    next.size.width === current.size.width && next.size.height === current.size.height
  ) return project
  return createProject({
    ...project.source,
    mappingRegions: project.source.mappingRegions.map(region => region.id === current.id ? next : region),
  })
}

export function deleteMappingRegion(project: Project, regionId: string): Project {
  const current = findMappingRegion(project, regionId)
  if (!current) throw new Error(`Unknown Mapping Region: ${regionId}`)
  return createProject({
    ...project.source,
    screens: project.source.screens.map(screen => screen.id === current.screen
      ? { ...screen, mappingRegions: screen.mappingRegions.filter(id => id !== current.id) }
      : screen),
    mappingRegions: project.source.mappingRegions.filter(region => region.id !== current.id),
  })
}

export function mapFromLayoutPosition(project: Project, screenId: string, regionId?: string): Project {
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown Screen: ${screenId}`)
  if (screen.x < 0 || screen.y < 0) {
    throw new Error('Composition position is outside Input Canvas coordinates. Mapping X/Y must be non-negative.')
  }
  const target = regionId === undefined
    ? project.source.mappingRegions.find(region => region.screen === screen.screen.id)
    : findMappingRegion(project, regionId)
  if (target && target.screen !== screen.screen.id) throw new Error('Mapping Region belongs to another Screen.')
  return target
    ? updateMappingRegion(project, target.id, { x: screen.x, y: screen.y })
    : addMappingRegion(project, screen.screen.id, { x: screen.x, y: screen.y })
}
