import { cabinetIndex, cabinetOrder, type CabinetEngineConfig, type GridPosition } from '@ledmap/core'
import { gridPixelSize } from './state.js'
import type { Bounds, Project, ScreenView, SelectedObject } from './v2-view-model.js'
import type { AlignmentGuide, SelectionBox } from './layout-interaction.js'

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
  readonly marquee: SelectionBox | null
  readonly overlays: OverlayVisibility
}

export interface OverlayVisibility {
  readonly cabinets: boolean
  readonly modules: boolean
  readonly signal: boolean
  readonly coordinates: boolean
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

const ACCENT = '#74e0c2'
const CABINET_FIRST = '#173b39'
const CABINET_FILL = '#172331'
const PENDING_FILL = '#121a26'
const PENDING_EDGE = '#3d5b70'
const MODULE_LINE = '#2a3b4d'
const CABINET_EDGE = '#698095'
const SCREEN_EDGE = '#3a4b60'
const TEXT = '#c7d6e6'

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
  return cw >= 64 && ch >= 64
}

export function cabinetLabelHit(camera: Camera, screen: ScreenView, cabinet: { column: number; row: number }, point: Point): boolean {
  if (!cabinetLabelVisible(camera, screen)) return false
  const p = cabinetCenterPx(camera, screen, cabinet)
  return point.x >= p.x - 30 && point.x <= p.x + 30 && point.y >= p.y - 26 && point.y <= p.y + 26
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
  ctx.strokeStyle = '#141c28'
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

function previewConfig(screen: ScreenView, shape: GridShape): CabinetEngineConfig {
  return { ...screen.config, columns: shape.columns, rows: shape.rows }
}

function drawCabinetGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screen: ScreenView,
  shape: GridShape,
  overlays: OverlayVisibility,
): boolean {
  const rect = screenRectPx(camera, screen, shape)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  const config = previewConfig(screen, shape)
  const modulesVisible = cw / config.moduleColumns >= 5 && ch / config.moduleRows >= 5
  const labelsVisible = cabinetLabelVisible(camera, screen)
  const existing = new Map<string, string>()
  for (const cabinet of screen.cabinets) existing.set(`${cabinet.column},${cabinet.row}`, cabinet.id)
  ctx.fillStyle = '#111b27'
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height)
  for (let row = 0; row < shape.rows; row += 1) {
    for (let column = 0; column < shape.columns; column += 1) {
      const x = rect.left + column * cw
      const y = rect.top + row * ch
      const id = existing.get(`${column},${row}`)
      const index = cabinetIndex(config, { column, row })
      if (overlays.cabinets) {
        ctx.fillStyle = id === undefined ? PENDING_FILL : index === 0 ? CABINET_FIRST : CABINET_FILL
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
      if (overlays.cabinets) {
        ctx.strokeStyle = id === undefined ? PENDING_EDGE : CABINET_EDGE
        ctx.setLineDash(id === undefined ? [4, 3] : [])
        ctx.strokeRect(x, y, cw, ch)
        ctx.setLineDash([])
      }
    }
  }
  if (overlays.signal) drawSignalPath(ctx, camera, screen, shape, config)
  if (labelsVisible && (overlays.cabinets || overlays.signal)) {
    drawCabinetLabels(ctx, camera, screen, shape, config, overlays)
  }
  return (overlays.cabinets || overlays.signal) && !labelsVisible || overlays.modules && !modulesVisible
}

function drawSignalPath(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, shape: GridShape, config: CabinetEngineConfig): void {
  const path = cabinetOrder(config)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  ctx.strokeStyle = ACCENT
  ctx.fillStyle = ACCENT
  ctx.lineWidth = 1.5
  for (let i = 1; i < path.length; i += 1) {
    const before = path[i - 1]!
    const after = path[i]!
    const a = cellCenterPx(camera, screen, before)
    const b = cellCenterPx(camera, screen, after)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const tip = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const size = Math.min(6, cw * .15, ch * .15)
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - size * Math.cos(angle - .5), tip.y - size * Math.sin(angle - .5))
    ctx.lineTo(tip.x - size * Math.cos(angle + .5), tip.y - size * Math.sin(angle + .5))
    ctx.closePath()
    ctx.fill()
  }
}

function drawCabinetLabels(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screen: ScreenView,
  shape: GridShape,
  config: CabinetEngineConfig,
  overlays: OverlayVisibility,
): void {
  for (const cabinet of screen.cabinets) {
    if (cabinet.column >= shape.columns || cabinet.row >= shape.rows) continue
    const p = cellCenterPx(camera, screen, cabinet)
    const index = cabinetIndex(config, cabinet)
    ctx.fillStyle = '#101c28'
    ctx.fillRect(p.x - 28, p.y - 24, 56, 48)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '12px "Segoe UI", sans-serif'
    ctx.fillStyle = TEXT
    if (overlays.cabinets) ctx.fillText(cabinet.id, p.x, overlays.signal ? p.y - 10 : p.y)
    if (overlays.signal) {
      ctx.font = '600 18px "Segoe UI", sans-serif'
      ctx.fillStyle = ACCENT
      ctx.fillText(`#${index + 1}`, p.x, overlays.cabinets ? p.y + 10 : p.y)
    }
  }
}

function drawScreenOutline(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, shape: GridShape, selected: boolean): void {
  const rect = screenRectPx(camera, screen, shape)
  ctx.strokeStyle = selected ? ACCENT : SCREEN_EDGE
  ctx.lineWidth = selected ? 2 : 1
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height)
  if (selected) {
    ctx.fillStyle = ACCENT
    const size = 6
    for (const { point } of screenResizeHandles(camera, screen, shape)) {
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size)
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
): void {
  const rect = screenRectPx(camera, screen, shape)
  const format = new Intl.NumberFormat('en-US')
  const rw = format.format(shape.width)
  const rh = format.format(shape.height)
  const suffix = coordinates ? `  ${screen.x}, ${screen.y}` : ''
  const pending = previewing ? '  Preview' : ''
  const title = `${screen.screen.name}${suffix}${pending}`
  const resolution = `${rw} × ${rh} px`
  ctx.font = '600 12px "Segoe UI", sans-serif'
  const titleWidth = ctx.measureText(title).width
  ctx.font = '12px "Segoe UI", sans-serif'
  const resolutionWidth = ctx.measureText(resolution).width
  const width = Math.max(rect.width, titleWidth + resolutionWidth + 42)
  let y = rect.top - 32
  if (y < 4) y = rect.top + 4
  const x = Math.max(6, rect.left)
  ctx.fillStyle = selected ? '#163a35' : '#182331'
  ctx.fillRect(x, y, width, 28)
  ctx.strokeStyle = selected ? ACCENT : '#354256'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, 28)
  ctx.fillStyle = selected ? ACCENT : '#dae3ee'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.fillText(title, x + 11, y + 15)
  ctx.fillStyle = '#8ea1b7'
  ctx.textAlign = 'right'
  ctx.font = '12px "Segoe UI", sans-serif'
  ctx.fillText(resolution, x + width - 11, y + 15)
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
  marquee: SelectionBox | null,
): void {
  ctx.save()
  ctx.strokeStyle = '#f3b55f'
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
  if (marquee) {
    const start = toScreen(camera, { x: marquee.left, y: marquee.top })
    const end = toScreen(camera, { x: marquee.right, y: marquee.bottom })
    ctx.fillStyle = '#74e0c21a'
    ctx.strokeStyle = '#74e0c2'
    ctx.setLineDash([4, 3])
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y)
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
  }
  ctx.restore()
}

const note = 'Cabinet labels and module marks are hidden at this scale. Zoom in to inspect.'

export function drawProject(canvas: HTMLCanvasElement, project: Project, view: View, camera: Camera): string {
  const { width, height } = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'Canvas is unavailable.'
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = '#0b1119'
  ctx.fillRect(0, 0, width, height)
  drawBackgroundGrid(ctx, camera, width, height)
  const visible = view.mode === 'active' ? project.screens.filter(s => s.screen.id === view.activeScreenId) : project.screens
  let hints = 0
  for (const screen of visible) {
    const preview = view.resizePreview?.screenId === screen.screen.id ? view.resizePreview : null
    const shape = preview
      ? screenShape(screen, preview.columns, preview.rows)
      : screenShape(screen, screen.grid.columns, screen.grid.rows)
    if (drawCabinetGrid(ctx, camera, screen, shape, view.overlays)) hints += 1
    const selectedScreen = view.selectedScreenIds.includes(screen.screen.id)
    const selectedGrid = view.selection?.type === 'cabinetGrid' && view.selection.id === screen.grid.id
    const highlighted = selectedScreen || selectedGrid
    drawScreenOutline(ctx, camera, screen, shape, highlighted)
    drawScreenLabel(ctx, camera, screen, shape, highlighted, preview !== null, view.overlays.coordinates)
    if (view.selection?.type === 'cabinet' && view.selection.screenId === screen.screen.id) {
      drawCabinetSelection(ctx, camera, screen, view.selection)
    }
  }
  drawInteractionOverlay(ctx, camera, width, height, view.alignmentGuides, view.marquee)
  return hints > 0 ? note : ''
}
