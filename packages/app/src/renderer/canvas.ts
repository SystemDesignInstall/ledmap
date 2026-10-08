import { type CabinetEngineConfig, type GridPosition } from '@ledmap/core'
import { gridPixelSize } from './state.js'
import type { Bounds, Project, ScreenView, SelectedObject } from './v2-view-model.js'
import type { AlignmentGuide, ProjectGuide, SelectionBox } from './layout-interaction.js'
import type { TestBounds, TestFrame } from '../shared/test-engine.js'
import { drawFramePrimitives } from './test-canvas.js'
import { cabinetDisplayLabel, type CabinetLabelMode } from '../shared/cabinet-labels.js'
import { drawCabinetBorder } from './cabinet-border.js'
import { drawViewportCabinetLabel } from './cabinet-label-renderer.js'

export interface Camera {
  readonly zoom: number
  readonly offsetX: number
  readonly offsetY: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export type ResizeHandle = 'right' | 'bottom' | 'bottomRight'

export interface ResizePreview {
  readonly screenId: string
  readonly columns: number
  readonly rows: number
}

export interface View {
  readonly mode: 'all' | 'active'
  readonly selection: SelectedObject | null
  readonly selectedScreenIds: readonly string[]
  readonly activeScreenId: string | null
  readonly resizePreview: ResizePreview | null
  readonly alignmentGuides: readonly AlignmentGuide[]
  readonly projectGuides: readonly ProjectGuide[]
  readonly selectedGuideId: string | null
  readonly marquee: SelectionBox | null
  readonly overlays: OverlayVisibility
  readonly chartFrame?: TestBounds | null
  readonly drawing: TestFrame
  readonly creationPreview?: { readonly frame: TestFrame; readonly bounds: TestBounds } | null
  readonly transparentScreens: readonly TestBounds[]
  readonly cleanView: boolean
  readonly cabinetLines: Readonly<Record<string, boolean>>
  readonly cabinetLineColors: Readonly<Record<string, string | undefined>>
  readonly cabinetLabelModes: Readonly<Record<string, CabinetLabelMode | null>>
}

export interface OverlayVisibility {
  readonly cabinets: boolean
  readonly modules: boolean
  readonly coordinates: boolean
  readonly editorLabels: boolean
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 8

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function toScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.offsetX, y: point.y * camera.zoom + camera.offsetY }
}

export function toProject(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.offsetX) / camera.zoom, y: (point.y - camera.offsetY) / camera.zoom }
}

export function fitCamera(bounds: Bounds, width: number, height: number, padding = 80): Camera {
  const bw = Math.max(bounds.width, 1)
  const bh = Math.max(bounds.height, 1)
  const scale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh)
  const zoom = clampZoom(scale)
  const offsetX = width / 2 - (bounds.left + bw / 2) * zoom
  const offsetY = height / 2 - (bounds.top + bh / 2) * zoom
  return { zoom, offsetX, offsetY }
}

export function zoomAt(camera: Camera, point: Point, factor: number): Camera {
  const project = toProject(camera, point)
  const zoom = clampZoom(camera.zoom * factor)
  return { zoom, offsetX: point.x - project.x * zoom, offsetY: point.y - project.y * zoom }
}

interface ScreenRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface GridShape {
  readonly columns: number
  readonly rows: number
  readonly width: number
  readonly height: number
}

const RESIZE_HANDLE_HIT_PX = 8

export function screenShape(screen: ScreenView, columns: number, rows: number): GridShape {
  const size = gridPixelSize({
    columns, rows, cabinetWidth: screen.grid.cabinetWidth, cabinetHeight: screen.grid.cabinetHeight,
  })
  return { columns, rows, width: size.width, height: size.height }
}

function screenRectPx(camera: Camera, screen: ScreenView, shape: GridShape): ScreenRect {
  const topLeft = toScreen(camera, { x: screen.x, y: screen.y })
  return { left: topLeft.x, top: topLeft.y, width: shape.width * camera.zoom, height: shape.height * camera.zoom }
}

export function screenResizeHandles(camera: Camera, screen: ScreenView, shape: GridShape): ReadonlyArray<{ readonly handle: ResizeHandle; readonly point: Point }> {
  const rect = screenRectPx(camera, screen, shape)
  return [
    { handle: 'right', point: { x: rect.left + rect.width, y: rect.top + rect.height / 2 } },
    { handle: 'bottom', point: { x: rect.left + rect.width / 2, y: rect.top + rect.height } },
    { handle: 'bottomRight', point: { x: rect.left + rect.width, y: rect.top + rect.height } },
  ]
}

export function resizeHandleHit(camera: Camera, screen: ScreenView, shape: GridShape, point: Point): ResizeHandle | null {
  let best: { handle: ResizeHandle; distance: number } | null = null
  for (const candidate of screenResizeHandles(camera, screen, shape)) {
    const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y)
    if (distance > RESIZE_HANDLE_HIT_PX) continue
    if (!best || distance < best.distance) best = { handle: candidate.handle, distance }
  }
  return best ? best.handle : null
}

export function resizeHandleCursor(handle: ResizeHandle): string {
  if (handle === 'right') return 'col-resize'
  if (handle === 'bottom') return 'row-resize'
  return 'se-resize'
}

const ACCENT = '#f7941e'
const ACCENT_HOVER = '#ffa940'
const PENDING_FILL = '#1d2022'
const PENDING_EDGE = '#454b4f'
const MODULE_LINE = '#34383b'
const CABINET_EDGE = '#4a5055'
const SCREEN_EDGE = '#454b4f'
const MIN_CABINET_LABEL_CELL_PX = 20

function cellCenterPx(camera: Camera, screen: ScreenView, cell: GridPosition): Point {
  const x = screen.x + (cell.column + .5) * screen.grid.cabinetWidth
  const y = screen.y + (cell.row + .5) * screen.grid.cabinetHeight
  return toScreen(camera, { x, y })
}

export function cabinetCenterPx(camera: Camera, screen: ScreenView, cabinet: GridPosition): Point {
  return cellCenterPx(camera, screen, cabinet)
}

export function cabinetLabelVisible(camera: Camera, screen: ScreenView): boolean {
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  return cw >= MIN_CABINET_LABEL_CELL_PX && ch >= MIN_CABINET_LABEL_CELL_PX
}

export function cabinetLabelHit(camera: Camera, screen: ScreenView, cabinet: { column: number; row: number }, point: Point): boolean {
  if (!cabinetLabelVisible(camera, screen)) return false
  const p = cabinetCenterPx(camera, screen, cabinet)
  const halfWidth = Math.min(30, screen.grid.cabinetWidth * camera.zoom / 2)
  const halfHeight = Math.min(26, screen.grid.cabinetHeight * camera.zoom / 2)
  return point.x >= p.x - halfWidth && point.x <= p.x + halfWidth
    && point.y >= p.y - halfHeight && point.y <= p.y + halfHeight
}

export function screenBoundaryHit(camera: Camera, screen: ScreenView, point: Point): boolean {
  const rect = screenRectPx(camera, screen, screenShape(screen, screen.grid.columns, screen.grid.rows))
  const frame = 6
  const inside = point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height
  if (!inside) return false
  const edge = Math.min(
    Math.abs(point.x - rect.left),
    Math.abs(point.x - (rect.left + rect.width)),
    Math.abs(point.y - rect.top),
    Math.abs(point.y - (rect.top + rect.height)),
  )
  return edge <= frame
}

function drawBackgroundGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
  const step = 256
  const start = toProject(camera, { x: 0, y: 0 })
  const end = toProject(camera, { x: width, y: height })
  const firstX = Math.floor(start.x / step) * step
  const lastX = Math.ceil(end.x / step) * step
  const firstY = Math.floor(start.y / step) * step
  const lastY = Math.ceil(end.y / step) * step
  ctx.strokeStyle = '#202527'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let px = firstX; px <= lastX; px += step) {
    const sx = toScreen(camera, { x: px, y: 0 }).x
    if (sx >= -1 && sx <= width + 1) {
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, height)
    }
  }
  for (let py = firstY; py <= lastY; py += step) {
    const sy = toScreen(camera, { x: 0, y: py }).y
    if (sy >= -1 && sy <= height + 1) {
      ctx.moveTo(0, sy)
      ctx.lineTo(width, sy)
    }
  }
  ctx.stroke()
}

function drawOriginAxes(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
  const origin = toScreen(camera, { x: 0, y: 0 })
  ctx.save()
  ctx.strokeStyle = '#454b4f'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (origin.x >= 0 && origin.x <= width) {
    ctx.moveTo(origin.x, 0)
    ctx.lineTo(origin.x, height)
  }
  if (origin.y >= 0 && origin.y <= height) {
    ctx.moveTo(0, origin.y)
    ctx.lineTo(width, origin.y)
  }
  ctx.stroke()
  if (origin.x >= 0 && origin.x <= width && origin.y >= 0 && origin.y <= height) {
    ctx.fillStyle = '#8b9195'
    ctx.font = '11px "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('0, 0', origin.x + 5, origin.y + 4)
  }
  ctx.restore()
}

function previewConfig(screen: ScreenView, shape: GridShape): CabinetEngineConfig {
  return { ...screen.config, columns: shape.columns, rows: shape.rows }
}

function drawCabinetGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screen: ScreenView,
  shape: GridShape,
  overlays: OverlayVisibility,
  showCabinetLines: boolean,
  cabinetLineColor: string | undefined,
  labelMode: CabinetLabelMode | null,
): boolean {
  const rect = screenRectPx(camera, screen, shape)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  const config = previewConfig(screen, shape)
  const modulesVisible = cw / config.moduleColumns >= 5 && ch / config.moduleRows >= 5
  const labelsVisible = cabinetLabelVisible(camera, screen)
  const existing = new Map<string, string>()
  for (const cabinet of screen.cabinets) existing.set(`${cabinet.column},${cabinet.row}`, cabinet.id)
  for (let row = 0; row < shape.rows; row += 1) {
    for (let column = 0; column < shape.columns; column += 1) {
      const x = rect.left + column * cw
      const y = rect.top + row * ch
      const id = existing.get(`${column},${row}`)
      if (showCabinetLines && id === undefined) {
        ctx.fillStyle = PENDING_FILL
        ctx.fillRect(x, y, cw, ch)
      }
      if (id !== undefined && overlays.modules && modulesVisible) {
        ctx.strokeStyle = MODULE_LINE
        ctx.beginPath()
        for (let c = 1; c < config.moduleColumns; c += 1) {
          ctx.moveTo(x + c * cw / config.moduleColumns, y)
          ctx.lineTo(x + c * cw / config.moduleColumns, y + ch)
        }
        for (let r = 1; r < config.moduleRows; r += 1) {
          ctx.moveTo(x, y + r * ch / config.moduleRows)
          ctx.lineTo(x + cw, y + r * ch / config.moduleRows)
        }
        ctx.stroke()
      }
      if (showCabinetLines) {
        drawCabinetBorder(ctx, camera, { x: screen.x + column * screen.grid.cabinetWidth, y: screen.y + row * screen.grid.cabinetHeight,
          width: screen.grid.cabinetWidth, height: screen.grid.cabinetHeight }, cabinetLineColor ?? (id === undefined ? PENDING_EDGE : CABINET_EDGE), id === undefined)
      }
    }
  }
  if (labelsVisible && overlays.editorLabels && labelMode !== null) {
    drawCabinetLabels(ctx, camera, screen, shape, labelMode)
  }
  return overlays.editorLabels && labelMode !== null && !labelsVisible || overlays.modules && !modulesVisible
}

function drawCabinetLabels(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screen: ScreenView,
  shape: GridShape,
  labelMode: CabinetLabelMode,
): void {
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  for (const cabinet of screen.cabinets) {
    if (cabinet.column >= shape.columns || cabinet.row >= shape.rows) continue
    const p = cellCenterPx(camera, screen, cabinet)
    const label = cabinetDisplayLabel(labelMode, shape.columns, shape.rows, cabinet)
    drawViewportCabinetLabel(ctx, label, p.x, p.y, cw, ch, '#f2f4f5', false, false)
  }
}

function drawScreenOutline(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, shape: GridShape, selected: boolean): void {
  const rect = screenRectPx(camera, screen, shape)
  ctx.strokeStyle = selected ? ACCENT : SCREEN_EDGE
  ctx.lineWidth = selected ? 2 : 1
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height)
  if (selected) {
    const size = 7
    for (const { point } of screenResizeHandles(camera, screen, shape)) {
      ctx.fillStyle = ACCENT
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size)
      ctx.strokeStyle = '#1d2022'
      ctx.lineWidth = 1
      ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size)
    }
  }
}

function drawScreenLabel(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screen: ScreenView,
  shape: GridShape,
  selected: boolean,
  previewing: boolean,
  coordinates: boolean,
  occupied: ScreenRect[],
): void {
  if (camera.zoom < 0.35 && !selected) return
  const rect = screenRectPx(camera, screen, shape)
  const format = new Intl.NumberFormat('en-US')
  const rw = format.format(shape.width)
  const rh = format.format(shape.height)
  const showCoords = coordinates
  const suffix = showCoords ? ` · ${screen.x}, ${screen.y}` : ''
  const pending = previewing ? ' · Preview' : ''
  let title = `${screen.screen.name}${suffix}${pending}`
  const resolution = `${rw}×${rh}`
  const maxLabelWidth = 280
  const paddingX = 22
  const gap = 8
  ctx.font = '600 12px "Segoe UI", sans-serif'
  let titleWidth = ctx.measureText(title).width
  ctx.font = '12px "Segoe UI", sans-serif'
  const resolutionWidth = ctx.measureText(resolution).width
  let width = titleWidth + gap + resolutionWidth + paddingX
  if (width > maxLabelWidth) {
    const available = Math.max(40, maxLabelWidth - gap - resolutionWidth - paddingX)
    ctx.font = '600 12px "Segoe UI", sans-serif'
    while (title.length > 4 && ctx.measureText(`${title}…`).width > available) {
      title = title.slice(0, -1)
    }
    title = `${title}…`
    titleWidth = ctx.measureText(title).width
    width = maxLabelWidth
  }
  const height = 26
  const x = Math.max(6, Math.min(rect.left, ctx.canvas.width / (window.devicePixelRatio || 1) - width - 6))
  const candidates = [rect.top - height - 4, rect.top + rect.height + 4, rect.top + 4]
  const viewportHeight = ctx.canvas.height / (window.devicePixelRatio || 1)
  const y = candidates.find(candidate => candidate >= 4 && candidate + height <= viewportHeight &&
    occupied.every(label => x + width <= label.left || label.left + label.width <= x ||
      candidate + height <= label.top || label.top + label.height <= candidate))
  if (y === undefined) return
  occupied.push({ left: x, top: y, width, height })
  ctx.fillStyle = selected ? '#2b241c' : '#26292b'
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = selected ? ACCENT : '#34383b'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, height)
  ctx.fillStyle = selected ? ACCENT_HOVER : '#f2f4f5'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.fillText(title, x + 11, y + height / 2 + .5)
  ctx.fillStyle = '#8b9195'
  ctx.textAlign = 'right'
  ctx.font = '12px "Segoe UI", sans-serif'
  ctx.fillText(resolution, x + width - 11, y + height / 2 + .5)
}

function drawCabinetSelection(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, selection: Extract<SelectedObject, { type: 'cabinet' }>): void {
  const cabinet = screen.cabinets.find(c => c.id === selection.id)
  if (!cabinet) return
  const shape = screenShape(screen, screen.grid.columns, screen.grid.rows)
  const rect = screenRectPx(camera, screen, shape)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.strokeRect(rect.left + cabinet.column * cw, rect.top + cabinet.row * ch, cw, ch)
}

function drawInteractionOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  guides: readonly AlignmentGuide[],
  projectGuides: readonly ProjectGuide[],
  selectedGuideId: string | null,
  marquee: SelectionBox | null,
): void {
  ctx.save()
  ctx.strokeStyle = ACCENT_HOVER
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  for (const guide of guides) {
    ctx.beginPath()
    if (guide.axis === 'x') {
      const x = toScreen(camera, { x: guide.value, y: 0 }).x
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    } else {
      const y = toScreen(camera, { x: 0, y: guide.value }).y
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (const guide of projectGuides) {
    const selected = guide.id === selectedGuideId
    ctx.strokeStyle = selected ? ACCENT : guide.locked ? '#5a6b80' : '#6b7176'
    ctx.lineWidth = selected ? 2 : 1
    ctx.beginPath()
    if (guide.orientation === 'vertical') {
      const x = toScreen(camera, { x: guide.position, y: 0 }).x
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    } else {
      const y = toScreen(camera, { x: 0, y: guide.position }).y
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
  }
  if (marquee) {
    const start = toScreen(camera, { x: marquee.left, y: marquee.top })
    const end = toScreen(camera, { x: marquee.right, y: marquee.bottom })
    ctx.fillStyle = 'rgba(247,148,30,.13)'
    ctx.strokeStyle = ACCENT
    ctx.setLineDash([4, 3])
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y)
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
  }
  ctx.restore()
}

const note = 'Cabinet details are simplified at this scale. Hover over a cabinet or zoom in to inspect.'

function drawTransparencyIndicator(ctx: CanvasRenderingContext2D, camera: Camera, bounds: TestBounds): void {
  const origin = toScreen(camera, bounds)
  const width = bounds.width * camera.zoom
  const height = bounds.height * camera.zoom
  const tile = 12
  const viewportWidth = ctx.canvas.width / (window.devicePixelRatio || 1)
  const viewportHeight = ctx.canvas.height / (window.devicePixelRatio || 1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(origin.x, origin.y, width, height)
  ctx.clip()
  ctx.fillStyle = '#d7dbe0'
  ctx.fillRect(origin.x, origin.y, width, height)
  ctx.fillStyle = '#aeb5bc'
  const left = Math.floor(Math.max(0, origin.x) / tile) * tile
  const top = Math.floor(Math.max(0, origin.y) / tile) * tile
  const right = Math.min(viewportWidth, origin.x + width)
  const bottom = Math.min(viewportHeight, origin.y + height)
  for (let y = top; y < bottom; y += tile) {
    for (let x = left; x < right; x += tile) {
      if ((Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0) ctx.fillRect(x, y, tile, tile)
    }
  }
  ctx.restore()
}

function alignProjectCanvas(canvas: HTMLCanvasElement): { width: number; height: number; ratio: number } {
  const ratio = window.devicePixelRatio || 1
  const viewport = canvas.parentElement
  if (!viewport) {
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    return { width, height, ratio }
  }
  const rect = viewport.getBoundingClientRect()
  const style = window.getComputedStyle(viewport)
  const borderLeft = parseFloat(style.borderLeftWidth) || 0
  const borderRight = parseFloat(style.borderRightWidth) || 0
  const borderTop = parseFloat(style.borderTopWidth) || 0
  const borderBottom = parseFloat(style.borderBottomWidth) || 0
  const originX = rect.left + borderLeft
  const originY = rect.top + borderTop
  const pixelWidth = Math.max(1, Math.round((rect.width - borderLeft - borderRight) * ratio))
  const pixelHeight = Math.max(1, Math.round((rect.height - borderTop - borderBottom) * ratio))
  const width = pixelWidth / ratio
  const height = pixelHeight / ratio
  canvas.style.left = String(Math.round(originX * ratio) / ratio - originX) + 'px'
  canvas.style.top = String(Math.round(originY * ratio) / ratio - originY) + 'px'
  canvas.style.width = String(width) + 'px'
  canvas.style.height = String(height) + 'px'
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  return { width, height, ratio }
}

export function drawProject(canvas: HTMLCanvasElement, project: Project, view: View, camera: Camera): string {
  const { width, height, ratio } = alignProjectCanvas(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'Canvas is unavailable.'
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = '#15181a'
  ctx.fillRect(0, 0, width, height)
  if (!view.cleanView) {
    drawBackgroundGrid(ctx, camera, width, height)
    drawOriginAxes(ctx, camera, width, height)
  }
  if (view.drawing.background !== 'transparent') {
    const origin = toScreen(camera, view.drawing.bounds)
    ctx.fillStyle = view.drawing.background
    ctx.fillRect(origin.x, origin.y, view.drawing.bounds.width * camera.zoom, view.drawing.bounds.height * camera.zoom)
  }
  if (view.cleanView && view.drawing.background === 'transparent') {
    drawTransparencyIndicator(ctx, camera, view.drawing.bounds)
  } else if (!view.cleanView) {
    for (const bounds of view.transparentScreens) drawTransparencyIndicator(ctx, camera, bounds)
  }
  const redraw = () => drawProject(canvas, project, view, camera)
  drawFramePrimitives(ctx, view.drawing, camera, redraw, 'regular', true, view.overlays.cabinets)
  if (view.creationPreview) {
    ctx.save()
    ctx.globalAlpha = 0.82
    drawFramePrimitives(ctx, view.creationPreview.frame, camera, redraw, 'regular', true, view.overlays.cabinets)
    ctx.restore()
    const topLeft = toScreen(camera, view.creationPreview.bounds)
    ctx.save()
    ctx.strokeStyle = '#f7941e'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 5])
    ctx.strokeRect(topLeft.x, topLeft.y, view.creationPreview.bounds.width * camera.zoom, view.creationPreview.bounds.height * camera.zoom)
    ctx.restore()
  }
  if (view.chartFrame && !view.cleanView) {
    const origin = toScreen(camera, view.chartFrame)
    const frameWidth = view.chartFrame.width * camera.zoom
    const frameHeight = view.chartFrame.height * camera.zoom
    ctx.save()
    ctx.strokeStyle = '#f3b55f'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.strokeRect(origin.x, origin.y, frameWidth, frameHeight)
    ctx.restore()
  }
  const visible = view.mode === 'active' ? project.screens.filter(s => s.screen.id === view.activeScreenId) : project.screens
  const labels: { screen: ScreenView; shape: GridShape; highlighted: boolean; previewing: boolean }[] = []
  let hints = 0
  for (const screen of view.cleanView ? [] : visible) {
    const preview = view.resizePreview?.screenId === screen.screen.id ? view.resizePreview : null
    const shape = preview
      ? screenShape(screen, preview.columns, preview.rows)
      : screenShape(screen, screen.grid.columns, screen.grid.rows)
    const labelMode = view.cabinetLabelModes[screen.screen.id]
    if (drawCabinetGrid(ctx, camera, screen, shape, view.overlays,
      view.overlays.cabinets && view.cabinetLines[screen.screen.id] !== false,
      view.cabinetLineColors[screen.screen.id],
      labelMode === undefined ? 'row-coordinate' : labelMode)) hints += 1
    const selectedScreen = view.selectedScreenIds.includes(screen.screen.id)
    const selectedGrid = view.selection?.type === 'cabinetGrid' && view.selection.id === screen.grid.id
    const highlighted = selectedScreen || selectedGrid
    drawScreenOutline(ctx, camera, screen, shape, highlighted)
    labels.push({ screen, shape, highlighted, previewing: preview !== null })
    if (view.selection?.type === 'cabinet' && view.selection.screenId === screen.screen.id) {
      drawCabinetSelection(ctx, camera, screen, view.selection)
    }
  }
  drawFramePrimitives(ctx, view.drawing, camera, redraw, 'screen-guide', true)
  if (view.creationPreview) {
    ctx.save()
    ctx.globalAlpha = 0.82
    drawFramePrimitives(ctx, view.creationPreview.frame, camera, redraw, 'screen-guide', true)
    ctx.restore()
  }
  if (!view.cleanView) drawInteractionOverlay(ctx, camera, width, height, view.alignmentGuides, view.projectGuides, view.selectedGuideId, view.marquee)
  drawFramePrimitives(ctx, view.drawing, camera, redraw, 'screen-information')
  drawFramePrimitives(ctx, view.drawing, camera, redraw, 'screen-title')
  if (view.creationPreview) {
    ctx.save()
    ctx.globalAlpha = 0.82
    drawFramePrimitives(ctx, view.creationPreview.frame, camera, redraw, 'screen-title')
    ctx.restore()
  }
  if (view.overlays.editorLabels) {
    const occupied: ScreenRect[] = []
    for (const { screen, shape, highlighted, previewing } of [...labels].sort((a, b) => Number(b.highlighted) - Number(a.highlighted))) {
      drawScreenLabel(ctx, camera, screen, shape, highlighted, previewing, view.overlays.coordinates, occupied)
    }
  }
  return hints > 0 ? note : ''
}
