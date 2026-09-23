import { DomainError } from '../model/errors.js'
import type { Direction } from '../model/ordering.js'
import type { TraversalPosition } from './numbering.js'

export function applyCabinetDirection(
  position: TraversalPosition,
  direction: Direction,
): TraversalPosition {
  if (position.axis === 'horizontal' && direction === 'left-to-right') {
    return { ...position }
  }
  if (position.axis === 'horizontal' && direction === 'right-to-left') {
    return { ...position, offset: position.lineLength - 1 - position.offset }
  }
  if (position.axis === 'vertical' && direction === 'top-to-bottom') {
    return { ...position }
  }
  if (position.axis === 'vertical' && direction === 'bottom-to-top') {
    return { ...position, offset: position.lineLength - 1 - position.offset }
  }
  throw new DomainError('UNSUPPORTED_ORDERING', `direction ${direction} is unsupported for ${position.axis} traversal`)
}
