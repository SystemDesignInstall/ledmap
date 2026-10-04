import { addressPixel, locatePixel, type PortPixelKey, type ResolvedHardwareMapping } from '../hardware-engine/index.js'
import type { GeometryMappedPixel, InputPixel, MappedPixel, ResolvedGeometryMapping } from './types.js'
import { mapGeometryInputPixel, unmapGeometryCabinetPixel } from './geometry-lookup.js'
import { fail } from './validation.js'

export function addressGeometryPixel(hardware: ResolvedHardwareMapping, pixel: GeometryMappedPixel): MappedPixel {
  const address = addressPixel(hardware, { cabinet: pixel.cabinet, coordinate: pixel.cabinetCoordinate })
  if (
    address.module !== pixel.module ||
    address.coordinate.x !== pixel.moduleCoordinate.x ||
    address.coordinate.y !== pixel.moduleCoordinate.y
  ) fail('HARDWARE_MISMATCH', `Hardware Module layout does not match geometry for Cabinet ${pixel.cabinet}`)
  return Object.freeze({
    inputCoordinate: Object.freeze({ ...pixel.inputCoordinate }),
    screenCoordinate: Object.freeze({ ...pixel.screenCoordinate }),
    cabinet: pixel.cabinet,
    cabinetCoordinate: Object.freeze({ ...pixel.cabinetCoordinate }),
    module: pixel.module,
    moduleCoordinate: Object.freeze({ ...pixel.moduleCoordinate }),
    address,
  })
}

export function mapInputPixelWithHardware(
  geometry: ResolvedGeometryMapping,
  hardware: ResolvedHardwareMapping,
  inputPixel: InputPixel,
): MappedPixel {
  return addressGeometryPixel(hardware, mapGeometryInputPixel(geometry, inputPixel))
}

export function unmapHardwarePixelWithGeometry(
  geometry: ResolvedGeometryMapping,
  hardware: ResolvedHardwareMapping,
  key: PortPixelKey,
): MappedPixel {
  const located = locatePixel(hardware, key)
  const pixel = unmapGeometryCabinetPixel(geometry, { cabinet: located.cabinet, coordinate: located.cabinetCoordinate })
  if (
    pixel.module !== located.module ||
    pixel.moduleCoordinate.x !== located.coordinate.x ||
    pixel.moduleCoordinate.y !== located.coordinate.y
  ) fail('HARDWARE_MISMATCH', `Hardware Module layout does not match geometry for Cabinet ${pixel.cabinet}`)
  return addressGeometryPixel(hardware, pixel)
}
