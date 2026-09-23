export type Numbering = 'row' | 'column'

export type StartCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'

export type Direction =
  | 'left-to-right'
  | 'right-to-left'
  | 'top-to-bottom'
  | 'bottom-to-top'

export type Snake = boolean

export interface GridOrdering {
  readonly numbering: Numbering
  readonly startCorner: StartCorner
  readonly direction: Direction
  readonly snake: Snake
}

export const defaultGridOrdering: GridOrdering = {
  numbering: 'row',
  startCorner: 'top-left',
  direction: 'left-to-right',
  snake: false,
}