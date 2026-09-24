import { addressPixel, locatePixel, type PortPixelKey } from '../hardware-engine/index.js'
import type { PixelCoordinate } from '../model/coordinates.js'
import type { InputPixel, MappedPixel, MappingCabinetCell, ResolvedPixelMap } from './types.js'
import { assertCoordinate, assertReference, fail, safeResult } from './validation.js'

function mappedPixel(mapping: ResolvedPixelMap, cell: MappingCabinetCell, cabinetCoordinate: PixelCoordinate): MappedPixel {
  const screenCoordinate = Object.freeze({
    x: safeResult('Screen pixel x', cell.column * mapping.cabinetPixelSize.width + cabinetCoordinate.x),
    y: safeResult('Screen pixel y', cell.row * mapping.cabinetPixelSize.height + cabinetCoordinate.y),
  })
  const inputCoordinate = Object.freeze({
    x: safeResult('Input pixel x', mapping.region.position.x + screenCoordinate.x),
    y: safeResult('Input pixel y', mapping.region.position.y + screenCoordinate.y),
  })
  const address = addressPixel(mapping.hardware, { cabinet: cell.cabinet, coordinate: cabinetCoordinate })
  return Object.freeze({
    inputCoordinate, screenCoordinate, cabinet: cell.cabinet,
    cabinetCoordinate: Object.freeze({ ...cabinetCoordinate }),
    module: address.module, moduleCoordinate: address.coordinate, address,
  })
}

export function mapInputPixel(mapping: ResolvedPixelMap, inputPixel: InputPixel): MappedPixel {
  assertReference('InputPixel.inputCanvas', inputPixel.inputCanvas, mapping.inputCanvas.id)
  assertCoordinate('InputPixel.inputCoordinate', inputPixel.inputCoordinate)
  const gx = inputPixel.inputCoordinate.x - mapping.region.position.x
  const gy = inputPixel.inputCoordinate.y - mapping.region.position.y
  if (gx < 0 || gy < 0 || gx >= mapping.gridPixelSize.width || gy >= mapping.gridPixelSize.height) {
    fail('OUT_OF_RANGE', 'InputPixel is outside MappingRegion source rect')
  }
  const column = Math.floor(gx / mapping.cabinetPixelSize.width)
  const row = Math.floor(gy / mapping.cabinetPixelSize.height)
  const cell = mapping.cells[row * mapping.grid.columns + column]!
  return mappedPixel(mapping, cell, { x: gx % mapping.cabinetPixelSize.width, y: gy % mapping.cabinetPixelSize.height })
}

export function unmapHardwarePixel(mapping: ResolvedPixelMap, key: PortPixelKey): MappedPixel {
  const located = locatePixel(mapping.hardware, key)
  const cell = mapping.cells.find(value => value.cabinet === located.cabinet)!
  return mappedPixel(mapping, cell, located.cabinetCoordinate)
}
