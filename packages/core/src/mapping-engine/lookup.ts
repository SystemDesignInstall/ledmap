import { addressPixel, locatePixel, type PortPixelKey } from '../hardware-engine/index.js'
import type { PixelCoordinate } from '../model/coordinates.js'
import type { InputPixel, MappedPixel, MappingCabinetCell, ResolvedPixelMap } from './types.js'
import { assertCoordinate, assertReference, fail, safeResult } from './validation.js'
import { gridToInputCoordinate, gridToScreenCoordinate, inputToGridCoordinate } from './transform.js'

function mappedPixel(mapping: ResolvedPixelMap, cell: MappingCabinetCell, cabinetCoordinate: PixelCoordinate): MappedPixel {
  const gridCoordinate = Object.freeze({
    x: safeResult('Screen pixel x', cell.column * mapping.cabinetPixelSize.width + cabinetCoordinate.x),
    y: safeResult('Screen pixel y', cell.row * mapping.cabinetPixelSize.height + cabinetCoordinate.y),
  })
  const inputCoordinate = gridToInputCoordinate(mapping.region, mapping.gridPixelSize, gridCoordinate)
  if (inputCoordinate === null) fail('OUT_OF_RANGE', 'Hardware pixel is excluded by MappingRegion mask')
  const screenCoordinate = gridToScreenCoordinate(mapping.region, mapping.gridPixelSize, gridCoordinate)
  const address = addressPixel(mapping.hardware, { cabinet: cell.cabinet, coordinate: cabinetCoordinate })
  return Object.freeze({
    inputCoordinate: Object.freeze(inputCoordinate), screenCoordinate: Object.freeze(screenCoordinate), cabinet: cell.cabinet,
    cabinetCoordinate: Object.freeze({ ...cabinetCoordinate }),
    module: address.module, moduleCoordinate: address.coordinate, address,
  })
}

export function mapInputPixel(mapping: ResolvedPixelMap, inputPixel: InputPixel): MappedPixel {
  assertReference('InputPixel.inputCanvas', inputPixel.inputCanvas, mapping.inputCanvas.id)
  assertCoordinate('InputPixel.inputCoordinate', inputPixel.inputCoordinate)
  const gridCoordinate = inputToGridCoordinate(mapping.region, mapping.gridPixelSize, inputPixel.inputCoordinate)
  if (gridCoordinate === null) fail('OUT_OF_RANGE', 'InputPixel is outside MappingRegion source rect or excluded by its mask')
  const { x: gx, y: gy } = gridCoordinate
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
