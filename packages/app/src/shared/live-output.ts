import type { DisplayDescriptor, LiveOutputRegion, LiveOutputScaleMode } from './ipc.js'

export const MAX_LIVE_OUTPUTS = 4

export function liveOutputId(index: number): string {
  if (!Number.isSafeInteger(index) || index < 1 || index > MAX_LIVE_OUTPUTS) throw new Error(`Output index must be between 1 and ${MAX_LIVE_OUTPUTS}.`)
  return `output-${index}`
}

export function validateLiveOutputId(value: unknown): string {
  if (typeof value !== 'string' || !/^output-[1-4]$/.test(value)) throw new Error('Invalid Live Output identity.')
  return value
}

export function validateLiveOutputRegion(value: unknown): LiveOutputRegion {
  if (value === null || typeof value !== 'object') throw new Error('Invalid Live Output source region.')
  const region = value as Partial<LiveOutputRegion>
  if (!Number.isSafeInteger(region.x) || !Number.isSafeInteger(region.y)) {
    throw new Error('Live Output X/Y must be signed whole numbers.')
  }
  if (!Number.isSafeInteger(region.width) || !Number.isSafeInteger(region.height) || region.width! <= 0 || region.height! <= 0) {
    throw new Error('Live Output Width/Height must be positive whole numbers.')
  }
  return { x: region.x!, y: region.y!, width: region.width!, height: region.height! }
}

export function validateLiveOutputScaleMode(value: unknown): LiveOutputScaleMode {
  if (value !== 'actual' && value !== 'fit') throw new Error('Invalid Live Output scale mode.')
  return value
}

export function displayPickerLabel(display: DisplayDescriptor): string {
  const primary = display.primary ? ' · Primary' : ''
  return `${display.id} · ${display.resolution.width}×${display.resolution.height} · bounds ${display.bounds.x},${display.bounds.y} ${display.bounds.width}×${display.bounds.height} · ${display.scaleFactor}×${primary}`
}

export function calculateLiveOutputCamera(
  viewport: { readonly width: number; readonly height: number },
  region: LiveOutputRegion,
  scaleMode: LiveOutputScaleMode,
  displayScaleFactor: number,
): { readonly zoom: number; readonly offsetX: number; readonly offsetY: number } {
  if (!Number.isFinite(displayScaleFactor) || displayScaleFactor <= 0) throw new Error('Display scale factor must be positive.')
  const zoom = scaleMode === 'fit'
    ? Math.min(viewport.width / region.width, viewport.height / region.height)
    : 1 / displayScaleFactor
  return {
    zoom,
    offsetX: (viewport.width - region.width * zoom) / 2 - region.x * zoom,
    offsetY: (viewport.height - region.height * zoom) / 2 - region.y * zoom,
  }
}
