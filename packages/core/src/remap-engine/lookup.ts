import { mapInputPixel, unmapHardwarePixel } from '../mapping-engine/index.js'
import type { InputPixel, MappedPixel } from '../mapping-engine/types.js'
import type { PortPixelKey } from '../hardware-engine/types.js'
import type { RemappedPixelMap } from './types.js'

export function mapRemappedInputPixel(remap: RemappedPixelMap, inputPixel: InputPixel): MappedPixel {
  return mapInputPixel(remap.source, inputPixel)
}

export function unmapRemappedHardwarePixel(remap: RemappedPixelMap, key: PortPixelKey): MappedPixel {
  return unmapHardwarePixel(remap.source, key)
}
