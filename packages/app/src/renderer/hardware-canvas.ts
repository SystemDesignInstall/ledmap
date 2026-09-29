import type { CabinetId } from '@ledmap/core'
import type { Camera, Point } from './canvas.js'
import { projectBounds, type Bounds, type Project, type ScreenView } from './project.js'

export type HardwareSelection =
  | { readonly type: 'processor'; readonly id: string }
  | { readonly type: 'port'; readonly id: string }
  | { readonly type: 'receiver'; readonly id: string }

export interface HardwareOverlays {
  readonly receiver: boolean
  readonly port: boolean
  readonly processor: boolean
  readonly dataFlow: boolean
}

export interface HardwareCanvasView {
  readonly selection: HardwareSelection | null
  readonly selectedCabinetIds: readonly string[]
  readonly overlays: HardwareOverlays
}

export interface HardwareCabinetHit {
  readonly cabinet: CabinetId
  readonly screenId: string
  readonly local: Point
}

const receiverColors = ['#52c7a8', '#6caee8', '#c69aee', '#e7b05e', '#e47b8c', '#79cce1', '#9fc66f', '#cf8ec1']

function screenPoint(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.offsetX, y: point.y * camera.zoom + camera.offsetY }
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

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera): void {
  ctx.fillStyle = '#090e14'
  ctx.fillRect(0, 0, width, height)
  const step = Math.max(28, 128 * camera.zoom)
  const ox = ((camera.offsetX % step) + step) % step
  const oy = ((camera.offsetY % step) + step) % step
  ctx.strokeStyle = '#17212c'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = ox; x < width; x += step) {
    ctx.moveTo(Math.round(x) + .5, 0)
    ctx.lineTo(Math.round(x) + .5, height)
  }
  for (let y = oy; y < height; y += step) {
    ctx.moveTo(0, Math.round(y) + .5)
    ctx.lineTo(width, Math.round(y) + .5)
  }
  ctx.stroke()
}

function assignedReceiver(project: Project, cabinetId: string) {
  return project.source.hardwareTopology.receivers.find(receiver => receiver.cabinets.some(id => id === cabinetId))
}

function linkedCabinets(project: Project, selection: HardwareSelection | null): Set<string> {
  if (!selection) return new Set()
  const topology = project.source.hardwareTopology
  if (selection.type === 'receiver') {
    return new Set(topology.receivers.find(receiver => receiver.id === selection.id)?.cabinets ?? [])
  }
  const receiverIds = selection.type === 'port'
    ? new Set(topology.receivers.filter(receiver => receiver.port === selection.id).map(receiver => receiver.id))
    : new Set(topology.receivers.filter(receiver => receiver.processor === selection.id).map(receiver => receiver.id))
  return new Set(topology.receivers.filter(receiver => receiverIds.has(receiver.id)).flatMap(receiver => receiver.cabinets))
}

function receiverColor(project: Project, receiverId: string): string {
  const index = project.source.hardwareTopology.receivers.findIndex(receiver => receiver.id === receiverId)
  return receiverColors[(index < 0 ? 0 : index) % receiverColors.length]!
}

function cabinetRect(screen: ScreenView, column: number, row: number): Bounds {
  const left = screen.x + column * screen.grid.cabinetWidth
  const top = screen.y + row * screen.grid.cabinetHeight
  const width = screen.grid.cabinetWidth
  const height = screen.grid.cabinetHeight
  return { left, top, right: left + width, bottom: top + height, width, height }
}

function cabinetCenter(project: Project, cabinetId: string): Point | null {
  for (const screen of project.screens) {
    const cabinet = screen.cabinets.find(value => value.sourceId === cabinetId)
    if (!cabinet) continue
    const rect = cabinetRect(screen, cabinet.column, cabinet.row)
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  return null
}

function drawDataFlow(ctx: CanvasRenderingContext2D, project: Project, camera: Camera): void {
  for (const receiver of project.source.hardwareTopology.receivers) {
    const points = receiver.cabinets.map(cabinet => cabinetCenter(project, cabinet)).filter(point => point !== null)
    if (points.length < 2) continue
    ctx.strokeStyle = `${receiverColor(project, receiver.id)}aa`
    ctx.lineWidth = 2
    ctx.beginPath()
    points.forEach((point, index) => {
      const screen = screenPoint(camera, point)
      if (index === 0) ctx.moveTo(screen.x, screen.y)
      else ctx.lineTo(screen.x, screen.y)
    })
    ctx.stroke()
  }
}

function drawScreen(
  ctx: CanvasRenderingContext2D,
  project: Project,
  screen: ScreenView,
  view: HardwareCanvasView,
  camera: Camera,
  linked: ReadonlySet<string>,
): void {
  const origin = screenPoint(camera, { x: screen.x, y: screen.y })
  const width = screen.screen.resolution.width * camera.zoom
  const height = screen.screen.resolution.height * camera.zoom
  ctx.fillStyle = '#101925'
  ctx.fillRect(origin.x, origin.y, width, height)
  ctx.strokeStyle = '#3c4e61'
  ctx.lineWidth = 2
  ctx.strokeRect(origin.x, origin.y, width, height)
  ctx.fillStyle = '#172331'
  ctx.fillRect(origin.x, origin.y - 28, Math.max(width, 170), 28)
  ctx.fillStyle = '#dce6f1'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${screen.screen.name} · ${screen.screen.resolution.width} × ${screen.screen.resolution.height}`, origin.x + 9, origin.y - 13)

  for (const cabinet of screen.cabinets) {
    const rect = cabinetRect(screen, cabinet.column, cabinet.row)
    const topLeft = screenPoint(camera, { x: rect.left, y: rect.top })
    const cw = rect.width * camera.zoom
    const ch = rect.height * camera.zoom
    const receiver = assignedReceiver(project, cabinet.sourceId)
    const color = receiver ? receiverColor(project, receiver.id) : '#59697b'
    const selected = view.selectedCabinetIds.includes(cabinet.sourceId)
    const highlighted = linked.has(cabinet.sourceId)
    ctx.fillStyle = receiver ? `${color}${highlighted ? '66' : '35'}` : '#26313c'
    ctx.fillRect(topLeft.x, topLeft.y, cw, ch)
    ctx.strokeStyle = selected ? '#fff3a6' : highlighted ? '#ffffff' : color
    ctx.lineWidth = selected ? 3 : highlighted ? 2.5 : 1
    ctx.strokeRect(topLeft.x, topLeft.y, cw, ch)
    if (camera.zoom < .11) continue
    const port = receiver ? project.source.hardwareTopology.ports.find(value => value.id === receiver.port) : undefined
    const processor = port ? project.source.hardwareTopology.processors.find(value => value.id === port.processor) : undefined
    const lines = [cabinet.id]
    if (view.overlays.receiver) lines.push(receiver?.id ?? 'Unassigned')
    if (view.overlays.port && port) lines.push(port.id)
    if (view.overlays.processor && processor) lines.push(processor.name)
    ctx.save()
    ctx.beginPath()
    ctx.rect(topLeft.x + 2, topLeft.y + 2, Math.max(0, cw - 4), Math.max(0, ch - 4))
    ctx.clip()
    ctx.fillStyle = '#e8eef5'
    ctx.font = `${Math.max(8, Math.min(11, cw / 5))}px "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineHeight = Math.max(9, Math.min(12, ch / (lines.length + 1)))
    lines.forEach((line, index) => ctx.fillText(line, topLeft.x + cw / 2, topLeft.y + ch / 2 + (index - (lines.length - 1) / 2) * lineHeight))
    ctx.restore()
  }
}

export function drawHardwareCanvas(canvas: HTMLCanvasElement, project: Project, view: HardwareCanvasView, camera: Camera): void {
  const { width, height, dpr } = canvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  drawGrid(ctx, width, height, camera)
  const linked = linkedCabinets(project, view.selection)
  for (const screen of project.screens) drawScreen(ctx, project, screen, view, camera, linked)
  if (view.overlays.dataFlow) drawDataFlow(ctx, project, camera)
}

export function hitHardwareCabinet(project: Project, point: Point): HardwareCabinetHit | null {
  for (let screenIndex = project.screens.length - 1; screenIndex >= 0; screenIndex -= 1) {
    const screen = project.screens[screenIndex]!
    for (const cabinet of screen.cabinets) {
      const rect = cabinetRect(screen, cabinet.column, cabinet.row)
      if (point.x < rect.left || point.y < rect.top || point.x >= rect.right || point.y >= rect.bottom) continue
      return {
        cabinet: cabinet.sourceId,
        screenId: screen.screen.id,
        local: { x: Math.floor(point.x - rect.left), y: Math.floor(point.y - rect.top) },
      }
    }
  }
  return null
}

export function hardwareCanvasBounds(project: Project): Bounds {
  return projectBounds(project)
}

export function hardwareCabinetCenter(project: Project, cabinetId: string): Point | null {
  return cabinetCenter(project, cabinetId)
}
