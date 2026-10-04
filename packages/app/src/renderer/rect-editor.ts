export interface EditorRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ViewCamera {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function fitCamera(viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number, padding = 48): ViewCamera {
  const width = Math.max(1, viewportWidth - padding)
  const height = Math.max(1, viewportHeight - padding)
  const scale = Math.max(0.000001, Math.min(width / Math.max(1, worldWidth), height / Math.max(1, worldHeight)))
  return { x: (viewportWidth - worldWidth * scale) / 2, y: (viewportHeight - worldHeight * scale) / 2, scale }
}

export function zoomAt(camera: ViewCamera, point: { readonly x: number; readonly y: number }, factor: number): ViewCamera {
  const scale = Math.min(32, Math.max(0.02, camera.scale * factor))
  const ratio = scale / camera.scale
  return { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio }
}

export function worldFromScreen(camera: ViewCamera, point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
  return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale }
}

export function screenFromWorld(camera: ViewCamera, point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
  return { x: camera.x + point.x * camera.scale, y: camera.y + point.y * camera.scale }
}

export function snapThresholdWorld(camera: ViewCamera, screenPx = 6): number {
  return screenPx / camera.scale
}

function handlePoint(rect: EditorRect, handle: ResizeHandle): { readonly x: number; readonly y: number } {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  switch (handle) {
    case 'nw': return { x: rect.x, y: rect.y }
    case 'n': return { x: cx, y: rect.y }
    case 'ne': return { x: rect.x + rect.width, y: rect.y }
    case 'e': return { x: rect.x + rect.width, y: cy }
    case 'se': return { x: rect.x + rect.width, y: rect.y + rect.height }
    case 's': return { x: cx, y: rect.y + rect.height }
    case 'sw': return { x: rect.x, y: rect.y + rect.height }
    case 'w': return { x: rect.x, y: cy }
  }
}

export function hitResizeHandle(rect: EditorRect, pointPx: { readonly x: number; readonly y: number }, camera: ViewCamera, radiusPx = 6): ResizeHandle | null {
  let best: ResizeHandle | null = null
  let bestDist = (radiusPx + 1) ** 2
  for (const handle of HANDLES) {
    const world = handlePoint(rect, handle)
    const screen = screenFromWorld(camera, world)
    const dist = (screen.x - pointPx.x) ** 2 + (screen.y - pointPx.y) ** 2
    if (dist <= radiusPx * radiusPx && dist < bestDist) {
      best = handle
      bestDist = dist
    }
  }
  return best
}

export function containsPoint(rect: EditorRect, world: { readonly x: number; readonly y: number }): boolean {
  return world.x >= rect.x && world.x < rect.x + rect.width && world.y >= rect.y && world.y < rect.y + rect.height
}

export interface ResizeOptions {
  readonly aspectLock?: boolean
  readonly minSize?: number
}

export function resizeRect(rect: EditorRect, handle: ResizeHandle, dx: number, dy: number, options: ResizeOptions = {}): EditorRect {
  const min = Math.max(1, options.minSize ?? 1)
  let { x, y, width, height } = rect
  const aspect = options.aspectLock ? rect.width / Math.max(1, rect.height) : null
  if (handle.includes('w')) {
    const nextX = Math.min(x + width - min, x + dx)
    width += x - nextX
    x = nextX
  }
  if (handle.includes('e')) width = Math.max(min, width + dx)
  if (handle.includes('n')) {
    const nextY = Math.min(y + height - min, y + dy)
    height += y - nextY
    y = nextY
  }
  if (handle.includes('s')) height = Math.max(min, height + dy)
  if (aspect !== null && (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se')) {
    if (width / Math.max(1, height) > aspect) width = Math.max(min, Math.round(height * aspect))
    else height = Math.max(min, Math.round(width / aspect))
    if (handle.includes('w')) x = rect.x + rect.width - width
    if (handle.includes('n')) y = rect.y + rect.height - height
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.max(min, Math.round(width)), height: Math.max(min, Math.round(height)) }
}

function nearestSnap(value: number, candidates: readonly number[], threshold: number): number | null {
  let best: number | null = null
  for (const candidate of candidates) {
    if (Math.abs(value - candidate) > threshold) continue
    if (best === null || Math.abs(value - candidate) < Math.abs(value - best)) best = candidate
  }
  return best
}

export function snapMove(
  rect: EditorRect,
  dx: number,
  dy: number,
  others: readonly EditorRect[],
  bounds: EditorRect,
  camera: ViewCamera,
): { readonly x: number; readonly y: number } {
  const threshold = snapThresholdWorld(camera)
  const moved = { x: rect.x + dx, y: rect.y + dy }
  const verticals = [bounds.x, bounds.x + bounds.width, ...others.flatMap(item => [item.x, item.x + item.width])]
  const horizontals = [bounds.y, bounds.y + bounds.height, ...others.flatMap(item => [item.y, item.y + item.height])]
  const left = nearestSnap(moved.x, verticals, threshold)
  const right = nearestSnap(moved.x + rect.width, verticals, threshold)
  const top = nearestSnap(moved.y, horizontals, threshold)
  const bottom = nearestSnap(moved.y + rect.height, horizontals, threshold)
  let x = moved.x
  let y = moved.y
  if (left !== null && (right === null || Math.abs(moved.x - left) <= Math.abs(moved.x + rect.width - right))) x = left
  else if (right !== null) x = right - rect.width
  if (top !== null && (bottom === null || Math.abs(moved.y - top) <= Math.abs(moved.y + rect.height - bottom))) y = top
  else if (bottom !== null) y = bottom - rect.height
  return { x: Math.round(x), y: Math.round(y) }
}

export function snapResize(
  rect: EditorRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  others: readonly EditorRect[],
  bounds: EditorRect,
  camera: ViewCamera,
  options: ResizeOptions = {},
): EditorRect {
  const threshold = snapThresholdWorld(camera)
  const resized = resizeRect(rect, handle, dx, dy, options)
  const verticals = [bounds.x, bounds.x + bounds.width, ...others.flatMap(item => [item.x, item.x + item.width])]
  const horizontals = [bounds.y, bounds.y + bounds.height, ...others.flatMap(item => [item.y, item.y + item.height])]
  let { x, y, width, height } = resized
  if (handle.includes('e')) {
    const snapped = nearestSnap(x + width, verticals, threshold)
    if (snapped !== null) width = Math.max(1, Math.round(snapped - x))
  }
  if (handle.includes('w')) {
    const snapped = nearestSnap(resized.x, verticals, threshold)
    if (snapped !== null) {
      width = Math.max(1, Math.round(resized.x + resized.width - snapped))
      x = Math.round(resized.x + resized.width - width)
    }
  }
  if (handle.includes('s')) {
    const snapped = nearestSnap(y + height, horizontals, threshold)
    if (snapped !== null) height = Math.max(1, Math.round(snapped - y))
  }
  if (handle.includes('n')) {
    const snapped = nearestSnap(resized.y, horizontals, threshold)
    if (snapped !== null) {
      height = Math.max(1, Math.round(resized.y + resized.height - snapped))
      y = Math.round(resized.y + resized.height - height)
    }
  }
  return { x, y, width, height }
}
