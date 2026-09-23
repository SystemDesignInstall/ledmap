import { asModuleId, type CabinetId, type ModuleId } from './ids.js'
import { assertNonNegativeInteger, assertPositiveInteger, isWithinBounds } from './coordinates.js'
import { DomainError } from './errors.js'
import type { Cabinet } from './cabinet.js'

export interface Module {
  readonly id: ModuleId
  readonly cabinet: CabinetId
  readonly column: number
  readonly row: number
  readonly localX: number
  readonly localY: number
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

export interface CreateModuleInput {
  id: string
  cabinet: Cabinet
  column: number
  row: number
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
}

export function modulePixelCount(module: Pick<Module, 'pixelWidth' | 'pixelHeight'>): number {
  return module.pixelWidth * module.pixelHeight
}

export function createModule(input: CreateModuleInput): Module {
  const { cabinet } = input
  assertNonNegativeInteger('column', input.column)
  assertNonNegativeInteger('row', input.row)
  assertPositiveInteger('width', input.width)
  assertPositiveInteger('height', input.height)
  assertPositiveInteger('pixelWidth', input.pixelWidth)
  assertPositiveInteger('pixelHeight', input.pixelHeight)

  if (input.column >= cabinet.moduleColumns || input.row >= cabinet.moduleRows) {
    throw new DomainError('MODULE_OUT_OF_RANGE', `module position column ${input.column}, row ${input.row} exceeds cabinet module grid ${cabinet.moduleColumns}x${cabinet.moduleRows}`)
  }

  const localX = input.column * input.width
  const localY = input.row * input.height
  const cabinetBounds = { width: cabinet.width, height: cabinet.height }
  if (!isWithinBounds({ x: localX, y: localY }, cabinetBounds)) {
    throw new DomainError('MODULE_OUT_OF_RANGE', `module origin ${localX},${localY} is outside cabinet ${cabinet.width}x${cabinet.height}`)
  }

  const sizeConsistent =
    cabinet.moduleColumns * input.width === cabinet.width &&
    cabinet.moduleRows * input.height === cabinet.height
  if (!sizeConsistent) {
    throw new DomainError('MODULE_GRID_MISMATCH', `${cabinet.moduleColumns}x${cabinet.moduleRows} modules of ${input.width}x${input.height} px do not tile the cabinet ${cabinet.width}x${cabinet.height} px`)
  }

  const pixelConsistent =
    cabinet.moduleColumns * input.pixelWidth === cabinet.pixelWidth &&
    cabinet.moduleRows * input.pixelHeight === cabinet.pixelHeight
  if (!pixelConsistent) {
    throw new DomainError('MODULE_PIXEL_MISMATCH', `${cabinet.moduleColumns}x${cabinet.moduleRows} modules of ${input.pixelWidth}x${input.pixelHeight} px do not tile the cabinet LED array ${cabinet.pixelWidth}x${cabinet.pixelHeight} px`)
  }

  return {
    id: asModuleId(input.id),
    cabinet: cabinet.id,
    column: input.column,
    row: input.row,
    localX,
    localY,
    width: input.width,
    height: input.height,
    pixelWidth: input.pixelWidth,
    pixelHeight: input.pixelHeight,
  }
}