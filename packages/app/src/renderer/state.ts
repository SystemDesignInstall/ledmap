import {
  cabinetIndex, cabinetOrder, createCabinetGrid, createScreen, decomposeCabinetPixel,
  DomainError, asScreenId, asCabinetGridId,
  type CabinetEngineConfig, type CabinetGrid, type Screen, type GridOrdering, type GridPosition,
} from '@ledmap/core'

export const dimensionFields = [
  'columns', 'rows', 'moduleColumns', 'moduleRows', 'modulePixelWidth', 'modulePixelHeight',
] as const
export type DimensionField = typeof dimensionFields[number]
export type Draft = Readonly<Record<DimensionField, string> & { ordering: GridOrdering }>
export interface PreviewCabinet extends GridPosition {
  readonly id: string
  readonly index: number
}
export interface Snapshot {
  readonly config: CabinetEngineConfig
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly cabinets: readonly PreviewCabinet[]
  readonly path: readonly GridPosition[]
  readonly moduleCount: number
  readonly pixelCount: number
}
export interface AlphaState {
  readonly snapshot: Snapshot | null
  readonly errors: Readonly<Partial<Record<DimensionField | 'form', string>>>
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

export function applyDraft(previous: Snapshot | null, draft: Draft): AlphaState {
  const errors: Partial<Record<DimensionField | 'form', string>> = {}
  const dimensions = {} as Record<DimensionField, number>
  for (const field of dimensionFields) {
    const value = Number(draft[field])
    if (!draft[field].trim() || !Number.isSafeInteger(value) || value <= 0) {
      errors[field] = 'Enter a positive whole number within the safe integer range.'
    }
    dimensions[field] = value
  }
  if (Object.keys(errors).length) return { snapshot: previous, errors }
  try {
    const config: CabinetEngineConfig = { ...dimensions, ordering: { ...draft.ordering } }
    decomposeCabinetPixel(config, { x: 0, y: 0 })
    const cabinetCount = safeProduct('Cabinet count', config.columns, config.rows)
    const moduleCount = safeProduct('Modules per cabinet', config.moduleColumns, config.moduleRows)
    const totalModules = safeProduct('Total modules', cabinetCount, moduleCount)
    const cabinetWidth = safeProduct('Cabinet width', config.moduleColumns, config.modulePixelWidth)
    const cabinetHeight = safeProduct('Cabinet height', config.moduleRows, config.modulePixelHeight)
    const width = safeProduct('Screen width', config.columns, cabinetWidth)
    const height = safeProduct('Screen height', config.rows, cabinetHeight)
    const pixelCount = safeProduct('Screen pixel count', width, height)
    if (cabinetCount > 1024) throw new Error('Preview supports up to 1024 cabinets. Reduce Columns or Rows.')
    if (totalModules > 65536) throw new Error('Preview supports up to 65,536 modules in total. Reduce the grid or module count.')
    const grid = createCabinetGrid({
      id: 'grid-1', screen: asScreenId('screen-1'), name: 'Cabinet Grid',
      columns: config.columns, rows: config.rows, cabinetWidth, cabinetHeight, ordering: config.ordering,
    })
    const screen = createScreen({
      id: 'screen-1', name: 'Screen 1', resolution: { width, height }, cabinetGrids: [asCabinetGridId('grid-1')],
    })
    const path = cabinetOrder(config)
    const cabinets: PreviewCabinet[] = []
    for (let row = 0; row < config.rows; row += 1) {
      for (let column = 0; column < config.columns; column += 1) {
        cabinets.push({ column, row, id: `C${String(cabinets.length + 1).padStart(2, '0')}`, index: cabinetIndex(config, { column, row }) })
      }
    }
    return { snapshot: { config, grid, screen, cabinets, path, moduleCount, pixelCount }, errors: {} }
  } catch (error) {
    errors.form = error instanceof DomainError
      ? `Invalid cabinet configuration: ${error.message}`
      : error instanceof Error ? error.message : 'Unable to update the preview.'
    return { snapshot: previous, errors }
  }
}
