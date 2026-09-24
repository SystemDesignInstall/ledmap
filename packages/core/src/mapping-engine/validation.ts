import { DomainError } from '../model/errors.js'
import type { PixelCoordinate, Size } from '../model/coordinates.js'

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
  if (members.length > 1) fail('UNSUPPORTED_PROFILE', `${label}: only one member is supported`)
  assertReference(label, members[0]!, expected)
}
