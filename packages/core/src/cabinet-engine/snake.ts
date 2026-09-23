import type { Snake } from '../model/ordering.js'
import type { TraversalPosition } from './numbering.js'

export function applyCabinetSnake(position: TraversalPosition, snake: Snake): TraversalPosition {
  const offset = snake && position.line % 2 === 1
    ? position.lineLength - 1 - position.offset
    : position.offset
  return { ...position, offset }
}
