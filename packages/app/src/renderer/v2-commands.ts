import {
  asCabinetGridId, asCabinetId, asModuleId, asScreenId, createInputCanvas, createMappingRegion, DomainError,
  type CabinetEngineConfig, type LedMapProjectV2, type ProjectCabinet, type ProjectMappingRegion, type ProjectModule,
} from '@ledmap/core'
import { buildSnapshot, initialDraft, type CabinetSeed, type Draft, type Snapshot } from './state.js'
import type { AddScreenOptions, ScreenCabinetConfigPatch } from './v2-view-model.js'
import type { MappingRegionPatch } from './v2-mapping-read.js'

function screenOf(project: LedMapProjectV2, screenId: string) {
  const screen = project.design.screens.find(value => value.id === screenId)
  if (!screen) throw new Error(`Unknown screen: ${screenId}`)
  return screen
}

function gridOf(project: LedMapProjectV2, screenId: string) {
  const screen = screenOf(project, screenId)
  const grid = project.design.cabinetGrids.find(value => value.id === screen.cabinetGridOrder[0])
  if (!grid) throw new Error(`Screen ${screenId} has no Cabinet Grid.`)
  return grid
}

function placementOf(project: LedMapProjectV2, screenId: string) {
  const placement = project.design.composition.placements.find(value => value.screenId === screenId)
  if (!placement) throw new Error(`Screen ${screenId} has no Layout placement.`)
  return placement
}

function numericSerial(id: string): number {
  const match = /\/C(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

function cabinetLabel(screenId: string, cabinetId: string): string {
  const prefix = `${screenId}/`
  return cabinetId.startsWith(prefix) ? cabinetId.slice(prefix.length) : cabinetId
}

function draftFromGrid(project: LedMapProjectV2, screenId: string): Draft {
  const grid = gridOf(project, screenId)
  const cabinet = project.design.cabinets.find(value => value.gridId === grid.id)
  const module = cabinet && project.design.modules.find(value => value.cabinetId === cabinet.id)
  const moduleColumns = cabinet?.moduleColumns ?? 1
  const moduleRows = cabinet?.moduleRows ?? 1
  return {
    columns: String(grid.columns), rows: String(grid.rows),
    moduleColumns: String(moduleColumns), moduleRows: String(moduleRows),
    modulePixelWidth: String(module?.pixelWidth ?? grid.cabinetWidth / moduleColumns),
    modulePixelHeight: String(module?.pixelHeight ?? grid.cabinetHeight / moduleRows),
    ordering: { ...grid.ordering },
  }
}

function snapshotFor(project: LedMapProjectV2, screenId: string, draft: Draft): Snapshot {
  const screen = screenOf(project, screenId)
  const grid = gridOf(project, screenId)
  const cabinets = project.design.cabinets.filter(value => value.gridId === grid.id)
  const seed: CabinetSeed = {
    cabinets: cabinets.map(value => ({
      id: cabinetLabel(screen.id, value.id), column: value.column, row: value.row, index: 0,
    })),
    nextCabinetSerial: cabinets.reduce((maximum, value) => Math.max(maximum, numericSerial(value.id)), 0) + 1,
  }
  const result = buildSnapshot(seed, draft, {
    screenId: screen.id, gridId: grid.id, screenName: screen.name, gridName: grid.name,
  })
  const problem = result.errors.form ?? Object.values(result.errors).find(value => typeof value === 'string')
  if (problem) throw new Error(problem)
  if (!result.snapshot) throw new Error('Unable to build screen source.')
  return result.snapshot
}

function modulesFor(cabinet: ProjectCabinet, config: CabinetEngineConfig, existing: readonly ProjectModule[]): ProjectModule[] {
  const byCell = new Map(existing.map(value => [`${value.column},${value.row}`, value] as const))
  const result: ProjectModule[] = []
  for (let row = 0; row < config.moduleRows; row += 1) {
    for (let column = 0; column < config.moduleColumns; column += 1) {
      result.push({
        id: byCell.get(`${column},${row}`)?.id ?? asModuleId(`${cabinet.id}/M${column + 1}x${row + 1}`),
        cabinetId: cabinet.id, column, row,
        width: config.modulePixelWidth, height: config.modulePixelHeight,
        pixelWidth: config.modulePixelWidth, pixelHeight: config.modulePixelHeight,
      })
    }
  }
  return result
}

function rebuildGrid(project: LedMapProjectV2, screenId: string, draft: Draft): LedMapProjectV2 {
  const screen = screenOf(project, screenId)
  const grid = gridOf(project, screenId)
  const snapshot = snapshotFor(project, screenId, draft)
  const prior = project.design.cabinets.filter(value => value.gridId === grid.id)
  const byCell = new Map(prior.map(value => [`${value.column},${value.row}`, value] as const))
  const priorIds = new Set(prior.map(value => value.id))
  const modulesByCabinet = new Map<string, ProjectModule[]>()
  for (const module of project.design.modules) {
    if (!priorIds.has(module.cabinetId)) continue
    const values = modulesByCabinet.get(module.cabinetId) ?? []
    values.push(module)
    modulesByCabinet.set(module.cabinetId, values)
  }
  const cabinets: ProjectCabinet[] = snapshot.cabinets.map(value => {
    const existing = byCell.get(`${value.column},${value.row}`)
    return {
      id: existing?.id ?? asCabinetId(`${screen.id}/${value.id}`),
      gridId: grid.id, label: existing?.label ?? value.id,
      column: value.column, row: value.row,
      origin: { x: value.column * snapshot.grid.cabinetWidth, y: value.row * snapshot.grid.cabinetHeight },
      width: snapshot.grid.cabinetWidth, height: snapshot.grid.cabinetHeight,
      pixelWidth: snapshot.grid.cabinetWidth, pixelHeight: snapshot.grid.cabinetHeight,
      moduleColumns: snapshot.config.moduleColumns, moduleRows: snapshot.config.moduleRows,
      rotation: existing?.rotation ?? 0, flipH: existing?.flipH ?? false, flipV: existing?.flipV ?? false,
    }
  })
  const retainedIds = new Set(cabinets.map(value => value.id))
  const removedIds = new Set([...priorIds].filter(id => !retainedIds.has(id)))
  const assigned = project.hardware.assignments.find(value => removedIds.has(value.target.cabinetId))
  const routed = project.operations.signalRoutes.find(value => value.orderedCabinetIds.some(id => removedIds.has(id)))
  if (assigned || routed) {
    throw new DomainError('PROJECT_CABINET_IN_USE', `Cabinet ${assigned?.target.cabinetId ?? routed!.orderedCabinetIds.find(id => removedIds.has(id))} is used by Hardware`)
  }
  const modules = cabinets.flatMap(cabinet => modulesFor(cabinet, snapshot.config, modulesByCabinet.get(cabinet.id) ?? []))
  return {
    ...project,
    design: {
      ...project.design,
      screens: project.design.screens.map(value => value.id === screen.id
        ? { ...value, resolution: { ...snapshot.screen.resolution } } : value),
      cabinetGrids: project.design.cabinetGrids.map(value => value.id === grid.id
        ? {
          ...value, columns: snapshot.grid.columns, rows: snapshot.grid.rows,
          cabinetWidth: snapshot.grid.cabinetWidth, cabinetHeight: snapshot.grid.cabinetHeight,
          ordering: snapshot.grid.ordering,
        } : value),
      cabinets: [...project.design.cabinets.filter(value => value.gridId !== grid.id), ...cabinets],
      modules: [...project.design.modules.filter(value => !priorIds.has(value.cabinetId)), ...modules],
    },
  }
}

function nextScreenSerial(project: LedMapProjectV2): number {
  const used = new Set<string>(project.design.screens.map(value => value.id))
  let serial = project.design.screens.length + 1
  while (used.has(`screen-${serial}`)) serial += 1
  return serial
}

export function addScreenV2(project: LedMapProjectV2, draft: Draft = initialDraft, options: AddScreenOptions = {}): LedMapProjectV2 {
  const serial = nextScreenSerial(project)
  const previous = project.design.screens[project.design.screens.length - 1]
  const previousPlacement = previous && placementOf(project, previous.id)
  const x = options.position?.x ?? (previousPlacement ? previousPlacement.x + 100 : 0)
  const y = options.position?.y ?? (previousPlacement ? previousPlacement.y + 100 : 0)
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Screen position must use signed whole numbers.')
  const name = options.name?.trim() || `Screen ${serial}`
  const built = buildSnapshot(null, draft, {
    screenId: `screen-${serial}`, gridId: `grid-${serial}`, screenName: name, gridName: 'Cabinet Grid',
  })
  const problem = built.errors.form ?? Object.values(built.errors).find(value => typeof value === 'string')
  if (problem) throw new Error(problem)
  const snapshot = built.snapshot
  if (!snapshot) throw new Error('Unable to add Screen.')
  const staged: LedMapProjectV2 = {
    ...project,
    design: {
      ...project.design,
      screens: [...project.design.screens, {
        id: asScreenId(snapshot.screen.id), name, resolution: snapshot.screen.resolution,
        cabinetGridOrder: [asCabinetGridId(snapshot.grid.id)], mappingRegionOrder: [],
      }],
      cabinetGrids: [...project.design.cabinetGrids, {
        id: asCabinetGridId(snapshot.grid.id), screenId: asScreenId(snapshot.screen.id), name: snapshot.grid.name,
        columns: snapshot.grid.columns, rows: snapshot.grid.rows,
        cabinetWidth: snapshot.grid.cabinetWidth, cabinetHeight: snapshot.grid.cabinetHeight,
        ordering: snapshot.grid.ordering,
      }],
      composition: { placements: [...project.design.composition.placements, { screenId: asScreenId(snapshot.screen.id), x, y, locked: false }] },
    },
  }
  return rebuildGrid(staged, snapshot.screen.id, draft)
}

export function duplicateScreenV2(project: LedMapProjectV2, screenId: string): LedMapProjectV2 {
  const screen = screenOf(project, screenId)
  const placement = placementOf(project, screenId)
  return addScreenV2(project, draftFromGrid(project, screenId), {
    name: `${screen.name} Copy`, position: { x: placement.x + 32, y: placement.y + 32 },
  })
}

export function renameScreenV2(project: LedMapProjectV2, screenId: string, name: string): LedMapProjectV2 {
  const normalized = name.trim()
  if (!normalized) throw new Error('Screen name cannot be empty.')
  const screen = screenOf(project, screenId)
  if (screen.name === normalized) return project
  return { ...project, design: { ...project.design,
    screens: project.design.screens.map(value => value.id === screenId ? { ...value, name: normalized } : value),
  } }
}

export function setScreenPositionsV2(
  project: LedMapProjectV2,
  positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
): LedMapProjectV2 {
  const entries = Object.entries(positions)
  for (const [screenId, position] of entries) {
    if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) {
      throw new Error('Screen position must use signed whole numbers.')
    }
    screenOf(project, screenId)
    const placement = placementOf(project, screenId)
    if (placement.locked && (placement.x !== position.x || placement.y !== position.y)) {
      throw new DomainError('PROJECT_COMPAT_MUTATION_BLOCKED', `Screen ${screenId} has a locked V2 placement`)
    }
  }
  if (entries.every(([screenId, position]) => {
    const current = placementOf(project, screenId)
    return current.x === position.x && current.y === position.y
  })) return project
  return { ...project, design: { ...project.design, composition: {
    placements: project.design.composition.placements.map(value => {
      const next = positions[value.screenId]
      return next ? { ...value, x: next.x, y: next.y } : value
    }),
  } } }
}

export function setScreenPositionV2(project: LedMapProjectV2, screenId: string, x: number, y: number): LedMapProjectV2 {
  return setScreenPositionsV2(project, { [screenId]: { x, y } })
}

export function resizeScreenGridV2(project: LedMapProjectV2, screenId: string, columns: number, rows: number): LedMapProjectV2 {
  const draft = draftFromGrid(project, screenId)
  if (!Number.isSafeInteger(columns) || columns < 1) throw new Error('Columns must be a whole number of at least 1.')
  if (!Number.isSafeInteger(rows) || rows < 1) throw new Error('Rows must be a whole number of at least 1.')
  return rebuildGrid(project, screenId, { ...draft, columns: String(columns), rows: String(rows) })
}

export function updateScreenCabinetConfigV2(
  project: LedMapProjectV2,
  screenId: string,
  patch: ScreenCabinetConfigPatch,
): LedMapProjectV2 {
  const draft = draftFromGrid(project, screenId)
  return rebuildGrid(project, screenId, {
    ...draft,
    moduleColumns: String(patch.moduleColumns ?? draft.moduleColumns),
    moduleRows: String(patch.moduleRows ?? draft.moduleRows),
    modulePixelWidth: String(patch.modulePixelWidth ?? draft.modulePixelWidth),
    modulePixelHeight: String(patch.modulePixelHeight ?? draft.modulePixelHeight),
    ordering: {
      ...draft.ordering,
      numbering: patch.numbering ?? draft.ordering.numbering,
      direction: patch.direction ?? draft.ordering.direction,
      snake: patch.snake ?? draft.ordering.snake,
    },
  })
}

export function deleteScreensV2(project: LedMapProjectV2, screenIds: readonly string[]): LedMapProjectV2 {
  const selected = new Set(screenIds)
  if (selected.size === 0) return project
  for (const id of selected) screenOf(project, id)
  const grids = new Set(project.design.cabinetGrids.filter(value => selected.has(value.screenId)).map(value => value.id))
  const cabinets = new Set(project.design.cabinets.filter(value => grids.has(value.gridId)).map(value => value.id))
  const assigned = project.hardware.assignments.find(value => cabinets.has(value.target.cabinetId))
  const routed = project.operations.signalRoutes.find(value => value.orderedCabinetIds.some(id => cabinets.has(id)))
  if (assigned || routed) throw new DomainError('PROJECT_CABINET_IN_USE', 'Cannot delete a Screen with Cabinets used by Hardware')
  if (project.design.stage?.placements.some(value => selected.has(value.screenId)) ||
      project.content.outputMappings.some(value => selected.has(value.screenId))) {
    throw new DomainError('PROJECT_SCREEN_IN_USE', 'Cannot delete a Screen referenced by Stage or Output Mapping')
  }
  const regions = new Set(project.content.mappingRegions.filter(value => selected.has(value.screenId)).map(value => value.id))
  return {
    ...project,
    design: {
      ...project.design,
      screens: project.design.screens.filter(value => !selected.has(value.id)).map(value => ({
        ...value, mappingRegionOrder: value.mappingRegionOrder.filter(id => !regions.has(id)),
      })),
      cabinetGrids: project.design.cabinetGrids.filter(value => !grids.has(value.id)),
      cabinets: project.design.cabinets.filter(value => !cabinets.has(value.id)),
      modules: project.design.modules.filter(value => !cabinets.has(value.cabinetId)),
      composition: { placements: project.design.composition.placements.filter(value => !selected.has(value.screenId)) },
    },
    content: { ...project.content, mappingRegions: project.content.mappingRegions.filter(value => !regions.has(value.id)) },
  }
}

export function setInputCanvasResolutionV2(project: LedMapProjectV2, width: number, height: number): LedMapProjectV2 {
  if (project.content.inputCanvases.length > 1) throw new DomainError('PROJECT_COMPAT_INPUT_CANVASES', 'The current editor supports one InputCanvas')
  const current = project.content.inputCanvases[0]
  const canvas = createInputCanvas({ id: current?.id ?? 'input-1', resolution: { width, height } })
  if (current?.resolution.width === canvas.resolution.width && current.resolution.height === canvas.resolution.height) return project
  return { ...project, content: { ...project.content, inputCanvases: [canvas] } }
}

function regionOf(project: LedMapProjectV2, regionId: string): ProjectMappingRegion {
  const region = project.content.mappingRegions.find(value => value.id === regionId)
  if (!region) throw new Error(`Unknown Mapping Region: ${regionId}`)
  return region
}

function nextRegionId(project: LedMapProjectV2): string {
  const used = new Set<string>(project.content.mappingRegions.map(value => value.id))
  let serial = project.content.mappingRegions.length + 1
  while (used.has(`region-${serial}`)) serial += 1
  return `region-${serial}`
}

export function addMappingRegionV2(
  project: LedMapProjectV2,
  screenId: string,
  position?: { readonly x: number; readonly y: number },
): LedMapProjectV2 {
  const canvas = project.content.inputCanvases[0]
  if (!canvas) throw new Error('Configure the Input Canvas before creating a Mapping Region.')
  const screen = screenOf(project, screenId)
  const grid = gridOf(project, screenId)
  const offset = project.content.mappingRegions.length * 40
  const source = createMappingRegion({
    id: nextRegionId(project), inputCanvas: canvas.id, screen: screen.id, grid: grid.id,
    position: position ?? { x: offset, y: offset }, size: { ...screen.resolution },
  })
  const region: ProjectMappingRegion = {
    id: source.id, inputCanvasId: source.inputCanvas, screenId: source.screen, gridId: source.grid,
    position: source.position, size: source.size,
  }
  return {
    ...project,
    design: { ...project.design, screens: project.design.screens.map(value => value.id === screen.id
      ? { ...value, mappingRegionOrder: [...value.mappingRegionOrder, region.id] } : value) },
    content: { ...project.content, mappingRegions: [...project.content.mappingRegions, region] },
  }
}

export function updateMappingRegionV2(project: LedMapProjectV2, regionId: string, patch: MappingRegionPatch): LedMapProjectV2 {
  const current = regionOf(project, regionId)
  const source = createMappingRegion({
    id: current.id, inputCanvas: current.inputCanvasId, screen: current.screenId, grid: current.gridId,
    position: { x: patch.x ?? current.position.x, y: patch.y ?? current.position.y },
    size: { width: patch.width ?? current.size.width, height: patch.height ?? current.size.height },
  })
  if (source.position.x === current.position.x && source.position.y === current.position.y &&
      source.size.width === current.size.width && source.size.height === current.size.height) return project
  return { ...project, content: { ...project.content, mappingRegions: project.content.mappingRegions.map(value => value.id === current.id
    ? { ...value, position: source.position, size: source.size } : value) } }
}

export function deleteMappingRegionV2(project: LedMapProjectV2, regionId: string): LedMapProjectV2 {
  const current = regionOf(project, regionId)
  return {
    ...project,
    design: { ...project.design, screens: project.design.screens.map(value => value.id === current.screenId
      ? { ...value, mappingRegionOrder: value.mappingRegionOrder.filter(id => id !== current.id) } : value) },
    content: { ...project.content, mappingRegions: project.content.mappingRegions.filter(value => value.id !== current.id) },
  }
}

export function mapFromLayoutPositionV2(project: LedMapProjectV2, screenId: string, regionId?: string): LedMapProjectV2 {
  screenOf(project, screenId)
  const placement = placementOf(project, screenId)
  if (placement.x < 0 || placement.y < 0) {
    throw new Error('Composition position is outside Input Canvas coordinates. Mapping X/Y must be non-negative.')
  }
  const target = regionId === undefined
    ? project.content.mappingRegions.find(value => value.screenId === screenId)
    : regionOf(project, regionId)
  if (target && target.screenId !== screenId) throw new Error('Mapping Region belongs to another Screen.')
  return target
    ? updateMappingRegionV2(project, target.id, { x: placement.x, y: placement.y })
    : addMappingRegionV2(project, screenId, { x: placement.x, y: placement.y })
}
