import { DomainError } from '../model/errors.js'
import type { PixelCoordinate, PixelRect, Size } from '../model/coordinates.js'
import { isQuarterTurn, type MappingTransform } from '../model/mapping-transform.js'

export function fail(code: string, message: string): never {
  throw new DomainError(`MAPPING_${code}`, message)
}

export function assertSafeInteger(label: string, value: number, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('INVALID_VALUE', `${label} must be a safe integer >= ${minimum}, got ${value}`)
  }
}

export function assertSize(label: string, size: Size): void {
  assertSafeInteger(`${label}.width`, size.width, 1)
  assertSafeInteger(`${label}.height`, size.height, 1)
}

export function assertCoordinate(label: string, coordinate: PixelCoordinate): void {
  assertSafeInteger(`${label}.x`, coordinate.x)
  assertSafeInteger(`${label}.y`, coordinate.y)
}

export function safeResult(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) fail('OVERFLOW', `${label} exceeds the safe integer range`)
  return value
}

export function assertReference(label: string, actual: string, expected: string): void {
  if (actual !== expected) fail('UNKNOWN_REFERENCE', `${label}: expected ${expected}, got ${actual}`)
}

export function assertMembership(label: string, members: readonly string[], expected: string): void {
  if (members.length === 0) fail('INCOMPLETE', `${label}: missing ${expected}`)
  if (!members.includes(expected)) fail('UNKNOWN_REFERENCE', `${label}: missing ${expected}`)
}

export function assertMappingTransform(transform: MappingTransform, inputRect: PixelRect): void {
  if (!isQuarterTurn(transform.inputRotation) || !isQuarterTurn(transform.screenRotation)) {
    fail('INVALID_VALUE', 'MappingRegion rotations must be 0, 90, 180, or 270 degrees')
  }
  if (typeof transform.flipX !== 'boolean' || typeof transform.flipY !== 'boolean') {
    fail('INVALID_VALUE', 'MappingRegion flips must be booleans')
  }
  const mask = transform.mask
  if (mask === undefined) return
  if (typeof mask.enabled !== 'boolean' || !Array.isArray(mask.points)) {
    fail('INVALID_VALUE', 'MappingRegion mask must contain enabled and points')
  }
  if (mask.enabled && mask.points.length < 3) fail('INVALID_VALUE', 'Enabled MappingRegion mask requires at least three points')
  for (const point of mask.points) {
    assertCoordinate('MappingRegion.transform.mask point', point)
    if (point.x > inputRect.width || point.y > inputRect.height) {
      fail('OUT_OF_RANGE', 'MappingRegion mask point is outside input-local rectangle bounds')
    }
  }
}
