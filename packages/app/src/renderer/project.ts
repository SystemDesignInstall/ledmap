import type { CabinetEngineConfig, CabinetGrid, Direction, GridPosition, Numbering, Screen } from '@ledmap/core'
import {
  buildSnapshot, gridPixelSize, initialDraft, maxPreviewColumns, maxPreviewRows,
  type Draft, type PreviewCabinet, type SnapshotIds,
} from './state.js'

export interface ScreenView {
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly config: CabinetEngineConfig
  readonly x: number
  readonly y: number
  readonly cabinets: readonly PreviewCabinet[]
  readonly nextCabinetSerial: number
  readonly path: readonly GridPosition[]
  readonly modulesPerCabinet: number
  readonly totalModules: number
  readonly pixelCount: number
}

export interface Project {
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
  readonly cabinet: PreviewCabinet | null
}

export function screenWidth(screen: ScreenView): number {
  return gridPixelSize(screen.grid).width
}

export function screenHeight(screen: ScreenView): number {
  return gridPixelSize(screen.grid).height
}

function buildScreenView(draft: Draft, ids: SnapshotIds, x: number, y: number, seed: ScreenView | null = null): ScreenView {
  const result = buildSnapshot(seed, draft, ids)
  const problem = result.errors.form ?? Object.values(result.errors).find(value => typeof value === 'string')
  if (problem) throw new Error(problem)
  const snapshot = result.snapshot
  if (!snapshot) throw new Error('Unable to build screen view.')
  return {
    screen: snapshot.screen,
    grid: snapshot.grid,
    config: snapshot.config,
    x,
    y,
    cabinets: snapshot.cabinets,
    nextCabinetSerial: snapshot.nextCabinetSerial,
    path: snapshot.path,
    modulesPerCabinet: snapshot.modulesPerCabinet,
    totalModules: snapshot.totalModules,
    pixelCount: snapshot.pixelCount,
  }
}

export function findScreen(project: Project, screenId: string): ScreenView | undefined {
  return project.screens.find(screen => screen.screen.id === screenId)
}

export function moveScreen(project: Project, screenId: string, dx: number, dy: number): Project {
  return {
    screens: project.screens.map(screen => screen.screen.id === screenId
      ? { ...screen, x: screen.x + dx, y: screen.y + dy }
      : screen),
  }
}

export function setScreenPosition(project: Project, screenId: string, x: number, y: number): Project {
  return {
    screens: project.screens.map(screen => screen.screen.id === screenId
      ? { ...screen, x, y }
      : screen),
  }
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

export function resizeScreenGrid(project: Project, screenId: string, columns: number, rows: number): Project {
  const screen = findScreen(project, screenId)
  if (!screen) throw new Error(`Unknown screen: ${screenId}`)
  assertGridDimension('Columns', columns)
  assertGridDimension('Rows', rows)
  const draft = draftFromConfig(screen.config, columns, rows)
  const ids: SnapshotIds = {
    screenId: screen.screen.id,
    gridId: screen.grid.id,
    screenName: screen.screen.name,
    gridName: screen.grid.name,
  }
  return {
    screens: project.screens.map(entry => entry.screen.id === screenId
      ? buildScreenView(draft, ids, entry.x, entry.y, entry)
      : entry),
  }
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
  const draft = draftFromConfig(config, screen.grid.columns, screen.grid.rows)
  const ids: SnapshotIds = {
    screenId: screen.screen.id,
    gridId: screen.grid.id,
    screenName: screen.screen.name,
    gridName: screen.grid.name,
  }
  const replacement = buildScreenView(draft, ids, screen.x, screen.y, screen)
  return {
    screens: project.screens.map(entry => entry.screen.id === screenId ? replacement : entry),
  }
}

export function maxColumnsForRows(screen: ScreenView, rows: number): number {
  return maxPreviewColumns(rows, screen.modulesPerCabinet)
}

export function maxRowsForColumns(screen: ScreenView, columns: number): number {
  return maxPreviewRows(columns, screen.modulesPerCabinet)
}

export function addScreen(project: Project, draft: Draft = initialDraft): Project {
  const next = project.screens.length + 1
  const previous = project.screens[project.screens.length - 1]
  const x = previous ? previous.x + 100 : 0
  const y = previous ? previous.y + 100 : 0
  const ids: SnapshotIds = {
    screenId: `screen-${next}`,
    gridId: `grid-${next}`,
    screenName: `Screen ${next}`,
    gridName: 'Cabinet Grid',
  }
  return { screens: [...project.screens, buildScreenView(draft, ids, x, y)] }
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
    if (point.x < screen.x || point.y < screen.y || point.x >= screen.x + w || point.y >= screen.y + h) {
      continue
    }
    const local = { x: point.x - screen.x, y: point.y - screen.y }
    const column = Math.floor(local.x / screen.grid.cabinetWidth)
    const row = Math.floor(local.y / screen.grid.cabinetHeight)
    if (column >= 0 && column < screen.grid.columns && row >= 0 && row < screen.grid.rows) {
      const cabinet = screen.cabinets.find(c => c.column === column && c.row === row) ?? null
      return { screenIndex: i, screen, cabinet }
    }
    return { screenIndex: i, screen, cabinet: null }
  }
  return null
}

export function createDemoProject(): Project {
  const defaults: Draft = initialDraft
  const screen2: Draft = { ...initialDraft, columns: '3', rows: '2' }
  const screen3: Draft = { ...initialDraft, columns: '4', rows: '2' }
  return {
    screens: [
      buildScreenView(defaults, { screenId: 'screen-1', gridId: 'grid-1', screenName: 'Screen 1', gridName: 'Cabinet Grid' }, 0, 0),
      buildScreenView(screen2, { screenId: 'screen-2', gridId: 'grid-2', screenName: 'Screen 2', gridName: 'Cabinet Grid' }, 700, 120),
      buildScreenView(screen3, { screenId: 'screen-3', gridId: 'grid-3', screenName: 'Screen 3', gridName: 'Cabinet Grid' }, 320, 620),
    ],
  }
}
