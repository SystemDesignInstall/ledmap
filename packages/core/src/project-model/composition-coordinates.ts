import { DomainError } from '../model/errors.js'
import { selectCompositionGeometry } from './composition.js'
import type { LedMapProjectV2, PixelRect } from './types.js'

function checkRect(rect: PixelRect): void {
  if (!Number.isSafeInteger(rect.x) || !Number.isSafeInteger(rect.y) ||
      !Number.isSafeInteger(rect.width) || rect.width < 1 || !Number.isSafeInteger(rect.height) || rect.height < 1 ||
      !Number.isSafeInteger(rect.x + rect.width) || !Number.isSafeInteger(rect.y + rect.height)) {
    throw new DomainError('COMPOSITION_COORDINATE_INVALID', 'Rectangle edges must use safe integers with positive size')
  }
}

function contains(outer: PixelRect, inner: PixelRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
}

function screenPlacement(project: LedMapProjectV2, screenId: string): PixelRect {
  const screen = project.design.screens.find(value => value.id === screenId)
  const placement = selectCompositionGeometry(project).screens.find(value => value.screenId === screenId)
  if (!screen || !placement) throw new DomainError('COMPOSITION_SCREEN_UNPLACED', `Screen ${screenId} has no usable Composition placement`)
  if (screen.resolution.width !== placement.width || screen.resolution.height !== placement.height) {
    throw new DomainError('COMPOSITION_PIXEL_SCALE_UNSUPPORTED', `Screen ${screenId} chart geometry differs from its pixel resolution`)
  }
  return placement
}

export function assertCompositionRasterFrame(project: LedMapProjectV2, frame: PixelRect): void {
  checkRect(frame)
  const geometry = selectCompositionGeometry(project)
  if (geometry.screens.length === 0 || geometry.unplacedScreenIds.length > 0 || geometry.skippedScreenIds.length > 0) {
    throw new DomainError('COMPOSITION_SCREEN_UNPLACED', 'Every Screen requires a usable Composition placement')
  }
  for (const placement of geometry.screens) {
    if (!contains(frame, placement)) throw new DomainError('COMPOSITION_COORDINATE_OUTSIDE', 'A Screen lies outside the exported Composition frame')
  }
}

export function screenRectToCompositionRaster(project: LedMapProjectV2, screenId: string, rect: PixelRect, frame: PixelRect): PixelRect {
  checkRect(rect)
  checkRect(frame)
  const placement = screenPlacement(project, screenId)
  if (!contains({ x: 0, y: 0, width: placement.width, height: placement.height }, rect)) {
    throw new DomainError('COMPOSITION_COORDINATE_OUTSIDE', `Source rectangle exceeds Screen ${screenId}`)
  }
  const translated = { ...rect, x: placement.x + rect.x, y: placement.y + rect.y }
  checkRect(translated)
  if (!contains(frame, translated)) throw new DomainError('COMPOSITION_COORDINATE_OUTSIDE', 'Source rectangle exceeds the exported Composition frame')
  return Object.freeze({ ...rect, x: translated.x - frame.x, y: translated.y - frame.y })
}

export function compositionRasterRectToScreen(project: LedMapProjectV2, screenId: string, rect: PixelRect, frame: PixelRect): PixelRect {
  checkRect(rect)
  checkRect(frame)
  const placement = screenPlacement(project, screenId)
  if (!contains({ x: 0, y: 0, width: frame.width, height: frame.height }, rect)) {
    throw new DomainError('COMPOSITION_COORDINATE_OUTSIDE', 'Input rectangle exceeds the exported Composition raster')
  }
  const translated = { ...rect, x: frame.x + rect.x, y: frame.y + rect.y }
  checkRect(translated)
  if (!contains(placement, translated)) throw new DomainError('COMPOSITION_COORDINATE_OUTSIDE', `Input rectangle exceeds bound Screen ${screenId}`)
  return Object.freeze({ ...rect, x: translated.x - placement.x, y: translated.y - placement.y })
}
