import { createPixelCoordinate, type PixelCoordinate, type Size } from './coordinates.js'
import { DomainError } from './errors.js'

export type QuarterTurn = 0 | 90 | 180 | 270

export interface PolygonMask {
  readonly enabled: boolean
  readonly points: readonly PixelCoordinate[]
}

export interface MappingTransform {
  readonly inputRotation: QuarterTurn
  readonly screenRotation: QuarterTurn
  readonly flipX: boolean
  readonly flipY: boolean
  readonly mask?: PolygonMask
}

export const identityMappingTransform: MappingTransform = Object.freeze({
  inputRotation: 0,
  screenRotation: 0,
  flipX: false,
  flipY: false,
})

export function isQuarterTurn(value: number): value is QuarterTurn {
  return value === 0 || value === 90 || value === 180 || value === 270
}

export function createMappingTransform(transform: MappingTransform): MappingTransform {
  if (!isQuarterTurn(transform.inputRotation) || !isQuarterTurn(transform.screenRotation)) {
    throw new DomainError('INVALID_ROTATION', 'Mapping rotations must be 0, 90, 180, or 270 degrees')
  }
  if (typeof transform.flipX !== 'boolean' || typeof transform.flipY !== 'boolean') {
    throw new DomainError('INVALID_TRANSFORM', 'Mapping flips must be booleans')
  }
  const mask = transform.mask === undefined ? undefined : {
    enabled: transform.mask.enabled,
    points: transform.mask.points.map(point => createPixelCoordinate(point.x, point.y)),
  }
  if (mask !== undefined && typeof mask.enabled !== 'boolean') {
    throw new DomainError('INVALID_MASK', 'PolygonMask.enabled must be a boolean')
  }
  if (mask?.enabled === true && mask.points.length < 3) {
    throw new DomainError('INVALID_MASK', 'An enabled PolygonMask requires at least three points')
  }
  return {
    inputRotation: transform.inputRotation,
    screenRotation: transform.screenRotation,
    flipX: transform.flipX,
    flipY: transform.flipY,
    ...(mask === undefined ? {} : { mask }),
  }
}

export function rotatedSize(size: Size, rotation: QuarterTurn): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}
