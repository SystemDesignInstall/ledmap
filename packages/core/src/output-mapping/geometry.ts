import type { Point } from '../model/coordinates.js'
import type { PixelRect, QuarterTurn } from '../project-model/types.js'

export interface FractionRange {
  readonly u0: number
  readonly u1: number
  readonly v0: number
  readonly v1: number
}

export function normalizeQuarterTurn(value: number): QuarterTurn {
  const normalized = ((value % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized as QuarterTurn
  }
  throw new Error(`QuarterTurn must be 0, 90, 180 or 270, got ${value}`)
}

export function netRotation(inputRotation: QuarterTurn, outputRotation: QuarterTurn): QuarterTurn {
  return normalizeQuarterTurn(outputRotation - inputRotation)
}

export function rotatedSize(width: number, height: number, net: QuarterTurn): { readonly width: number; readonly height: number } {
  if (net === 90 || net === 270) return { width: height, height: width }
  return { width, height }
}

export function intersectRect(a: PixelRect, b: PixelRect): PixelRect | null {
  const ax1 = BigInt(a.x) + BigInt(a.width)
  const ay1 = BigInt(a.y) + BigInt(a.height)
  const bx1 = BigInt(b.x) + BigInt(b.width)
  const by1 = BigInt(b.y) + BigInt(b.height)
  const x0 = BigInt(a.x) > BigInt(b.x) ? BigInt(a.x) : BigInt(b.x)
  const y0 = BigInt(a.y) > BigInt(b.y) ? BigInt(a.y) : BigInt(b.y)
  const x1 = ax1 < bx1 ? ax1 : bx1
  const y1 = ay1 < by1 ? ay1 : by1
  if (x0 >= x1 || y0 >= y1) return null
  return Object.freeze({ x: Number(x0), y: Number(y0), width: Number(x1 - x0), height: Number(y1 - y0) })
}

export function maskBounds(points: readonly Point[]): PixelRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
}

export function maskIsRect(points: readonly Point[]): boolean {
  if (points.length !== 4) return false
  const xs = new Set(points.map(point => point.x))
  const ys = new Set(points.map(point => point.y))
  return xs.size === 2 && ys.size === 2
}

export function rotateFractionPoint(u: number, v: number, net: QuarterTurn): { readonly u: number; readonly v: number } {
  if (net === 0) return { u, v }
  if (net === 90) return { u: 1 - v, v: u }
  if (net === 180) return { u: 1 - u, v: 1 - v }
  return { u: v, v: 1 - u }
}

export function rotateFractionRange(range: FractionRange, net: QuarterTurn): FractionRange {
  if (net === 0) return range
  if (net === 90) return Object.freeze({ u0: 1 - range.v1, u1: 1 - range.v0, v0: range.u0, v1: range.u1 })
  if (net === 180) return Object.freeze({ u0: 1 - range.u1, u1: 1 - range.u0, v0: 1 - range.v1, v1: 1 - range.v0 })
  return Object.freeze({ u0: range.v0, u1: range.v1, v0: 1 - range.u1, v1: 1 - range.u0 })
}

export function applyFlipPoint(u: number, v: number, flipX: boolean, flipY: boolean): { readonly u: number; readonly v: number } {
  return { u: flipX ? 1 - u : u, v: flipY ? 1 - v : v }
}

export function applyFlipRange(range: FractionRange, flipX: boolean, flipY: boolean): FractionRange {
  return Object.freeze({
    u0: flipX ? 1 - range.u1 : range.u0,
    u1: flipX ? 1 - range.u0 : range.u1,
    v0: flipY ? 1 - range.v1 : range.v0,
    v1: flipY ? 1 - range.v0 : range.v1,
  })
}

function rotatePixel(x: number, y: number, width: number, height: number, net: QuarterTurn): { readonly x: number; readonly y: number } {
  if (net === 0) return { x, y }
  if (net === 90) return { x: height - 1 - y, y: x }
  if (net === 180) return { x: width - 1 - x, y: height - 1 - y }
  return { x: y, y: width - 1 - x }
}

export interface SliceTransform {
  readonly screenRect: PixelRect
  readonly outputRect: PixelRect
  readonly inputRotation: QuarterTurn
  readonly outputRotation: QuarterTurn
  readonly flipX: boolean
  readonly flipY: boolean
}

export function screenPointToOutput(transform: SliceTransform, screenX: number, screenY: number): { readonly x: number; readonly y: number } | null {
  const { screenRect, outputRect } = transform
  const lx = screenX - screenRect.x
  const ly = screenY - screenRect.y
  if (lx < 0 || ly < 0 || lx >= screenRect.width || ly >= screenRect.height) return null
  const net = netRotation(transform.inputRotation, transform.outputRotation)
  const rotated = rotatedSize(screenRect.width, screenRect.height, net)
  const rp = rotatePixel(lx, ly, screenRect.width, screenRect.height, net)
  const fx = transform.flipX ? rotated.width - 1 - rp.x : rp.x
  const fy = transform.flipY ? rotated.height - 1 - rp.y : rp.y
  if (rotated.width === outputRect.width && rotated.height === outputRect.height) {
    return { x: outputRect.x + fx, y: outputRect.y + fy }
  }
  const ox = outputRect.x + Number((BigInt(fx) * BigInt(outputRect.width)) / BigInt(rotated.width))
  const oy = outputRect.y + Number((BigInt(fy) * BigInt(outputRect.height)) / BigInt(rotated.height))
  return { x: ox, y: oy }
}

export function outputPointToScreen(transform: SliceTransform, outputX: number, outputY: number): { readonly x: number; readonly y: number } | null {
  const { screenRect, outputRect } = transform
  const lox = outputX - outputRect.x
  const loy = outputY - outputRect.y
  if (lox < 0 || loy < 0 || lox >= outputRect.width || loy >= outputRect.height) return null
  const net = netRotation(transform.inputRotation, transform.outputRotation)
  const rotated = rotatedSize(screenRect.width, screenRect.height, net)
  const rx = rotated.width === outputRect.width
    ? lox
    : Number((BigInt(lox) * BigInt(rotated.width)) / BigInt(outputRect.width))
  const ry = rotated.height === outputRect.height
    ? loy
    : Number((BigInt(loy) * BigInt(rotated.height)) / BigInt(outputRect.height))
  if (rx < 0 || ry < 0 || rx >= rotated.width || ry >= rotated.height) return null
  const ux = transform.flipX ? rotated.width - 1 - rx : rx
  const uy = transform.flipY ? rotated.height - 1 - ry : ry
  const inv = normalizeQuarterTurn(360 - net)
  const lp = rotatePixel(ux, uy, rotated.width, rotated.height, inv)
  return { x: screenRect.x + lp.x, y: screenRect.y + lp.y }
}

export function pointInPolygon(px: number, py: number, points: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i]!.x
    const yi = points[i]!.y
    const xj = points[j]!.x
    const yj = points[j]!.y
    const crosses = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export function isScreenPixelMaskedOut(screenX: number, screenY: number, mask: { readonly enabled: boolean; readonly points: readonly Point[] } | undefined): boolean {
  if (mask === undefined || !mask.enabled) return false
  return !pointInPolygon(screenX + 0.5, screenY + 0.5, mask.points)
}

export function resolveEffectiveMapping(transform: SliceTransform, outputBounds: PixelRect): {
  readonly crop: PixelRect
  readonly place: PixelRect
  readonly rotation: QuarterTurn
  readonly flipX: boolean
  readonly flipY: boolean
} {
  const net = netRotation(transform.inputRotation, transform.outputRotation)
  const visible = intersectRect(transform.outputRect, outputBounds)
  return {
    crop: transform.screenRect,
    place: visible ?? { x: transform.outputRect.x, y: transform.outputRect.y, width: 0, height: 0 },
    rotation: net,
    flipX: transform.flipX,
    flipY: transform.flipY,
  }
}
