import type { PixelAddress } from './signal-path.js'

export interface Pixel extends PixelAddress {
  readonly logicalIndex: number
}