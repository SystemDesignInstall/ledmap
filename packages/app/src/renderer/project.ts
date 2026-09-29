import {
  asCabinetId, asModuleId, cabinetOrder, createCabinet, createEditableProject, createModule,
  type Cabinet, type CabinetEngineConfig, type CabinetGrid, type Direction, type EditableProject,
  type GridPosition, type Module, type Numbering, type Screen,
} from '@ledmap/core'
import {
  buildSnapshot, gridPixelSize, initialDraft, maxPreviewColumns, maxPreviewRows,
  type Draft, type PreviewCabinet, type SnapshotIds,
} from './state.js'

export interface SourceCabinet extends PreviewCabinet {
  readonly sourceId: Cabinet['id']
}

export interface ScreenView {
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly config: CabinetEngineConfig
  readonly x: number
  readonly y: number
  readonly cabinets: readonly SourceCabinet[]
  readonly nextCabinetSerial: number
  readonly path: readonly GridPosition[]
  readonly modulesPerCabinet: number
  readonly totalModules: number
  readonly pixelCount: number
}

export interface Project {
  readonly source: EditableProject
  readonly screens: readonly ScreenView[]
}

export interface ScreenCabinetConfigPatch {
  readonly moduleColumns?: number
  readonly moduleRows?: number
  readonly modulePixelWidth?: number
  readonly modulePixelHeight?: number
  readonly numbering?: Numbering
  readonly direction?: Direction
  readonly snake?: boolean
}

export type SelectedObject =
  | { readonly type: 'screen'; readonly id: string }
  | { readonly type: 'cabinetGrid'; readonly id: string }
  | { readonly type: 'cabinet'; readonly id: string; readonly screenId: string }

export interface Bounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface Hit {
  readonly screenIndex: number
  readonly screen: ScreenView
  readonly cabinet: SourceCabinet | null
}

function safeProduct(label: string, ...values: number[]): number {
  const result = values.reduce((product, value) => product * value, 1)
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} exceeds the safe integer range.`)
  return result
}

function cabinetLabel(screenId: string, sourceId: string): string {
  const prefix = `${screenId}/`
  return sourceId.startsWith(prefix) ? sourceId.slice(prefix.length) : sourceId
}

function numericCabinetSerial(label: string): number {
  const match = /^C(\d+)$/.exec(label)
  return match ? Number(match[1]) : 0
}

function moduleGeometry(source: EditableProject, cabinets: readonly Cabinet[], grid: CabinetGrid): Pick<
  CabinetEngineConfig,
  'moduleColumns' | 'moduleRows' | 'modulePixelWidth' | 'modulePixelHeight'
> {
  const cabinet = cabinets[0]
  if (!cabinet) {
    return { moduleColumns: 1, moduleRows: 1, modulePixelWidth: grid.cabinetWidth, modulePixelHeight: grid.cabinetHeight }
  }
  const module = source.hardwareTopology.modules.find(entry => entry.cabinet === cabinet.id)
  const modulePixelWidth = module?.pixelWidth ?? cabinet.pixelWidth / cabinet.moduleColumns
  const modulePixelHeight = module?.pixelHeight ?? cabinet.pixelHeight / cabinet.moduleRows
  if (!Number.isSafeInteger(modulePixelWidth) || modulePixelWidth < 1 || !Number.isSafeInteger(modulePixelHeight) || modulePixelHeight < 1) {
    throw new Error(`Cabinet ${cabinet.id} has unsupported module pixel geometry.`)
  }
  return {
    moduleColumns: cabinet.moduleColumns,
    moduleRows: cabinet.moduleRows,
    modulePixelWidth,
    modulePixelHeight,
  }
}

function screenView(source: EditableProject, screen: Screen): ScreenView | null {
  const gridId = screen.cabinetGrids[0]
  if (!gridId) return null
  const grid = source.cabinetGrids.find(entry => entry.id === gridId)
  const placement = source.editorLayout.screenPositions.find(entry => entry.screen === screen.id)
  if (!grid || !placement) return null
  const sourceCabinets = source.hardwareTopology.cabinets
    .filter(cabinet => cabinet.grid === grid.id)
    .sort((a, b) => a.row - b.row || a.column - b.column)
  const geometry = moduleGeometry(source, sourceCabinets, grid)
  const config: CabinetEngineConfig = {
    columns: grid.columns,
    rows: grid.rows,
    ...geometry,
    ordering: { ...grid.ordering },
  }
  const path = cabinetOrder(config)
  const cabinets = sourceCabinets.map(cabinet => ({
    sourceId: cabinet.id,
    id: cabinetLabel(screen.id, cabinet.id),
    column: cabinet.column,
    row: cabinet.row,
    index: path.findIndex(cell => cell.column === cabinet.column && cell.row === cabinet.row),
  }))
  const modulesPerCabinet = safeProduct('Modules per cabinet', config.moduleColumns, config.moduleRows)
  const pixelCount = safeProduct('Pixel count', screen.resolution.width, screen.resolution.height)
  const nextCabinetSerial = cabinets.reduce((maximum, cabinet) => Math.max(maximum, numericCabinetSerial(cabinet.id)), 0) + 1
  return {
    screen,
    grid,
    config,
    x: placement.position.x,
    y: placement.position.y,
    cabinets,
    nextCabinetSerial,
    path,
    modulesPerCabinet,
    totalModules: cabinets.length === 0 ? 0 : safeProduct('Total modules', cabinets.length, modulesPerCabinet),
    pixelCount,
  }
}

export function createProject(source: EditableProject = createEditableProject()): Project {
  return { source, screens: source.screens.map(screen => screenView(source, screen)).filter(view => view !== null) }
}

export function screenWidth(screen: ScreenView): number {
  return gridPixelSize(screen.grid).width
}

export function screenHeight(screen: ScreenView): number {
  return gridPixelSize(screen.grid).height
}

export function findScreen(project: Project, screenId: string): ScreenView | undefined {
  return project.screens.find(screen => screen.screen.id === screenId)
}

function replaceSource(project: Project, source: EditableProject): Project {
  return createProject(source)
}

export function moveScreen(project: Project, screenId: string, dx: number, dy: number): Project {
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown screen: ${screenId}`)
  return setScreenPosition(project, screenId, Math.round(screen.x + dx), Math.round(screen.y + dy))
}

export function setScreenPosition(project: Project, screenId: string, x: number, y: number): Project {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Screen position must use signed whole numbers.')
  if (!findScreen(project, screenId)) throw new Error(`Unknown screen: ${screenId}`)
  return replaceSource(project, {
    ...project.source,
    editorLayout: {
      screenPositions: project.source.editorLayout.screenPositions.map(placement => placement.screen === screenId
        ? { ...placement, position: { x, y } }
        : placement),
    },
  })
}

function draftFromConfig(config: CabinetEngineConfig, columns: number, rows: number): Draft {
  return {
    columns: String(columns),
    rows: String(rows),
    moduleColumns: String(config.moduleColumns),
    moduleRows: String(config.moduleRows),
    modulePixelWidth: String(config.modulePixelWidth),
    modulePixelHeight: String(config.modulePixelHeight),
    ordering: { ...config.ordering },
  }
}

function assertGridDimension(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a whole number of at least 1.`)
}

function sourceIds(screen: ScreenView): SnapshotIds {
  return {
    screenId: screen.screen.id,
    gridId: screen.grid.id,
    screenName: screen.screen.name,
    gridName: screen.grid.name,
  }
}

function moduleId(cabinet: Cabinet, column: number, row: number): Module['id'] {
  return asModuleId(`${cabinet.id}/M${column + 1}x${row + 1}`)
}

function buildModules(cabinet: Cabinet, config: CabinetEngineConfig, existing: readonly Module[]): Module[] {
  const byCell = new Map(existing.map(module => [`${module.column},${module.row}`, module] as const))
  const modules: Module[] = []
  for (let row = 0; row < config.moduleRows; row += 1) {
    for (let column = 0; column < config.moduleColumns; column += 1) {
      const previous = byCell.get(`${column},${row}`)
      modules.push(createModule({
        id: previous?.id ?? moduleId(cabinet, column, row),
        cabinet,
        column,
        row,
        width: config.modulePixelWidth,
        height: config.modulePixelHeight,
        pixelWidth: config.modulePixelWidth,
        pixelHeight: config.modulePixelHeight,
      }))
    }
  }
  return modules
}

function rebuildScreenSource(project: Project, current: ScreenView, draft: Draft): Project {
  const result = buildSnapshot(current, draft, sourceIds(current))
  const problem = result.errors.form ?? Object.values(result.errors).find(value => typeof value === 'string')
  if (problem) throw new Error(problem)
  const snapshot = result.snapshot
  if (!snapshot) throw new Error('Unable to build screen source.')

  const existingCabinets = project.source.hardwareTopology.cabinets.filter(cabinet => cabinet.grid === current.grid.id)
  const existingByCell = new Map(existingCabinets.map(cabinet => [`${cabinet.column},${cabinet.row}`, cabinet] as const))
  const existingModules = project.source.hardwareTopology.modules.filter(module => existingCabinets.some(cabinet => cabinet.id === module.cabinet))
  const existingModulesByCabinet = new Map<string, Module[]>()
  for (const module of existingModules) {
    const modules = existingModulesByCabinet.get(module.cabinet) ?? []
    modules.push(module)
    existingModulesByCabinet.set(module.cabinet, modules)
  }

  const cabinets: Cabinet[] = []
  const modules: Module[] = []
  for (const preview of snapshot.cabinets) {
    const previous = existingByCell.get(`${preview.column},${preview.row}`)
    const cabinet = createCabinet({
      id: previous?.id ?? asCabinetId(`${current.screen.id}/${preview.id}`),
      grid: current.grid.id,
      column: preview.column,
      row: preview.row,
      x: preview.column * snapshot.grid.cabinetWidth,
      y: preview.row * snapshot.grid.cabinetHeight,
      width: snapshot.grid.cabinetWidth,
      height: snapshot.grid.cabinetHeight,
      pixelWidth: snapshot.grid.cabinetWidth,
      pixelHeight: snapshot.grid.cabinetHeight,
      moduleColumns: snapshot.config.moduleColumns,
      moduleRows: snapshot.config.moduleRows,
      rotation: previous?.rotation ?? 0,
      flipH: previous?.flipH ?? false,
      flipV: previous?.flipV ?? false,
    })
    cabinets.push(cabinet)
    modules.push(...buildModules(cabinet, snapshot.config, existingModulesByCabinet.get(cabinet.id) ?? []))
  }

  const retainedCabinetIds = new Set(cabinets.map(cabinet => cabinet.id))
  const affectedCabinetIds = new Set(existingCabinets.map(cabinet => cabinet.id))
  const source: EditableProject = {
    ...project.source,
    screens: project.source.screens.map(screen => screen.id === current.screen.id
      ? { ...screen, resolution: { ...snapshot.screen.resolution } }
      : screen),
    cabinetGrids: project.source.cabinetGrids.map(grid => grid.id === current.grid.id
      ? { ...grid, ...snapshot.grid, screen: current.screen.id }
      : grid),
    hardwareTopology: {
      ...project.source.hardwareTopology,
      cabinets: [
        ...project.source.hardwareTopology.cabinets.filter(cabinet => cabinet.grid !== current.grid.id),
        ...cabinets,
      ],
      modules: [
        ...project.source.hardwareTopology.modules.filter(module => !affectedCabinetIds.has(module.cabinet)),
        ...modules,
      ],
      receivers: project.source.hardwareTopology.receivers.map(receiver => ({
        ...receiver,
        cabinets: receiver.cabinets.filter(id => !affectedCabinetIds.has(id) || retainedCabinetIds.has(id)),
      })),
    },
  }
  return replaceSource(project, source)
}

export function resizeScreenGrid(project: Project, screenId: string, columns: number, rows: number): Project {
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown screen: ${screenId}`)
  assertGridDimension('Columns', columns)
  assertGridDimension('Rows', rows)
  return rebuildScreenSource(project, screen, draftFromConfig(screen.config, columns, rows))
}

export function updateScreenCabinetConfig(
  project: Project,
  screenId: string,
  patch: ScreenCabinetConfigPatch,
): Project {
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown screen: ${screenId}`)
  const config: CabinetEngineConfig = {
    ...screen.config,
    moduleColumns: patch.moduleColumns ?? screen.config.moduleColumns,
    moduleRows: patch.moduleRows ?? screen.config.moduleRows,
    modulePixelWidth: patch.modulePixelWidth ?? screen.config.modulePixelWidth,
    modulePixelHeight: patch.modulePixelHeight ?? screen.config.modulePixelHeight,
    ordering: {
      ...screen.config.ordering,
      numbering: patch.numbering ?? screen.config.ordering.numbering,
      direction: patch.direction ?? screen.config.ordering.direction,
      snake: patch.snake ?? screen.config.ordering.snake,
    },
  }
  return rebuildScreenSource(project, screen, draftFromConfig(config, screen.grid.columns, screen.grid.rows))
}

export function maxColumnsForRows(screen: ScreenView, rows: number): number {
  return maxPreviewColumns(rows, screen.modulesPerCabinet)
}

export function maxRowsForColumns(screen: ScreenView, columns: number): number {
  return maxPreviewRows(columns, screen.modulesPerCabinet)
}

function nextSerial(project: Project, prefix: string): number {
  const used = new Set<string>(project.source.screens.map(screen => screen.id))
  let serial = project.source.screens.length + 1
  while (used.has(`${prefix}${serial}`)) serial += 1
  return serial
}

export function addScreen(project: Project, draft: Draft = initialDraft): Project {
  const serial = nextSerial(project, 'screen-')
  const previous = project.screens[project.screens.length - 1]
  const x = previous ? previous.x + 100 : 0
  const y = previous ? previous.y + 100 : 0
  const ids: SnapshotIds = {
    screenId: `screen-${serial}`,
    gridId: `grid-${serial}`,
    screenName: `Screen ${serial}`,
    gridName: 'Cabinet Grid',
  }
  const built = buildSnapshot(null, draft, ids)
  const problem = built.errors.form ?? Object.values(built.errors).find(value => typeof value === 'string')
  if (problem) throw new Error(problem)
  const snapshot = built.snapshot
  if (!snapshot) throw new Error('Unable to add Screen.')
  const source: EditableProject = {
    ...project.source,
    screens: [...project.source.screens, snapshot.screen],
    cabinetGrids: [...project.source.cabinetGrids, snapshot.grid],
    editorLayout: {
      screenPositions: [...project.source.editorLayout.screenPositions, { screen: snapshot.screen.id, position: { x, y } }],
    },
  }
  const withScreen = replaceSource(project, source)
  const view = findScreen(withScreen, snapshot.screen.id)
  if (!view) throw new Error('Unable to project the new Screen.')
  return rebuildScreenSource(withScreen, view, draft)
}

export function projectBounds(project: Project): Bounds {
  const empty: Bounds = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  if (project.screens.length === 0) return empty
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const screen of project.screens) {
    const w = screenWidth(screen)
    const h = screenHeight(screen)
    left = Math.min(left, screen.x)
    top = Math.min(top, screen.y)
    right = Math.max(right, screen.x + w)
    bottom = Math.max(bottom, screen.y + h)
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function screenBounds(screen: ScreenView): Bounds {
  const w = screenWidth(screen)
  const h = screenHeight(screen)
  return { left: screen.x, top: screen.y, right: screen.x + w, bottom: screen.y + h, width: w, height: h }
}

export function hitTest(project: Project, point: { x: number; y: number }): Hit | null {
  for (let i = project.screens.length - 1; i >= 0; i -= 1) {
    const screen = project.screens[i]!
    const w = screenWidth(screen)
    const h = screenHeight(screen)
    if (point.x < screen.x || point.y < screen.y || point.x >= screen.x + w || point.y >= screen.y + h) continue
    const local = { x: point.x - screen.x, y: point.y - screen.y }
    const column = Math.floor(local.x / screen.grid.cabinetWidth)
    const row = Math.floor(local.y / screen.grid.cabinetHeight)
    const cabinet = screen.cabinets.find(entry => entry.column === column && entry.row === row) ?? null
    return { screenIndex: i, screen, cabinet }
  }
  return null
}
