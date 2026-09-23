import { DomainError } from '../model/errors.js'
import type { Direction } from '../model/ordering.js'
import type { TraversalPosition } from './numbering.js'

export function applyCabinetDirection(
  position: TraversalPosition,
  direction: Direction,
): TraversalPosition {
  if (direction === 'left-to-right') {
    return { ...position }
  }
  if (direction === 'right-to-left') {
    return { ...position, offset: position.lineLength - 1 - position.offset }
  }
  throw new DomainError('UNSUPPORTED_ORDERING', 'only horizontal directions are implemented')
}
