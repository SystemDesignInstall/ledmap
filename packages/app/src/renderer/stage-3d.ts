import type { ScreenView } from './v2-view-model.js'

export interface Point3D {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Camera3D {
  readonly yaw: number
  readonly pitch: number
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

export interface StageBounds {
  readonly centerX: number
  readonly centerY: number
  readonly width: number
  readonly height: number
}

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
  readonly depth: number
}

interface Face {
  readonly screenId: string
  readonly vertices: readonly Point3D[]
  readonly fill: string
  readonly stroke: string
  readonly front: boolean
}

interface ProjectedFace {
  readonly screenId: string
  readonly vertices: readonly ProjectedPoint[]
  readonly depth: number
  readonly fill: string
  readonly stroke: string
  readonly front: boolean
}

export interface Stage3DWorkspace {
  readonly redraw: () => void
  readonly fit: () => void
  readonly reset: () => void
  readonly zoomBy: (factor: number) => void
}

export interface Stage3DOptions {
  readonly canvas: HTMLCanvasElement
  readonly getScreens: () => readonly ScreenView[]
  readonly getSelectedIds: () => readonly string[]
  readonly onSelect: (screenId: string, additive: boolean) => void
}

export const initialCamera3D: Camera3D = Object.freeze({ yaw: 0.48, pitch: 0.28, zoom: 1, panX: 0, panY: 0 })

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

export function stageBounds(screens: readonly ScreenView[]): StageBounds {
  if (screens.length === 0) return { centerX: 0, centerY: 0, width: 1, height: 1 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const screen of screens) {
    left = Math.min(left, screen.x)
    top = Math.min(top, screen.y)
    right = Math.max(right, screen.x + screen.grid.columns * screen.grid.cabinetWidth)
    bottom = Math.max(bottom, screen.y + screen.grid.rows * screen.grid.cabinetHeight)
  }
  return { centerX: (left + right) / 2, centerY: (top + bottom) / 2,
    width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

export function stagePoint(x: number, y: number, z: number, bounds: StageBounds): Point3D {
  return { x: x - bounds.centerX, y: bounds.centerY - y, z }
}

export function projectStagePoint(point: Point3D, camera: Camera3D, bounds: StageBounds,
  viewportWidth: number, viewportHeight: number): ProjectedPoint | null {
  const width = Math.max(1, viewportWidth)
  const height = Math.max(1, viewportHeight)
  const focalLength = Math.min(width, height) * 1.12
  const distance = Math.max(
    30,
    bounds.width * focalLength / (width * 0.7),
    bounds.height * focalLength / (height * 0.7),
    Math.max(bounds.width, bounds.height) * 1.35,
  ) / camera.zoom
  const sy = Math.sin(camera.yaw)
  const cy = Math.cos(camera.yaw)
  const sp = Math.sin(camera.pitch)
  const cp = Math.cos(camera.pitch)
  const depth = distance - (point.x * sy * cp + point.y * sp + point.z * cy * cp)
  if (!Number.isFinite(depth) || depth <= 0.01) return null
  const horizontal = point.x * cy - point.z * sy
  const vertical = point.y * cp - (point.x * sy + point.z * cy) * sp
  return {
    x: width / 2 + camera.panX + horizontal * focalLength / depth,
    y: height / 2 + camera.panY - vertical * focalLength / depth,
    depth,
  }
}

function faceNormal(face: readonly Point3D[]): Point3D {
  const a = face[0]!
  const b = face[1]!
  const c = face[2]!
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx }
}

function screenHue(screenId: string): number {
  let hash = 0
  for (const character of screenId) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return 190 + (Math.abs(hash) % 55)
}

function cabinetFaces(screen: ScreenView, bounds: StageBounds, selected: boolean): Face[] {
  const faces: Face[] = []
  const width = screen.grid.cabinetWidth
  const height = screen.grid.cabinetHeight
  const thickness = clamp(Math.min(width, height) * 0.09, 2, 24)
  const hue = screenHue(screen.screen.id)
  const stroke = selected ? '#ffb458' : '#4d6470'
  for (const cabinet of screen.cabinets) {
    const x0 = screen.x + cabinet.column * width
    const y0 = screen.y + cabinet.row * height
    const x1 = x0 + width
    const y1 = y0 + height
    const tl = stagePoint(x0, y0, thickness / 2, bounds)
    const tr = stagePoint(x1, y0, thickness / 2, bounds)
    const bl = stagePoint(x0, y1, thickness / 2, bounds)
    const br = stagePoint(x1, y1, thickness / 2, bounds)
    const tlb = stagePoint(x0, y0, -thickness / 2, bounds)
    const trb = stagePoint(x1, y0, -thickness / 2, bounds)
    const blb = stagePoint(x0, y1, -thickness / 2, bounds)
    const brb = stagePoint(x1, y1, -thickness / 2, bounds)
    const brightness = (cabinet.column + cabinet.row) % 2 === 0 ? 21 : 25
    const front = selected ? '#4f3523' : `hsl(${hue} 24% ${brightness}%)`
    const side = selected ? '#7b4b2d' : `hsl(${hue} 28% 30%)`
    const top = selected ? '#98603c' : `hsl(${hue} 26% 37%)`
    faces.push(
      { screenId: screen.screen.id, vertices: [tl, bl, br, tr], fill: front, stroke, front: true },
      { screenId: screen.screen.id, vertices: [tlb, trb, brb, blb], fill: side, stroke, front: false },
      { screenId: screen.screen.id, vertices: [tlb, tl, tr, trb], fill: top, stroke, front: false },
      { screenId: screen.screen.id, vertices: [bl, blb, brb, br], fill: side, stroke, front: false },
      { screenId: screen.screen.id, vertices: [tlb, blb, bl, tl], fill: side, stroke, front: false },
      { screenId: screen.screen.id, vertices: [tr, br, brb, trb], fill: side, stroke, front: false },
    )
  }
  return faces
}

function projectFaces(screens: readonly ScreenView[], camera: Camera3D, bounds: StageBounds,
  width: number, height: number, selectedIds: readonly string[]): ProjectedFace[] {
  const direction: Point3D = {
    x: Math.sin(camera.yaw) * Math.cos(camera.pitch),
    y: Math.sin(camera.pitch),
    z: Math.cos(camera.yaw) * Math.cos(camera.pitch),
  }
  const result: ProjectedFace[] = []
  for (const screen of screens) {
    for (const face of cabinetFaces(screen, bounds, selectedIds.includes(screen.screen.id))) {
      const normal = faceNormal(face.vertices)
      if (normal.x * direction.x + normal.y * direction.y + normal.z * direction.z <= 0) continue
      const projected = face.vertices.map(vertex => projectStagePoint(vertex, camera, bounds, width, height))
      if (projected.some(point => !point)) continue
      const vertices = projected as ProjectedPoint[]
      result.push({ ...face, vertices, depth: vertices.reduce((sum, point) => sum + point.depth, 0) / vertices.length })
    }
  }
  return result.sort((a, b) => b.depth - a.depth)
}

export function pointInPolygon(point: { readonly x: number; readonly y: number },
  polygon: readonly { readonly x: number; readonly y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function pickStageScreen(screens: readonly ScreenView[], camera: Camera3D,
  viewportWidth: number, viewportHeight: number, point: { readonly x: number; readonly y: number }): string | null {
  const bounds = stageBounds(screens)
  const width = Math.max(1, viewportWidth)
  const height = Math.max(1, viewportHeight)
  const sy = Math.sin(camera.yaw)
  const cy = Math.cos(camera.yaw)
  const sp = Math.sin(camera.pitch)
  const cp = Math.cos(camera.pitch)
  const direction: Point3D = { x: sy * cp, y: sp, z: cy * cp }
  const focalLength = Math.min(width, height) * 1.12
  const distance = Math.max(
    30,
    bounds.width * focalLength / (width * 0.7),
    bounds.height * focalLength / (height * 0.7),
    Math.max(bounds.width, bounds.height) * 1.35,
  ) / camera.zoom
  const origin: Point3D = { x: direction.x * distance, y: direction.y * distance, z: direction.z * distance }
  const ray: Point3D = {
    x: cy * (point.x - width / 2 - camera.panX) + sy * sp * (point.y - height / 2 - camera.panY) - direction.x * focalLength,
    y: -cp * (point.y - height / 2 - camera.panY) - direction.y * focalLength,
    z: -sy * (point.x - width / 2 - camera.panX) + cy * sp * (point.y - height / 2 - camera.panY) - direction.z * focalLength,
  }
  let best: { readonly id: string; readonly order: number; readonly distance: number } | null = null
  for (let order = 0; order < screens.length; order += 1) {
    const screen = screens[order]!
    for (const face of cabinetFaces(screen, bounds, false)) {
      const normal = faceNormal(face.vertices)
      if (normal.x * direction.x + normal.y * direction.y + normal.z * direction.z <= 0) continue
      const projected = face.vertices.map(vertex => projectStagePoint(vertex, camera, bounds, width, height))
      if (projected.some(entry => !entry)) continue
      if (!pointInPolygon(point, projected as ProjectedPoint[])) continue
      const anchor = face.vertices[0]!
      const denominator = ray.x * normal.x + ray.y * normal.y + ray.z * normal.z
      if (Math.abs(denominator) < 1e-12) continue
      const offset = (anchor.x - origin.x) * normal.x + (anchor.y - origin.y) * normal.y + (anchor.z - origin.z) * normal.z
      const rayDistance = offset / denominator
      if (!(rayDistance > 0)) continue
      const tolerance = 1e-9 * Math.max(1, Math.abs(best?.distance ?? rayDistance))
      if (!best || rayDistance < best.distance - tolerance || (Math.abs(rayDistance - best.distance) <= tolerance && order > best.order)) {
        best = { id: screen.screen.id, order, distance: rayDistance }
      }
    }
  }
  return best?.id ?? null
}

function drawPath(ctx: CanvasRenderingContext2D, points: readonly ProjectedPoint[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y)
  ctx.closePath()
}

function drawWorldGrid(ctx: CanvasRenderingContext2D, camera: Camera3D, bounds: StageBounds,
  width: number, height: number): void {
  const span = Math.max(bounds.width, bounds.height)
  const spacing = 10 ** Math.floor(Math.log10(span / 6))
  const step = spacing * (span / spacing > 15 ? 2 : 1)
  const planeY = -bounds.height / 2 - Math.max(28, bounds.height * 0.16)
  const limit = Math.ceil(span * 1.15 / step) * step
  ctx.strokeStyle = '#273239'
  ctx.lineWidth = 1
  for (let n = -limit; n <= limit; n += step) {
    for (const [a, b] of [
      [{ x: n, y: planeY, z: -limit }, { x: n, y: planeY, z: limit }],
      [{ x: -limit, y: planeY, z: n }, { x: limit, y: planeY, z: n }],
    ] as const) {
      const pa = projectStagePoint(a, camera, bounds, width, height)
      const pb = projectStagePoint(b, camera, bounds, width, height)
      if (!pa || !pb) continue
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
  }
}

export function createStage3DWorkspace(options: Stage3DOptions): Stage3DWorkspace {
  const { canvas, getScreens, getSelectedIds, onSelect } = options
  let camera: Camera3D = { ...initialCamera3D }
  let drag: { pointerId: number; x: number; y: number; moved: boolean; pan: boolean } | null = null

  function redraw(): void {
    const boundsOnScreen = canvas.getBoundingClientRect()
    const width = Math.max(1, boundsOnScreen.width)
    const height = Math.max(1, boundsOnScreen.height)
    const ratio = window.devicePixelRatio || 1
    const targetWidth = Math.max(1, Math.round(width * ratio))
    const targetHeight = Math.max(1, Math.round(height * ratio))
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#11171c'
    ctx.fillRect(0, 0, width, height)
    const screens = getScreens()
    const bounds = stageBounds(screens)
    drawWorldGrid(ctx, camera, bounds, width, height)
    const faces = projectFaces(screens, camera, bounds, width, height, getSelectedIds())
    for (const face of faces) {
      drawPath(ctx, face.vertices)
      ctx.fillStyle = face.fill
      ctx.fill()
      ctx.lineWidth = face.front ? 0.9 : 1
      ctx.strokeStyle = face.stroke
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const screen of screens) {
      const label = projectStagePoint(stagePoint(screen.x + screen.grid.columns * screen.grid.cabinetWidth / 2,
        screen.y + screen.grid.rows * screen.grid.cabinetHeight / 2, 14, bounds), camera, bounds, width, height)
      if (!label || label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue
      ctx.font = '600 12px Inter, Segoe UI, sans-serif'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#0c131a'
      ctx.strokeText(screen.screen.name, label.x, label.y)
      ctx.fillStyle = getSelectedIds().includes(screen.screen.id) ? '#ffc27b' : '#e7eef3'
      ctx.fillText(screen.screen.name, label.x, label.y)
    }
    ctx.textAlign = 'left'
    ctx.font = '11px Inter, Segoe UI, sans-serif'
    ctx.fillStyle = '#9cacb6'
    ctx.fillText('3D COMPOSITION · drag: orbit · Shift+drag: pan · wheel: zoom · click: select', 14, 20)
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    drag = { pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, moved: false,
      pan: event.shiftKey || event.button === 1 }
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('dragging')
  })
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.offsetX - drag.x
    const dy = event.offsetY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true
    drag = { ...drag, x: event.offsetX, y: event.offsetY }
    if (!drag.moved) return
    if (drag.pan) camera = { ...camera, panX: camera.panX + dx, panY: camera.panY + dy }
    else camera = { ...camera, yaw: camera.yaw + dx * 0.008, pitch: clamp(camera.pitch - dy * 0.008, -1.3, 1.3) }
    redraw()
  })
  canvas.addEventListener('pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const isClick = !drag.moved && !drag.pan && event.button === 0
    drag = null
    canvas.classList.remove('dragging')
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (isClick) {
      const target = pickStageScreen(getScreens(), camera, canvas.getBoundingClientRect().width,
        canvas.getBoundingClientRect().height, { x: event.offsetX, y: event.offsetY })
      if (target) onSelect(target, event.ctrlKey || event.metaKey)
    }
  })
  canvas.addEventListener('pointercancel', () => {
    drag = null
    canvas.classList.remove('dragging')
  })
  canvas.addEventListener('contextmenu', event => event.preventDefault())
  canvas.addEventListener('wheel', event => {
    event.preventDefault()
    camera = { ...camera, zoom: clamp(camera.zoom * Math.exp(-event.deltaY * 0.0015), 0.15, 15) }
    redraw()
  }, { passive: false })
  return {
    redraw,
    fit: () => { camera = { ...camera, panX: 0, panY: 0, zoom: 1 }; redraw() },
    reset: () => { camera = { ...initialCamera3D }; redraw() },
    zoomBy: factor => { camera = { ...camera, zoom: clamp(camera.zoom * factor, 0.15, 15) }; redraw() },
  }
}
