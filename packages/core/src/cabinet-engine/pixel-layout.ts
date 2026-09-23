import { DomainError } from '../model/errors.js'
import type { CabinetOrderingInput } from './cabinet-order.js'

export interface CabinetPixelLayoutConfig {
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly modulePixelWidth: number
  readonly modulePixelHeight: number
}

export type CabinetEngineConfig = CabinetOrderingInput & CabinetPixelLayoutConfig

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError('INVALID_DIMENSION', `${name} must be a positive safe integer, got ${value}`)
  }
}

export function moduleCount(layout: Pick<CabinetPixelLayoutConfig, 'moduleColumns' | 'moduleRows'>): number {
  assertPositiveSafeInteger('moduleColumns', layout.moduleColumns)
  assertPositiveSafeInteger('moduleRows', layout.moduleRows)
  const count = layout.moduleColumns * layout.moduleRows
  assertPositiveSafeInteger('moduleCount', count)
  return count
}

export function modulePixelCount(layout: Pick<CabinetPixelLayoutConfig, 'modulePixelWidth' | 'modulePixelHeight'>): number {
  assertPositiveSafeInteger('modulePixelWidth', layout.modulePixelWidth)
  assertPositiveSafeInteger('modulePixelHeight', layout.modulePixelHeight)
  const count = layout.modulePixelWidth * layout.modulePixelHeight
  assertPositiveSafeInteger('modulePixelCount', count)
  return count
}

export function cabinetPixelLayoutDimensions(layout: CabinetPixelLayoutConfig) {
  const modules = moduleCount(layout)
  const pixels = modulePixelCount(layout)
  const cabinetPixelWidth = layout.moduleColumns * layout.modulePixelWidth
  const cabinetPixelHeight = layout.moduleRows * layout.modulePixelHeight
  const cabinetPixelCount = modules * pixels
  assertPositiveSafeInteger('cabinetPixelWidth', cabinetPixelWidth)
  assertPositiveSafeInteger('cabinetPixelHeight', cabinetPixelHeight)
  assertPositiveSafeInteger('cabinetPixelCount', cabinetPixelCount)
  return {
    moduleCount: modules,
    modulePixelCount: pixels,
    cabinetPixelWidth,
    cabinetPixelHeight,
    cabinetPixelCount,
  } as const
}
