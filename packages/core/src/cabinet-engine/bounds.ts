import { assertNonNegativeInteger } from '../model/coordinates.js'
import { DomainError } from '../model/errors.js'

export function assertIndexInBounds(name: string, value: number, count: number): void {
  assertNonNegativeInteger(name, value)
  if (value >= count) {
    throw new DomainError('ORDERING_OUT_OF_RANGE', `${name} ${value} must be less than ${count}`)
  }
}
