import type { MappingRegion, MappingTransform, PixelCoordinate, PolygonMask, QuarterTurn, Size } from '../model/index.js'

export function rotatePixelCoordinate(coordinate: PixelCoordinate, source: Size, rotation: QuarterTurn): PixelCoordinate {
  if (rotation === 90) return { x: source.height - 1 - coordinate.y, y: coordinate.x }
  if (rotation === 180) return { x: source.width - 1 - coordinate.x, y: source.height - 1 - coordinate.y }
  if (rotation === 270) return { x: coordinate.y, y: source.width - 1 - coordinate.x }
  return { x: coordinate.x, y: coordinate.y }
}

export function unrotatePixelCoordinate(coordinate: PixelCoordinate, source: Size, rotation: QuarterTurn): PixelCoordinate {
  if (rotation === 90) return { x: coordinate.y, y: source.height - 1 - coordinate.x }
  if (rotation === 180) return { x: source.width - 1 - coordinate.x, y: source.height - 1 - coordinate.y }
  if (rotation === 270) return { x: source.width - 1 - coordinate.y, y: coordinate.x }
  return { x: coordinate.x, y: coordinate.y }
}

export function flipPixelCoordinate(coordinate: PixelCoordinate, bounds: Size, transform: MappingTransform): PixelCoordinate {
  return {
    x: transform.flipX ? bounds.width - 1 - coordinate.x : coordinate.x,
    y: transform.flipY ? bounds.height - 1 - coordinate.y : coordinate.y,
  }
}

function isOnSegment(px: bigint, py: bigint, ax: bigint, ay: bigint, bx: bigint, by: bigint): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
  return cross === 0n && px >= (ax < bx ? ax : bx) && px <= (ax > bx ? ax : bx)
    && py >= (ay < by ? ay : by) && py <= (ay > by ? ay : by)
}

export function isPixelInsideMask(coordinate: PixelCoordinate, mask: PolygonMask | undefined): boolean {
  if (mask?.enabled !== true) return true
  const px = BigInt(coordinate.x) * 2n + 1n
  const py = BigInt(coordinate.y) * 2n + 1n
  let inside = false
  for (let index = 0, previous = mask.points.length - 1; index < mask.points.length; previous = index, index += 1) {
    const a = mask.points[previous]!
    const b = mask.points[index]!
    const ax = BigInt(a.x) * 2n
    const ay = BigInt(a.y) * 2n
    const bx = BigInt(b.x) * 2n
    const by = BigInt(b.y) * 2n
    if (isOnSegment(px, py, ax, ay, bx, by)) return true
    if ((ay > py) === (by > py)) continue
    const left = (px - ax) * (by - ay)
    const right = (bx - ax) * (py - ay)
    if (by > ay ? left < right : left > right) inside = !inside
  }
  return inside
}

export function inputToGridCoordinate(region: MappingRegion, gridSize: Size, input: PixelCoordinate): PixelCoordinate | null {
  const local = { x: input.x - region.inputRect.x, y: input.y - region.inputRect.y }
  if (local.x < 0 || local.y < 0 || local.x >= region.inputRect.width || local.y >= region.inputRect.height) return null
  if (!isPixelInsideMask(local, region.transform.mask)) return null
  return flipPixelCoordinate(
    rotatePixelCoordinate(local, region.inputRect, region.transform.inputRotation),
    gridSize,
    region.transform,
  )
}

export function gridToInputCoordinate(region: MappingRegion, gridSize: Size, grid: PixelCoordinate): PixelCoordinate | null {
  const unflipped = flipPixelCoordinate(grid, gridSize, region.transform)
  const local = unrotatePixelCoordinate(unflipped, region.inputRect, region.transform.inputRotation)
  if (!isPixelInsideMask(local, region.transform.mask)) return null
  return { x: region.inputRect.x + local.x, y: region.inputRect.y + local.y }
}

export function gridToScreenCoordinate(region: MappingRegion, gridSize: Size, grid: PixelCoordinate): PixelCoordinate {
  const local = rotatePixelCoordinate(grid, gridSize, region.transform.screenRotation)
  return { x: region.screenRect.x + local.x, y: region.screenRect.y + local.y }
}
