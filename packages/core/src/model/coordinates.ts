import { DomainError } from './errors.js'

export interface Coord2D {
  readonly x: number
  readonly y: number
}

export type Point = Coord2D
export type PixelCoordinate = Coord2D
export type ModuleCoordinate = Coord2D

export interface Size {
  readonly width: number
  readonly height: number
}

export interface PixelRect extends PixelCoordinate, Size {}

export interface GridPosition {
  readonly column: number
  readonly row: number
}

export function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainError('INVALID_DIMENSION', `${name} must be a positive integer, got ${value}`)
  }
}

export function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError('INVALID_COORDINATE', `${name} must be a non-negative integer, got ${value}`)
  }
}

export function createSize(width: number, height: number): Size {
  assertPositiveInteger('width', width)
  assertPositiveInteger('height', height)
  return { width, height }
}

export function createPoint(x: number, y: number): Point {
  assertNonNegativeInteger('x', x)
  assertNonNegativeInteger('y', y)
  return { x, y }
}

export function createPixelCoordinate(x: number, y: number): PixelCoordinate {
  assertNonNegativeInteger('x', x)
  assertNonNegativeInteger('y', y)
  return { x, y }
}

export function createPixelRect(x: number, y: number, width: number, height: number): PixelRect {
  const coordinate = createPixelCoordinate(x, y)
  const size = createSize(width, height)
  if (!Number.isSafeInteger(coordinate.x) || !Number.isSafeInteger(coordinate.y)) {
    throw new DomainError('INVALID_COORDINATE', 'PixelRect coordinates must use safe integers')
  }
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)) {
    throw new DomainError('INVALID_DIMENSION', 'PixelRect dimensions must use safe integers')
  }
  return { ...coordinate, ...size }
}

export function createGridPosition(column: number, row: number): GridPosition {
  assertNonNegativeInteger('column', column)
  assertNonNegativeInteger('row', row)
  return { column, row }
}

export function isWithinBounds(coordinate: Coord2D, bounds: Size): boolean {
  return (
    coordinate.x >= 0 &&
    coordinate.y >= 0 &&
    coordinate.x < bounds.width &&
    coordinate.y < bounds.height
  )
}
