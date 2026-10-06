import type { LiveOutputRegion } from '../shared/ipc.js'
import type { TestBounds, TestFrame, TestPoint, TestPrimitive } from '../shared/test-engine.js'
import type { Camera } from './canvas.js'

interface CachedImage {
  readonly image: HTMLImageElement
  loaded: Promise<void>
  ready: boolean
  readonly redraws: Map<HTMLCanvasElement, () => void>
}

const imageCache = new Map<string, CachedImage>()

function chartImage(dataUrl: string, redraw: (() => void) | null, canvas?: HTMLCanvasElement): CachedImage {
  const cached = imageCache.get(dataUrl)
  if (cached) {
    if (!cached.ready && redraw && canvas) cached.redraws.set(canvas, redraw)
    return cached
  }
  const image = new Image()
  const entry: CachedImage = { image, loaded: Promise.resolve(), ready: false, redraws: new Map() }
  if (redraw && canvas) entry.redraws.set(canvas, redraw)
  entry.loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      entry.ready = true
      for (const callback of entry.redraws.values()) callback()
      entry.redraws.clear()
      resolve()
    }
    image.onerror = () => reject(new Error('Unable to decode Screen logo.'))
    image.src = dataUrl
  })
  void entry.loaded.catch(() => undefined)
  imageCache.set(dataUrl, entry)
  return entry
}

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return { width: rect.width, height: rect.height, dpr }
}

function point(camera: Camera, value: TestPoint): TestPoint {
  return { x: value.x * camera.zoom + camera.offsetX, y: value.y * camera.zoom + camera.offsetY }
}

function drawPrimitive(ctx: CanvasRenderingContext2D, camera: Camera, primitive: TestPrimitive, redraw: (() => void) | null = null): void {
  if (primitive.kind === 'rect' || primitive.kind === 'gradient') {
    const origin = point(camera, primitive.bounds)
    const width = primitive.bounds.width * camera.zoom
    const height = primitive.bounds.height * camera.zoom
    if (primitive.kind === 'gradient') {
      const end = primitive.direction === 'horizontal'
        ? { x: origin.x + width, y: origin.y }
        : { x: origin.x, y: origin.y + height }
      const gradient = ctx.createLinearGradient(origin.x, origin.y, end.x, end.y)
      gradient.addColorStop(0, primitive.from)
      gradient.addColorStop(1, primitive.to)
      ctx.fillStyle = gradient
      ctx.fillRect(origin.x, origin.y, width, height)
      return
    }
    if (primitive.fill) {
      ctx.fillStyle = primitive.fill
      ctx.fillRect(origin.x, origin.y, width, height)
    }
    if (primitive.stroke) {
      ctx.strokeStyle = primitive.stroke
      ctx.lineWidth = Math.max(1, (primitive.lineWidth ?? 1) * camera.zoom)
      ctx.strokeRect(origin.x, origin.y, width, height)
    }
    return
  }
  if (primitive.kind === 'line') {
    const from = point(camera, primitive.from)
    const to = point(camera, primitive.to)
    ctx.strokeStyle = primitive.color
    ctx.lineWidth = Math.max(1, primitive.lineWidth * camera.zoom)
    ctx.setLineDash(primitive.dash?.map(value => value * camera.zoom) ?? [])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.setLineDash([])
    return
  }
  if (primitive.kind === 'text') {
    const position = point(camera, primitive.point)
    ctx.save()
    ctx.fillStyle = primitive.color
    if (primitive.shadow) {
      ctx.shadowColor = '#000000'
      ctx.shadowBlur = 3
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1
    }
    ctx.font = `600 ${Math.max(8, Math.min(48, primitive.size * camera.zoom))}px "Segoe UI", sans-serif`
    ctx.textAlign = primitive.align ?? 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(primitive.text, position.x, position.y)
    ctx.restore()
    return
  }
  if (primitive.kind === 'image') {
    const cached = chartImage(primitive.dataUrl, redraw, ctx.canvas)
    if (!cached.ready) return
    const origin = point(camera, primitive.bounds)
    ctx.drawImage(cached.image, origin.x, origin.y, primitive.bounds.width * camera.zoom, primitive.bounds.height * camera.zoom)
    return
  }
  const position = point(camera, primitive.point)
  const size = Math.max(4, camera.zoom)
  ctx.fillStyle = primitive.color
  ctx.fillRect(position.x - size / 2, position.y - size / 2, size, size)
}

export function drawFramePrimitives(
  ctx: CanvasRenderingContext2D,
  frame: TestFrame,
  camera: Camera,
  redraw: (() => void) | null = null,
  layer: 'all' | 'regular' | 'screen-title' = 'all',
): void {
  for (const primitive of frame.primitives) {
    const title = primitive.kind === 'text' && primitive.role === 'screen-title'
    if (layer === 'regular' && title || layer === 'screen-title' && !title) continue
    drawPrimitive(ctx, camera, primitive, redraw)
  }
}

export function drawTestFrame(canvas: HTMLCanvasElement, frame: TestFrame, camera: Camera): void {
  const { width, height, dpr } = canvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const chart = frame.pattern === 'composition-chart' || frame.pattern === 'composition-mask'
  if (chart) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
  }
  if (frame.background !== 'transparent') {
    ctx.fillStyle = frame.background
    if (chart) {
      const origin = point(camera, frame.bounds)
      ctx.fillRect(origin.x, origin.y, frame.bounds.width * camera.zoom, frame.bounds.height * camera.zoom)
    } else ctx.fillRect(0, 0, width, height)
  }
  if (chart) {
    const origin = point(camera, frame.bounds)
    ctx.save()
    ctx.beginPath()
    ctx.rect(origin.x, origin.y, frame.bounds.width * camera.zoom, frame.bounds.height * camera.zoom)
    ctx.clip()
  }
  drawFramePrimitives(ctx, frame, camera, () => drawTestFrame(canvas, frame, camera))
  if (chart) ctx.restore()
}

export interface TestOutputOverlay {
  readonly id: string
  readonly region: LiveOutputRegion
  readonly color: string
}

export function drawClippedTestFrame(
  canvas: HTMLCanvasElement,
  frame: TestFrame,
  camera: Camera,
  clip: LiveOutputRegion,
): void {
  const { width, height, dpr } = canvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  const origin = point(camera, clip)
  ctx.save()
  ctx.beginPath()
  ctx.rect(origin.x, origin.y, clip.width * camera.zoom, clip.height * camera.zoom)
  ctx.clip()
  if (frame.background !== 'transparent') {
    ctx.fillStyle = frame.background
    ctx.fillRect(origin.x, origin.y, clip.width * camera.zoom, clip.height * camera.zoom)
  }
  drawFramePrimitives(ctx, frame, camera, () => drawClippedTestFrame(canvas, frame, camera, clip))
  ctx.restore()
}

export function drawTestOutputOverlays(canvas: HTMLCanvasElement, overlays: readonly TestOutputOverlay[], camera: Camera): void {
  if (overlays.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const overlay of overlays) {
    const origin = point(camera, overlay.region)
    const width = overlay.region.width * camera.zoom
    const height = overlay.region.height * camera.zoom
    ctx.strokeStyle = overlay.color
    ctx.lineWidth = 2
    ctx.setLineDash([7, 5])
    ctx.strokeRect(origin.x, origin.y, width, height)
    ctx.setLineDash([])
    ctx.fillStyle = overlay.color
    ctx.font = '600 11px "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(overlay.id, origin.x + 5, origin.y - 5)
  }
}

export async function drawTestFrameAtActualPixels(canvas: HTMLCanvasElement, frame: TestFrame, bounds: TestBounds): Promise<void> {
  await Promise.all(frame.primitives.filter(primitive => primitive.kind === 'image').map(primitive => chartImage(primitive.dataUrl, null).loaded))
  canvas.width = bounds.width
  canvas.height = bounds.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PNG Canvas 2D context is unavailable.')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, bounds.width, bounds.height)
  if (frame.background !== 'transparent') {
    ctx.fillStyle = frame.background
    ctx.fillRect(0, 0, bounds.width, bounds.height)
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, bounds.width, bounds.height)
  ctx.clip()
  const camera: Camera = { zoom: 1, offsetX: -bounds.x, offsetY: -bounds.y }
  drawFramePrimitives(ctx, frame, camera)
  ctx.restore()
}
