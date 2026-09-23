import { DomainError } from '../model/errors.js'
import type { Direction } from '../model/ordering.js'
import type { TraversalPosition } from './numbering.js'

export function applyCabinetDirection(
  position: TraversalPosition,
  direction: Direction,
): TraversalPosition {
  if (direction !== 'left-to-right') {
    throw new DomainError('UNSUPPORTED_ORDERING', 'only left-to-right direction is implemented')
  }
  return { ...position }
}
