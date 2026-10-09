import {
  cabinetOrder,
  selectCompositionGeometry,
  type CabinetEngineConfig,
  type Direction,
  type GridPosition,
  type LedMapProjectV2,
  type Numbering,
  type ProjectCabinet,
  type ProjectCabinetGrid,
  type ProjectScreen,
} from '@ledmap/core'
import { gridPixelSize, maxPreviewColumns, maxPreviewRows } from './state.js'

export interface SourceCabinet extends GridPosition {
  readonly sourceId: string
  readonly id: string
  readonly label: string
  readonly index: number
}

export interface ScreenView {
  readonly screen: ProjectScreen
  readonly grid: ProjectCabinetGrid
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
  readonly model: LedMapProjectV2
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

export interface AddScreenOptions {
  readonly name?: string
  readonly position?: { readonly x: number; readonly y: number }
}

export type SelectedObject =
  | { readonly type: 'screen'; readonly id: string }
  | { readonly type: 'cabinetGrid'; readonly id: string }
  | { readonly type: 'cabinet'; readonly id: string; readonly screenId: string; readonly column?: number; readonly row?: number }
  | { readonly type: 'cabinetCell'; readonly id: string; readonly screenId: string; readonly column: number; readonly row: number }

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

function moduleGeometry(project: LedMapProjectV2, cabinets: readonly ProjectCabinet[], grid: ProjectCabinetGrid) {
  const cabinet = cabinets[0]
  if (!cabinet) {
    return { moduleColumns: 1, moduleRows: 1, modulePixelWidth: grid.cabinetWidth, modulePixelHeight: grid.cabinetHeight }
  }
  const module = project.design.modules.find(entry => entry.cabinetId === cabinet.id)
  const modulePixelWidth = module?.pixelWidth ?? cabinet.pixelWidth / cabinet.moduleColumns
  const modulePixelHeight = module?.pixelHeight ?? cabinet.pixelHeight / cabinet.moduleRows
  if (!Number.isSafeInteger(modulePixelWidth) || modulePixelWidth < 1 || !Number.isSafeInteger(modulePixelHeight) || modulePixelHeight < 1) {
    throw new Error(`Cabinet ${cabinet.id} has unsupported module pixel geometry.`)
  }
  return { moduleColumns: cabinet.moduleColumns, moduleRows: cabinet.moduleRows, modulePixelWidth, modulePixelHeight }
}

function screenView(project: LedMapProjectV2, screen: ProjectScreen): ScreenView | null {
  const gridId = screen.cabinetGridOrder[0]
  if (!gridId) return null
  const grid = project.design.cabinetGrids.find(entry => entry.id === gridId)
  const placement = project.design.composition.placements.find(entry => entry.screenId === screen.id)
  if (!grid || !placement) return null
  const sourceCabinets = project.design.cabinets.filter(cabinet => cabinet.gridId === grid.id)
    .sort((a, b) => a.row - b.row || a.column - b.column)
  const config: CabinetEngineConfig = Object.freeze({
    columns: grid.columns, rows: grid.rows,
    ...moduleGeometry(project, sourceCabinets, grid),
    ordering: Object.freeze({ ...grid.ordering }),
  })
  const occupied = new Set(sourceCabinets.map(cabinet => `${cabinet.column},${cabinet.row}`))
  const path = cabinetOrder(config).filter(cell => occupied.has(`${cell.column},${cell.row}`))
  const cabinets = sourceCabinets.map(cabinet => {
    const id = cabinetLabel(screen.id, cabinet.id)
    return Object.freeze({ sourceId: cabinet.id, id, label: cabinet.label, column: cabinet.column, row: cabinet.row,
      index: path.findIndex(cell => cell.column === cabinet.column && cell.row === cabinet.row) })
  })
  const modulesPerCabinet = safeProduct('Modules per cabinet', config.moduleColumns, config.moduleRows)
  const pixelCount = safeProduct('Pixel count', screen.resolution.width, screen.resolution.height)
  const nextCabinetSerial = grid.nextCabinetSerial ?? cabinets.reduce((maximum, cabinet) => Math.max(maximum, numericCabinetSerial(cabinet.id)), 0) + 1
  return Object.freeze({ screen, grid, config, x: placement.x, y: placement.y,
    cabinets: Object.freeze(cabinets), nextCabinetSerial, path: Object.freeze(path), modulesPerCabinet,
    totalModules: cabinets.length === 0 ? 0 : safeProduct('Total modules', cabinets.length, modulesPerCabinet), pixelCount })
}

export function projectV2WorkspaceReadModel(project: LedMapProjectV2): Project {
  return Object.freeze({ model: project, screens: Object.freeze(project.design.screens.map(screen => screenView(project, screen))
    .filter((view): view is ScreenView => view !== null)) })
}

export function screenWidth(screen: ScreenView): number { return gridPixelSize(screen.grid).width }
export function screenHeight(screen: ScreenView): number { return gridPixelSize(screen.grid).height }
export function findScreen(project: Project, screenId: string): ScreenView | undefined {
  return project.screens.find(screen => screen.screen.id === screenId)
}
export function maxColumnsForRows(screen: ScreenView, rows: number): number { return maxPreviewColumns(rows, screen.modulesPerCabinet) }
export function maxRowsForColumns(screen: ScreenView, columns: number): number { return maxPreviewRows(columns, screen.modulesPerCabinet) }

export function projectBounds(project: Project): Bounds {
  const geometry = selectCompositionGeometry(project.model)
  if (!geometry.bounds) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  return { ...geometry.bounds }
}

export function screenBounds(screen: ScreenView): Bounds {
  const width = screenWidth(screen)
  const height = screenHeight(screen)
  return { left: screen.x, top: screen.y, right: screen.x + width, bottom: screen.y + height, width, height }
}

export function hitTest(project: Project, point: { x: number; y: number }): Hit | null {
  for (let index = project.screens.length - 1; index >= 0; index -= 1) {
    const screen = project.screens[index]!
    const width = screenWidth(screen)
    const height = screenHeight(screen)
    if (point.x < screen.x || point.y < screen.y || point.x >= screen.x + width || point.y >= screen.y + height) continue
    const column = Math.floor((point.x - screen.x) / screen.grid.cabinetWidth)
    const row = Math.floor((point.y - screen.y) / screen.grid.cabinetHeight)
    const cabinet = screen.cabinets.find(entry => entry.column === column && entry.row === row) ?? null
    return { screenIndex: index, screen, cabinet }
  }
  return null
}
