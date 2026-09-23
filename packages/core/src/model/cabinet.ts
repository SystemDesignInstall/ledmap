import { asCabinetId, type CabinetGridId, type CabinetId } from './ids.js'
import { assertNonNegativeInteger, assertPositiveInteger, createPoint, type Point } from './coordinates.js'

export interface Cabinet {
  readonly id: CabinetId
  readonly grid: CabinetGridId
  readonly column: number
  readonly row: number
  readonly origin: Point
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
}

export interface CreateCabinetInput {
  id: string
  grid: CabinetGridId
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  moduleColumns: number
  moduleRows: number
  rotation?: number
  flipH?: boolean
  flipV?: boolean
}

export function cabinetPixelCount(cabinet: Pick<Cabinet, 'pixelWidth' | 'pixelHeight'>): number {
  return cabinet.pixelWidth * cabinet.pixelHeight
}

export function createCabinet(input: CreateCabinetInput): Cabinet {
  assertNonNegativeInteger('column', input.column)
  assertNonNegativeInteger('row', input.row)
  assertNonNegativeInteger('x', input.x)
  assertNonNegativeInteger('y', input.y)
  assertPositiveInteger('width', input.width)
  assertPositiveInteger('height', input.height)
  assertPositiveInteger('pixelWidth', input.pixelWidth)
  assertPositiveInteger('pixelHeight', input.pixelHeight)
  assertPositiveInteger('moduleColumns', input.moduleColumns)
  assertPositiveInteger('moduleRows', input.moduleRows)
  return {
    id: asCabinetId(input.id),
    grid: input.grid,
    column: input.column,
    row: input.row,
    origin: createPoint(input.x, input.y),
    width: input.width,
    height: input.height,
    pixelWidth: input.pixelWidth,
    pixelHeight: input.pixelHeight,
    moduleColumns: input.moduleColumns,
    moduleRows: input.moduleRows,
    rotation: input.rotation ?? 0,
    flipH: input.flipH ?? false,
    flipV: input.flipV ?? false,
  }
}