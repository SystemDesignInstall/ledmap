import type { Bounds, Project, ScreenView, SelectedObject } from './project.js'

export interface Camera {
  readonly zoom: number
  readonly offsetX: number
  readonly offsetY: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface View {
  readonly mode: 'all' | 'active'
  readonly selection: SelectedObject | null
  readonly activeScreenId: string | null
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

function screenRectPx(camera: Camera, screen: ScreenView): ScreenRect {
  const topLeft = toScreen(camera, { x: screen.x, y: screen.y })
  const topRight = topLeft.x + screenWidthPx(camera, screen)
  const bottom = topLeft.y + screenHeightPx(camera, screen)
  return { left: topLeft.x, top: topLeft.y, width: topRight - topLeft.x, height: bottom - topLeft.y }
}

function screenWidthPx(camera: Camera, screen: ScreenView): number {
  return screen.screen.resolution.width * camera.zoom
}

function screenHeightPx(camera: Camera, screen: ScreenView): number {
  return screen.screen.resolution.height * camera.zoom
}

const ACCENT = '#74e0c2'
const CABINET_FIRST = '#173b39'
const CABINET_FILL = '#172331'
const MODULE_LINE = '#2a3b4d'
const CABINET_EDGE = '#698095'
const SCREEN_EDGE = '#3a4b60'
const TEXT = '#c7d6e6'

export function cabinetCenterPx(camera: Camera, screen: ScreenView, cabinet: { column: number; row: number }): Point {
  const x = screen.x + (cabinet.column + .5) * screen.grid.cabinetWidth
  const y = screen.y + (cabinet.row + .5) * screen.grid.cabinetHeight
  return toScreen(camera, { x, y })
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
  const rect = screenRectPx(camera, screen)
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

function drawCabinetGrid(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView): boolean {
  const rect = screenRectPx(camera, screen)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  const modulesVisible = cw / screen.config.moduleColumns >= 5 && ch / screen.config.moduleRows >= 5
  const labelsVisible = cabinetLabelVisible(camera, screen)
  for (const cabinet of screen.cabinets) {
    const x = rect.left + cabinet.column * cw
    const y = rect.top + cabinet.row * ch
    ctx.fillStyle = cabinet.index === 0 ? CABINET_FIRST : CABINET_FILL
    ctx.fillRect(x, y, cw, ch)
    if (modulesVisible) {
      ctx.strokeStyle = MODULE_LINE
      ctx.beginPath()
      for (let c = 1; c < screen.config.moduleColumns; c += 1) {
        ctx.moveTo(x + c * cw / screen.config.moduleColumns, y)
        ctx.lineTo(x + c * cw / screen.config.moduleColumns, y + ch)
      }
      for (let r = 1; r < screen.config.moduleRows; r += 1) {
        ctx.moveTo(x, y + r * ch / screen.config.moduleRows)
        ctx.lineTo(x + cw, y + r * ch / screen.config.moduleRows)
      }
      ctx.stroke()
    }
    ctx.strokeStyle = CABINET_EDGE
    ctx.strokeRect(x, y, cw, ch)
  }
  drawSignalPath(ctx, screen, camera)
  if (labelsVisible) drawCabinetLabels(ctx, screen, camera)
  return !labelsVisible || !modulesVisible
}

function drawSignalPath(ctx: CanvasRenderingContext2D, screen: ScreenView, camera: Camera): void {
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  ctx.strokeStyle = ACCENT
  ctx.fillStyle = ACCENT
  ctx.lineWidth = 1.5
  for (let i = 1; i < screen.path.length; i += 1) {
    const before = screen.path[i - 1]!
    const after = screen.path[i]!
    const a = cabinetCenterPx(camera, screen, before)
    const b = cabinetCenterPx(camera, screen, after)
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

function drawCabinetLabels(ctx: CanvasRenderingContext2D, screen: ScreenView, camera: Camera): void {
  for (const cabinet of screen.cabinets) {
    const p = cabinetCenterPx(camera, screen, cabinet)
    ctx.fillStyle = '#101c28'
    ctx.fillRect(p.x - 28, p.y - 24, 56, 48)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '12px "Segoe UI", sans-serif'
    ctx.fillStyle = TEXT
    ctx.fillText(cabinet.id, p.x, p.y - 10)
    ctx.font = '600 18px "Segoe UI", sans-serif'
    ctx.fillStyle = ACCENT
    ctx.fillText(`#${cabinet.index + 1}`, p.x, p.y + 10)
  }
}

function drawScreenOutline(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, selected: boolean): void {
  const rect = screenRectPx(camera, screen)
  ctx.strokeStyle = selected ? ACCENT : SCREEN_EDGE
  ctx.lineWidth = selected ? 2 : 1
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height)
  if (selected) {
    ctx.fillStyle = ACCENT
    const size = 6
    const corners = [
      { x: rect.left, y: rect.top },
      { x: rect.left + rect.width, y: rect.top },
      { x: rect.left, y: rect.top + rect.height },
      { x: rect.left + rect.width, y: rect.top + rect.height },
    ]
    for (const corner of corners) {
      ctx.fillRect(corner.x - size / 2, corner.y - size / 2, size, size)
    }
  }
}

function drawScreenLabel(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, selected: boolean): void {
  const rect = screenRectPx(camera, screen)
  const format = new Intl.NumberFormat('en-US')
  const columns = format.format(screen.grid.columns)
  const rows = format.format(screen.grid.rows)
  const rw = format.format(screen.screen.resolution.width)
  const rh = format.format(screen.screen.resolution.height)
  const suffix = selected ? ` · (${screen.x}, ${screen.y})` : ''
  const text = `${screen.screen.name} · ${columns} × ${rows} cabinets · ${rw} × ${rh} px${suffix}`
  ctx.font = '600 12px "Segoe UI", sans-serif'
  const width = ctx.measureText(text).width + 22
  let y = rect.top - 34
  if (y < 6) y = rect.top + 6
  const x = Math.max(6, rect.left)
  ctx.fillStyle = selected ? '#1a3a35' : '#1a2434'
  ctx.fillRect(x, y, width, 24)
  ctx.strokeStyle = selected ? ACCENT : '#354256'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, 24)
  ctx.fillStyle = selected ? ACCENT : '#dae3ee'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 11, y + 13)
}

function drawCabinetSelection(ctx: CanvasRenderingContext2D, camera: Camera, screen: ScreenView, selection: Extract<SelectedObject, { type: 'cabinet' }>): void {
  const cabinet = screen.cabinets.find(c => c.id === selection.id)
  if (!cabinet) return
  const rect = screenRectPx(camera, screen)
  const cw = screen.grid.cabinetWidth * camera.zoom
  const ch = screen.grid.cabinetHeight * camera.zoom
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.strokeRect(rect.left + cabinet.column * cw, rect.top + cabinet.row * ch, cw, ch)
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
    if (drawCabinetGrid(ctx, camera, screen)) hints += 1
    const selectedScreen = view.selection?.type === 'screen' && view.selection.id === screen.screen.id
    const selectedGrid = view.selection?.type === 'cabinetGrid' && view.selection.id === screen.grid.id
    const highlighted = selectedScreen || selectedGrid
    drawScreenOutline(ctx, camera, screen, highlighted)
    drawScreenLabel(ctx, camera, screen, highlighted)
    if (view.selection?.type === 'cabinet' && view.selection.screenId === screen.screen.id) {
      drawCabinetSelection(ctx, camera, screen, view.selection)
    }
  }
  return hints > 0 ? note : ''
}
