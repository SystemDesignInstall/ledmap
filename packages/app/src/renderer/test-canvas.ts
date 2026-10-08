import type { LiveOutputRegion } from '../shared/ipc.js'
import type { TestBounds, TestFrame, TestPoint, TestPrimitive } from '../shared/test-engine.js'
import type { Camera } from './canvas.js'
import { drawCabinetBorder } from './cabinet-border.js'
import { drawViewportCabinetLabel } from './cabinet-label-renderer.js'

interface CachedImage {
  readonly image: HTMLImageElement
  loaded: Promise<void>
  ready: boolean
  readonly redraws: Map<HTMLCanvasElement, () => void>
}

const imageCache = new Map<string, CachedImage>()
const MAX_CACHED_IMAGES = 32

function evictOldestImage(): void {
  const oldest = imageCache.keys().next()
  if (!oldest.done) imageCache.delete(oldest.value)
}

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
    image.onerror = () => {
      imageCache.delete(dataUrl)
      entry.redraws.clear()
      reject(new Error('Unable to decode Screen logo.'))
    }
    image.src = dataUrl
  })
  void entry.loaded.catch(() => undefined)
  if (imageCache.size >= MAX_CACHED_IMAGES) evictOldestImage()
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

function fillPixelAlignedRect(ctx: CanvasRenderingContext2D, camera: Camera, bounds: TestBounds): void {
  const transform = ctx.getTransform()
  const origin = point(camera, bounds)
  if (transform.b !== 0 || transform.c !== 0 || transform.a <= 0 || transform.d <= 0) {
    ctx.fillRect(origin.x, origin.y, bounds.width * camera.zoom, bounds.height * camera.zoom)
    return
  }
  const left = Math.round(origin.x * transform.a + transform.e)
  const top = Math.round(origin.y * transform.d + transform.f)
  const right = Math.round(((bounds.x + bounds.width) * camera.zoom + camera.offsetX) * transform.a + transform.e)
  const bottom = Math.round(((bounds.y + bounds.height) * camera.zoom + camera.offsetY) * transform.d + transform.f)
  if (right <= left || bottom <= top) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.fillRect(left, top, right - left, bottom - top)
  ctx.restore()
}

function textFont(primitive: Extract<TestPrimitive, { kind: 'text' }>, zoom: number): string {
  const size = primitive.role === 'screen-information'
    ? Math.min(48, primitive.size * zoom)
    : Math.max(8, Math.min(48, primitive.size * zoom))
  return `600 ${size}px "Segoe UI", sans-serif`
}

function hardPrimitiveBounds(ctx: CanvasRenderingContext2D, camera: Camera, primitive: TestPrimitive): TestBounds {
  if (primitive.kind === 'line') {
    const from = point(camera, primitive.from)
    const to = point(camera, primitive.to)
    const inset = Math.max(1, primitive.lineWidth * camera.zoom) / 2 + 2
    return { x: Math.min(from.x, to.x) - inset, y: Math.min(from.y, to.y) - inset,
      width: Math.abs(to.x - from.x) + inset * 2, height: Math.abs(to.y - from.y) + inset * 2 }
  }
  if (primitive.kind === 'circle') {
    const center = point(camera, primitive.center)
    const radius = primitive.radius * camera.zoom + Math.max(1, primitive.lineWidth * camera.zoom) / 2 + 2
    return { x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2 }
  }
  if (primitive.kind === 'rect') {
    const origin = point(camera, primitive.bounds)
    const inset = Math.max(1, (primitive.lineWidth ?? 1) * camera.zoom) / 2 + 2
    return { x: origin.x - inset, y: origin.y - inset,
      width: primitive.bounds.width * camera.zoom + inset * 2,
      height: primitive.bounds.height * camera.zoom + inset * 2 }
  }
  if (primitive.kind === 'text') {
    const position = point(camera, primitive.point)
    ctx.save()
    ctx.font = textFont(primitive, camera.zoom)
    ctx.textAlign = primitive.align ?? 'left'
    ctx.textBaseline = 'middle'
    const metrics = ctx.measureText(primitive.text)
    ctx.restore()
    return { x: position.x - metrics.actualBoundingBoxLeft - 2,
      y: position.y - metrics.actualBoundingBoxAscent - 2,
      width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + 4,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 4 }
  }
  throw new Error('Unsupported pixel-perfect primitive.')
}

function drawHardPrimitive(ctx: CanvasRenderingContext2D, camera: Camera, primitive: TestPrimitive): void {
  const bounds = hardPrimitiveBounds(ctx, camera, primitive)
  const left = Math.max(0, Math.floor(bounds.x))
  const top = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(ctx.canvas.width, Math.ceil(bounds.x + bounds.width))
  const bottom = Math.min(ctx.canvas.height, Math.ceil(bounds.y + bounds.height))
  if (right <= left || bottom <= top) return
  const source: TestPrimitive = primitive.kind === 'text' ? { ...primitive, shadow: false }
    : primitive.kind === 'rect' ? { kind: 'rect', bounds: primitive.bounds, stroke: primitive.stroke!,
      ...(primitive.lineWidth === undefined ? {} : { lineWidth: primitive.lineWidth }) } : primitive
  const mask = document.createElement('canvas')
  for (let y = top; y < bottom; y += 512) {
    for (let x = left; x < right; x += 512) {
      mask.width = Math.min(512, right - x)
      mask.height = Math.min(512, bottom - y)
      const maskCtx = mask.getContext('2d', { willReadFrequently: true })
      if (!maskCtx) throw new Error('PNG mask Canvas 2D context is unavailable.')
      maskCtx.setTransform(1, 0, 0, 1, -x, -y)
      drawPrimitive(maskCtx, camera, source)
      const pixels = maskCtx.getImageData(0, 0, mask.width, mask.height).data
      const output = ctx.getImageData(x, y, mask.width, mask.height)
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3]! < 128) continue
        output.data[index] = pixels[index]!
        output.data[index + 1] = pixels[index + 1]!
        output.data[index + 2] = pixels[index + 2]!
        output.data[index + 3] = 255
      }
      ctx.putImageData(output, x, y)
    }
  }
}

function drawPrimitive(ctx: CanvasRenderingContext2D, camera: Camera, primitive: TestPrimitive,
  redraw: (() => void) | null = null, viewportLabels = false, pixelPerfect = false): void {
  if (primitive.kind === 'cabinet-border') {
    drawCabinetBorder(ctx, camera, primitive.bounds, primitive.color)
    return
  }
  if (primitive.kind === 'rect' || primitive.kind === 'gradient') {
    ctx.save()
    if (primitive.kind === 'rect') ctx.globalAlpha *= primitive.opacity ?? 1
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
      ctx.restore()
      return
    }
    if (primitive.fill) {
      ctx.fillStyle = primitive.fill
      if (pixelPerfect || primitive.pixelAligned) fillPixelAlignedRect(ctx, camera, primitive.bounds)
      else ctx.fillRect(origin.x, origin.y, width, height)
    }
    if (primitive.stroke) {
      if (pixelPerfect) drawHardPrimitive(ctx, camera, primitive)
      else {
        ctx.strokeStyle = primitive.stroke
        ctx.lineWidth = Math.max(1, (primitive.lineWidth ?? 1) * camera.zoom)
        ctx.strokeRect(origin.x, origin.y, width, height)
      }
    }
    ctx.restore()
    return
  }
  if (primitive.kind === 'circle') {
    if (pixelPerfect) {
      drawHardPrimitive(ctx, camera, primitive)
      return
    }
    const center = point(camera, primitive.center)
    ctx.strokeStyle = primitive.color
    ctx.lineWidth = Math.max(1, primitive.lineWidth * camera.zoom)
    ctx.beginPath()
    ctx.arc(center.x, center.y, primitive.radius * camera.zoom, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  if (primitive.kind === 'line') {
    if (pixelPerfect) {
      drawHardPrimitive(ctx, camera, primitive)
      return
    }
    const from = point(camera, primitive.from)
    const to = point(camera, primitive.to)
    if (viewportLabels && primitive.role === 'screen-center-guide') {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.setLineDash([8, 5])
      ctx.strokeStyle = '#15181a'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.strokeStyle = primitive.color
      ctx.lineWidth = Math.max(2, primitive.lineWidth * camera.zoom)
      ctx.stroke()
      ctx.restore()
      return
    }
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
    if (viewportLabels && primitive.role === 'screen-title' && primitive.cellBounds && primitive.cellBounds.height * camera.zoom < 48) return
    const position = point(camera, primitive.point)
    if (viewportLabels && primitive.role === 'cabinet-label' && primitive.cellBounds) {
      drawViewportCabinetLabel(ctx, primitive.text, position.x, position.y,
        primitive.cellBounds.width * camera.zoom, primitive.cellBounds.height * camera.zoom,
        primitive.color, primitive.shadow)
      return
    }
    if (pixelPerfect) {
      drawHardPrimitive(ctx, camera, primitive)
      return
    }
    ctx.save()
    ctx.fillStyle = primitive.color
    if (primitive.shadow) {
      ctx.shadowColor = '#000000'
      ctx.shadowBlur = 3
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1
    }
    ctx.font = textFont(primitive, camera.zoom)
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
    ctx.save()
    ctx.globalAlpha *= primitive.opacity ?? 1
    if (pixelPerfect) ctx.imageSmoothingEnabled = false
    ctx.drawImage(cached.image, origin.x, origin.y, primitive.bounds.width * camera.zoom, primitive.bounds.height * camera.zoom)
    ctx.restore()
    return
  }
  const position = point(camera, primitive.point)
  const size = Math.max(4, camera.zoom)
  ctx.fillStyle = primitive.color
  ctx.fillRect(position.x - size / 2, position.y - size / 2, size, size)
}

interface CompactInformationBadge {
  readonly rect: TestPrimitive & { readonly kind: 'rect' }
  readonly texts: readonly (TestPrimitive & { readonly kind: 'text' })[]
  readonly bounds: TestBounds
  readonly title: string
}

export function compactInformationBadges(frame: TestFrame, camera: Camera): readonly CompactInformationBadge[] {
  const badges: CompactInformationBadge[] = []
  for (let index = 0; index < frame.primitives.length; index += 1) {
    const rect = frame.primitives[index]
    if (rect?.kind !== 'rect' || rect.role !== 'screen-information') continue
    const texts: (TestPrimitive & { readonly kind: 'text' })[] = []
    for (let next = index + 1; next < frame.primitives.length; next += 1) {
      const value = frame.primitives[next]
      if (value?.kind !== 'text' || value.role !== 'screen-information') break
      texts.push(value)
    }
    if (!texts[0] || texts[0].size * camera.zoom >= 10) continue
    const origin = point(camera, rect.bounds)
    const availableWidth = rect.bounds.width * camera.zoom
    const availableHeight = rect.bounds.height * camera.zoom
    if (availableWidth < 18 || availableHeight < 14) continue
    badges.push({ rect, texts, bounds: { x: origin.x, y: origin.y,
      width: Math.min(48, availableWidth), height: Math.min(20, availableHeight) },
    title: texts.map(value => value.text).join('\n') })
  }
  return badges
}

function drawCompactInformationBadge(ctx: CanvasRenderingContext2D, badge: CompactInformationBadge): void {
  const { x, y, width, height } = badge.bounds
  ctx.save()
  ctx.fillStyle = '#f7941e'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = '#15181a'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(width >= 40 ? 'Info' : 'i', x + width / 2, y + height / 2)
  ctx.restore()
}

export function drawFramePrimitives(
  ctx: CanvasRenderingContext2D,
  frame: TestFrame,
  camera: Camera,
  redraw: (() => void) | null = null,
  layer: 'all' | 'regular' | 'screen-title' | 'screen-information' | 'screen-guide' = 'all',
  viewportLabels = false,
  showCabinetBorders = true,
  pixelPerfect = false,
): void {
  const badges = layer === 'screen-information' ? compactInformationBadges(frame, camera) : []
  const compactPrimitives = new Set<TestPrimitive>(badges.flatMap(badge => [badge.rect, ...badge.texts]))
  for (const primitive of frame.primitives) {
    if (!showCabinetBorders && primitive.kind === 'cabinet-border') continue
    if (compactPrimitives.has(primitive)) continue
    const title = primitive.kind === 'text' && primitive.role === 'screen-title'
    const information = (primitive.kind === 'text' || primitive.kind === 'rect') && primitive.role === 'screen-information'
    const guide = (primitive.kind === 'line' || primitive.kind === 'circle' || primitive.kind === 'rect') &&
      (primitive.role === 'screen-guide' || primitive.role === 'screen-center-guide')
    if (layer === 'regular' && (title || information || guide) || layer === 'screen-title' && !title ||
        layer === 'screen-information' && !information || layer === 'screen-guide' && !guide) continue
    drawPrimitive(ctx, camera, primitive, redraw, viewportLabels, pixelPerfect)
  }
  for (const badge of badges) drawCompactInformationBadge(ctx, badge)
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
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
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
  drawFramePrimitives(ctx, frame, camera, null, 'all', false, true, true)
  ctx.restore()
}
