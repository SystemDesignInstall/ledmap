import {
  cabinetIndex, cabinetOrder, createCabinetGrid, createScreen, decomposeCabinetPixel,
  DomainError, asScreenId,
  type CabinetEngineConfig, type CabinetGrid, type Screen, type GridOrdering, type GridPosition, type Size,
} from '@ledmap/core'

export const MAX_PREVIEW_CABINETS = 1024
export const MAX_PREVIEW_MODULES = 65536

export const dimensionFields = [
  'columns', 'rows', 'moduleColumns', 'moduleRows', 'modulePixelWidth', 'modulePixelHeight',
] as const
export type DimensionField = typeof dimensionFields[number]
export type Draft = Readonly<Record<DimensionField, string> & { ordering: GridOrdering }>
export interface PreviewCabinet extends GridPosition {
  readonly id: string
  readonly index: number
}
export interface CabinetSeed {
  readonly cabinets: readonly PreviewCabinet[]
  readonly nextCabinetSerial: number
}
export interface Snapshot extends CabinetSeed {
  readonly config: CabinetEngineConfig
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly path: readonly GridPosition[]
  readonly moduleCount: number
  readonly pixelCount: number
}
export interface AlphaState {
  readonly snapshot: Snapshot | null
  readonly errors: Readonly<Partial<Record<DimensionField | 'form', string>>>
}
export interface SnapshotIds {
  readonly screenId: string
  readonly gridId: string
  readonly screenName: string
  readonly gridName: string
}

export const defaultSnapshotIds: SnapshotIds = {
  screenId: 'screen-1',
  gridId: 'grid-1',
  screenName: 'Screen 1',
  gridName: 'Cabinet Grid',
}

export const initialDraft: Draft = {
  columns: '4', rows: '3', moduleColumns: '4', moduleRows: '4',
  modulePixelWidth: '32', modulePixelHeight: '32',
  ordering: { numbering: 'row', direction: 'left-to-right', snake: true, startCorner: 'top-left' },
}

export function changeNumbering(ordering: GridOrdering, numbering: GridOrdering['numbering']): GridOrdering {
  const reverse = ordering.direction === 'right-to-left' || ordering.direction === 'bottom-to-top'
  return {
    ...ordering, numbering,
    direction: numbering === 'row'
      ? (reverse ? 'right-to-left' : 'left-to-right')
      : (reverse ? 'bottom-to-top' : 'top-to-bottom'),
  }
}

function safeProduct(label: string, ...values: number[]): number {
  const result = values.reduce((product, value) => product * value, 1)
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} exceeds the safe integer range.`)
  return result
}

export function gridPixelSize(grid: Pick<CabinetGrid, 'columns' | 'rows' | 'cabinetWidth' | 'cabinetHeight'>): Size {
  return {
    width: safeProduct('Screen width', grid.columns, grid.cabinetWidth),
    height: safeProduct('Screen height', grid.rows, grid.cabinetHeight),
  }
}

function cabinetCellKey(column: number, row: number): string {
  return `${column},${row}`
}

function cabinetId(serial: number): string {
  return `C${String(serial).padStart(2, '0')}`
}

export function buildCabinets(config: CabinetEngineConfig, seed: CabinetSeed | null): { cabinets: PreviewCabinet[]; nextCabinetSerial: number } {
  const existing = new Map<string, string>()
  for (const cabinet of seed?.cabinets ?? []) existing.set(cabinetCellKey(cabinet.column, cabinet.row), cabinet.id)
  let serial = seed?.nextCabinetSerial ?? 1
  const cabinets: PreviewCabinet[] = []
  for (let row = 0; row < config.rows; row += 1) {
    for (let column = 0; column < config.columns; column += 1) {
      const reused = existing.get(cabinetCellKey(column, row))
      const id = reused ?? cabinetId(serial)
      if (reused === undefined) serial += 1
      cabinets.push({ column, row, id, index: cabinetIndex(config, { column, row }) })
    }
  }
  return { cabinets, nextCabinetSerial: serial }
}

export function maxPreviewColumns(rows: number, modulesPerCabinet: number): number {
  if (rows < 1) return 1
  return Math.max(1, Math.min(
    Math.floor(MAX_PREVIEW_CABINETS / rows),
    Math.floor(MAX_PREVIEW_MODULES / (rows * modulesPerCabinet)),
  ))
}

export function maxPreviewRows(columns: number, modulesPerCabinet: number): number {
  if (columns < 1) return 1
  return Math.max(1, Math.min(
    Math.floor(MAX_PREVIEW_CABINETS / columns),
    Math.floor(MAX_PREVIEW_MODULES / (columns * modulesPerCabinet)),
  ))
}

export function buildSnapshot(seed: CabinetSeed | null, draft: Draft, ids: SnapshotIds = defaultSnapshotIds): AlphaState {
  const errors: Partial<Record<DimensionField | 'form', string>> = {}
  const dimensions = {} as Record<DimensionField, number>
  for (const field of dimensionFields) {
    const value = Number(draft[field])
    if (!draft[field].trim() || !Number.isSafeInteger(value) || value <= 0) {
      errors[field] = 'Enter a positive whole number within the safe integer range.'
    }
    dimensions[field] = value
  }
  if (Object.keys(errors).length) return { snapshot: previousSnapshot(seed), errors }
  try {
    const config: CabinetEngineConfig = { ...dimensions, ordering: { ...draft.ordering } }
    decomposeCabinetPixel(config, { x: 0, y: 0 })
    const cabinetCount = safeProduct('Cabinet count', config.columns, config.rows)
    const moduleCount = safeProduct('Modules per cabinet', config.moduleColumns, config.moduleRows)
    const totalModules = safeProduct('Total modules', cabinetCount, moduleCount)
    const cabinetWidth = safeProduct('Cabinet width', config.moduleColumns, config.modulePixelWidth)
    const cabinetHeight = safeProduct('Cabinet height', config.moduleRows, config.modulePixelHeight)
    if (cabinetCount > MAX_PREVIEW_CABINETS) throw new Error(`Preview supports up to ${MAX_PREVIEW_CABINETS} cabinets. Reduce Columns or Rows.`)
    if (totalModules > MAX_PREVIEW_MODULES) throw new Error(`Preview supports up to ${MAX_PREVIEW_MODULES} modules in total. Reduce the grid or module count.`)
    const size = gridPixelSize({ columns: config.columns, rows: config.rows, cabinetWidth, cabinetHeight })
    const pixelCount = safeProduct('Screen pixel count', size.width, size.height)
    const grid = createCabinetGrid({
      id: ids.gridId, screen: asScreenId(ids.screenId), name: ids.gridName,
      columns: config.columns, rows: config.rows, cabinetWidth, cabinetHeight, ordering: config.ordering,
    })
    const screen = createScreen({
      id: ids.screenId, name: ids.screenName, resolution: size, cabinetGrids: [grid.id],
    })
    const path = cabinetOrder(config)
    const { cabinets, nextCabinetSerial } = buildCabinets(config, seed)
    return {
      snapshot: {
        config, grid, screen, cabinets, nextCabinetSerial, path, moduleCount, pixelCount,
      },
      errors: {},
    }
  } catch (error) {
    errors.form = error instanceof DomainError
      ? `Invalid cabinet configuration: ${error.message}`
      : error instanceof Error ? error.message : 'Unable to update the preview.'
    return { snapshot: previousSnapshot(seed), errors }
  }
}

function isSnapshot(seed: CabinetSeed | null): seed is Snapshot {
  return seed !== null && 'grid' in seed
}

function previousSnapshot(seed: CabinetSeed | null): Snapshot | null {
  return isSnapshot(seed) ? seed : null
}

export function applyDraft(previous: Snapshot | null, draft: Draft): AlphaState {
  return buildSnapshot(previous, draft)
}
