import { asCabinetGridId, type CabinetGridId, type ScreenId } from './ids.js'
import { assertPositiveInteger } from './coordinates.js'
import { defaultGridOrdering, type GridOrdering } from './ordering.js'

export interface CabinetGrid {
  readonly id: CabinetGridId
  readonly screen: ScreenId
  readonly name: string
  readonly columns: number
  readonly rows: number
  readonly cabinetWidth: number
  readonly cabinetHeight: number
  readonly ordering: GridOrdering
}

export interface CreateCabinetGridInput {
  id: string
  screen: ScreenId
  name: string
  columns: number
  rows: number
  cabinetWidth: number
  cabinetHeight: number
  ordering?: GridOrdering
}

export function gridCabinetCount(grid: Pick<CabinetGrid, 'columns' | 'rows'>): number {
  return grid.columns * grid.rows
}

export function createCabinetGrid(input: CreateCabinetGridInput): CabinetGrid {
  assertPositiveInteger('columns', input.columns)
  assertPositiveInteger('rows', input.rows)
  assertPositiveInteger('cabinetWidth', input.cabinetWidth)
  assertPositiveInteger('cabinetHeight', input.cabinetHeight)
  return {
    id: asCabinetGridId(input.id),
    screen: input.screen,
    name: input.name,
    columns: input.columns,
    rows: input.rows,
    cabinetWidth: input.cabinetWidth,
    cabinetHeight: input.cabinetHeight,
    ordering: input.ordering ?? defaultGridOrdering,
  }
}