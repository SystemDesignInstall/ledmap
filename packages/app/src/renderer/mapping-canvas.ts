import type { InputCanvas, MappingRegion } from '@ledmap/core'
import type { Camera, Point } from './canvas.js'
import type { Project } from './project.js'

export type MappingDiagnosticStatus = 'complete' | 'incomplete' | 'invalid' | 'out-of-bounds'
export type MappingResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface MappingRegionRenderState {
  readonly region: MappingRegion
  readonly screenName: string
  readonly status: MappingDiagnosticStatus
}

export interface MappingCanvasView {
  readonly inputCanvas: InputCanvas | null
  readonly regions: readonly MappingRegionRenderState[]
  readonly selectedRegionId: string | null
  readonly inspectedInput: Point | null
}

export interface RegionGeometry {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const palette: Readonly<Record<MappingDiagnosticStatus, { readonly fill: string; readonly edge: string; readonly text: string }>> = {
  complete: { fill: '#153d38d9', edge: '#69d5b7', text: '#a9f0dd' },
  incomplete: { fill: '#30313bd9', edge: '#a7a9b5', text: '#d5d6dc' },
  invalid: { fill: '#43292fd9', edge: '#e88383', text: '#ffc4c4' },
  'out-of-bounds': { fill: '#443521d9', edge: '#e5ae63', text: '#ffd598' },
}

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

function drawWorkspaceGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera): void {
  ctx.fillStyle = '#090e14'
  ctx.fillRect(0, 0, width, height)
  const step = Math.max(24, 100 * camera.zoom)
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

function drawInputCanvas(ctx: CanvasRenderingContext2D, input: InputCanvas, camera: Camera): void {
  const origin = screenPoint(camera, { x: 0, y: 0 })
  const width = input.resolution.width * camera.zoom
  const height = input.resolution.height * camera.zoom
  ctx.fillStyle = '#0f1823'
  ctx.fillRect(origin.x, origin.y, width, height)
  ctx.strokeStyle = '#40546a'
  ctx.lineWidth = 2
  ctx.strokeRect(origin.x, origin.y, width, height)
  ctx.fillStyle = '#8fa3ba'
  ctx.font = '600 11px "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`Input Canvas  ${input.resolution.width} × ${input.resolution.height} px`, origin.x, origin.y - 9)
}

function drawRegionGrid(ctx: CanvasRenderingContext2D, project: Project, state: MappingRegionRenderState, camera: Camera): void {
  const grid = project.source.cabinetGrids.find(candidate => candidate.id === state.region.grid)
  if (!grid || camera.zoom < .05) return
  const origin = screenPoint(camera, state.region.position)
  const width = state.region.size.width * camera.zoom
  const height = state.region.size.height * camera.zoom
  ctx.strokeStyle = '#86a3b744'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let column = 1; column < grid.columns; column += 1) {
    const x = origin.x + width * column / grid.columns
    ctx.moveTo(x, origin.y)
    ctx.lineTo(x, origin.y + height)
  }
  for (let row = 1; row < grid.rows; row += 1) {
    const y = origin.y + height * row / grid.rows
    ctx.moveTo(origin.x, y)
    ctx.lineTo(origin.x + width, y)
  }
  ctx.stroke()
}

function handlePoints(region: MappingRegion): Readonly<Record<MappingResizeHandle, Point>> {
  const left = region.position.x
  const top = region.position.y
  const right = left + region.size.width
  const bottom = top + region.size.height
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return {
    nw: { x: left, y: top }, n: { x: cx, y: top }, ne: { x: right, y: top },
    e: { x: right, y: cy }, se: { x: right, y: bottom }, s: { x: cx, y: bottom },
    sw: { x: left, y: bottom }, w: { x: left, y: cy },
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, region: MappingRegion, camera: Camera): void {
  ctx.fillStyle = '#dffaf2'
  ctx.strokeStyle = '#183d35'
  for (const point of Object.values(handlePoints(region))) {
    const screen = screenPoint(camera, point)
    ctx.fillRect(screen.x - 4, screen.y - 4, 8, 8)
    ctx.strokeRect(screen.x - 4, screen.y - 4, 8, 8)
  }
}

function drawRegion(ctx: CanvasRenderingContext2D, project: Project, state: MappingRegionRenderState, camera: Camera, selected: boolean): void {
  const origin = screenPoint(camera, state.region.position)
  const width = state.region.size.width * camera.zoom
  const height = state.region.size.height * camera.zoom
  const color = palette[state.status]
  ctx.fillStyle = color.fill
  ctx.fillRect(origin.x, origin.y, width, height)
  drawRegionGrid(ctx, project, state, camera)
  ctx.strokeStyle = selected ? '#e8fff8' : color.edge
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.strokeRect(origin.x, origin.y, width, height)
  const headerHeight = 29
  ctx.fillStyle = '#111b27ed'
  ctx.fillRect(origin.x, origin.y, Math.max(width, 190), headerHeight)
  ctx.fillStyle = '#e6eef7'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.screenName, origin.x + 9, origin.y + 10)
  ctx.fillStyle = color.text
  ctx.font = '10px "Segoe UI", sans-serif'
  ctx.fillText(`${state.region.id} · ${state.status}`, origin.x + 9, origin.y + 22)
  if (selected) drawHandles(ctx, state.region, camera)
}

function drawInspection(ctx: CanvasRenderingContext2D, point: Point, camera: Camera): void {
  const screen = screenPoint(camera, point)
  ctx.strokeStyle = '#f7d27f'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(screen.x - 8, screen.y + .5)
  ctx.lineTo(screen.x + 8, screen.y + .5)
  ctx.moveTo(screen.x + .5, screen.y - 8)
  ctx.lineTo(screen.x + .5, screen.y + 8)
  ctx.stroke()
}

export function drawMappingCanvas(canvas: HTMLCanvasElement, project: Project, view: MappingCanvasView, camera: Camera): void {
  const { width, height, dpr } = canvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  drawWorkspaceGrid(ctx, width, height, camera)
  if (!view.inputCanvas) return
  drawInputCanvas(ctx, view.inputCanvas, camera)
  for (const state of view.regions) drawRegion(ctx, project, state, camera, state.region.id === view.selectedRegionId)
  if (view.inspectedInput) drawInspection(ctx, view.inspectedInput, camera)
}

export function hitMappingRegion(regions: readonly MappingRegion[], point: Point): MappingRegion | null {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index]!
    if (
      point.x >= region.position.x && point.y >= region.position.y &&
      point.x < region.position.x + region.size.width && point.y < region.position.y + region.size.height
    ) return region
  }
  return null
}

export function hitMappingResizeHandle(region: MappingRegion, pointPx: Point, camera: Camera, tolerance = 8): MappingResizeHandle | null {
  for (const [handle, point] of Object.entries(handlePoints(region)) as [MappingResizeHandle, Point][]) {
    const screen = screenPoint(camera, point)
    if (Math.abs(screen.x - pointPx.x) <= tolerance && Math.abs(screen.y - pointPx.y) <= tolerance) return handle
  }
  return null
}

export function resizeMappingRegion(
  region: MappingRegion,
  handle: MappingResizeHandle,
  dx: number,
  dy: number,
): RegionGeometry {
  const start = {
    left: region.position.x,
    top: region.position.y,
    right: region.position.x + region.size.width,
    bottom: region.position.y + region.size.height,
  }
  let left = start.left
  let top = start.top
  let right = start.right
  let bottom = start.bottom
  if (handle.includes('w')) left = Math.max(0, Math.min(start.right - 1, Math.round(start.left + dx)))
  if (handle.includes('e')) right = Math.max(start.left + 1, Math.round(start.right + dx))
  if (handle.includes('n')) top = Math.max(0, Math.min(start.bottom - 1, Math.round(start.top + dy)))
  if (handle.includes('s')) bottom = Math.max(start.top + 1, Math.round(start.bottom + dy))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
