import { DomainError } from '../model/errors.js'
import type { ScreenId } from '../model/ids.js'
import type { LedMapProjectV2 } from './types.js'

export interface CompositionScreenRect {
  readonly screenId: ScreenId
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly right: number
  readonly bottom: number
}

export interface CompositionOverlapRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly right: number
  readonly bottom: number
}

export interface CompositionOverlap {
  readonly a: ScreenId
  readonly b: ScreenId
  readonly rect: CompositionOverlapRect
}

export interface CompositionBounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface CompositionGeometry {
  readonly screens: readonly CompositionScreenRect[]
  readonly bounds: CompositionBounds | null
  readonly screenCount: number
  readonly placedCount: number
  readonly unplacedScreenIds: readonly ScreenId[]
  readonly skippedScreenIds: readonly ScreenId[]
  readonly totalOutputPixels: number
  readonly boundingArea: number
  readonly overlaps: readonly CompositionOverlap[]
}

function safeProduct(label: string, ...values: number[]): number {
  const result = values.reduce((product, value) => product * value, 1)
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} exceeds the safe integer range.`)
  }
  return result
}

function safeSum(label: string, ...values: number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} exceeds the safe integer range.`)
  }
  return result
}

export function selectCompositionGeometry(project: LedMapProjectV2): CompositionGeometry {
  const screensById = new Map(project.design.screens.map(screen => [screen.id, screen] as const))
  const gridsById = new Map(project.design.cabinetGrids.map(grid => [grid.id, grid] as const))
  const seen = new Set<string>()
  for (const placement of project.design.composition.placements) {
    if (!screensById.has(placement.screenId)) {
      throw new DomainError('PROJECT_UNKNOWN_SCREEN', `CompositionPlacement references unknown Screen ${placement.screenId}`)
    }
    if (seen.has(placement.screenId)) {
      throw new DomainError(
        'PROJECT_DUPLICATE_COMPOSITION_PLACEMENT',
        `Screen ${placement.screenId} has more than one CompositionPlacement`,
      )
    }
    seen.add(placement.screenId)
    if (!Number.isSafeInteger(placement.x) || !Number.isSafeInteger(placement.y) || placement.x < 0 || placement.y < 0) {
      throw new DomainError(
        'PROJECT_INVALID_GEOMETRY',
        `Screen ${placement.screenId} placement must use non-negative safe integers`,
      )
    }
  }
  const rects: CompositionScreenRect[] = []
  const skipped: ScreenId[] = []
  for (const placement of project.design.composition.placements) {
    const screen = screensById.get(placement.screenId)
    const firstGridId = screen?.cabinetGridOrder[0]
    const grid = firstGridId === undefined ? undefined : gridsById.get(firstGridId)
    if (!screen || !grid) {
      skipped.push(placement.screenId)
      continue
    }
    if (
      !Number.isSafeInteger(grid.columns) || grid.columns < 1 ||
      !Number.isSafeInteger(grid.rows) || grid.rows < 1 ||
      !Number.isSafeInteger(grid.cabinetWidth) || grid.cabinetWidth < 1 ||
      !Number.isSafeInteger(grid.cabinetHeight) || grid.cabinetHeight < 1
    ) {
      throw new DomainError('PROJECT_INVALID_GEOMETRY', `CabinetGrid ${grid.id} must use positive safe integers`)
    }
    const width = safeProduct(`Screen ${screen.id} width`, grid.columns, grid.cabinetWidth)
    const height = safeProduct(`Screen ${screen.id} height`, grid.rows, grid.cabinetHeight)
    const right = safeSum(`Screen ${screen.id} right`, placement.x, width)
    const bottom = safeSum(`Screen ${screen.id} bottom`, placement.y, height)
    rects.push(Object.freeze({
      screenId: screen.id, x: placement.x, y: placement.y, width, height, right, bottom,
    }))
  }
  const unplaced = project.design.screens
    .filter(screen => !seen.has(screen.id))
    .map(screen => screen.id)
  let bounds: CompositionBounds | null = null
  if (rects.length > 0) {
    const left = Math.min(...rects.map(rect => rect.x))
    const top = Math.min(...rects.map(rect => rect.y))
    const right = Math.max(...rects.map(rect => rect.right))
    const bottom = Math.max(...rects.map(rect => rect.bottom))
    bounds = Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top })
  }
  const totalOutputPixels = safeSum(
    'Total composition pixels',
    ...rects.map(rect => safeProduct(`Screen ${rect.screenId} pixels`, rect.width, rect.height)),
  )
  const boundingArea = bounds === null ? 0 : safeProduct('Composition bounding area', bounds.width, bounds.height)
  const overlaps: CompositionOverlap[] = []
  for (let index = 0; index < rects.length; index += 1) {
    for (let other = index + 1; other < rects.length; other += 1) {
      const a = rects[index]!
      const b = rects[other]!
      const x = Math.max(a.x, b.x)
      const y = Math.max(a.y, b.y)
      const right = Math.min(a.right, b.right)
      const bottom = Math.min(a.bottom, b.bottom)
      if (right > x && bottom > y) {
        overlaps.push(Object.freeze({
          a: a.screenId,
          b: b.screenId,
          rect: Object.freeze({ x, y, width: right - x, height: bottom - y, right, bottom }),
        }))
      }
    }
  }
  return Object.freeze({
    screens: Object.freeze(rects),
    bounds,
    screenCount: project.design.screens.length,
    placedCount: rects.length,
    unplacedScreenIds: Object.freeze(unplaced),
    skippedScreenIds: Object.freeze(skipped),
    totalOutputPixels,
    boundingArea,
    overlaps: Object.freeze(overlaps),
  })
}
