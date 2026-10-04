import { decomposeCabinetPixel } from '../cabinet-engine/index.js'
import type { PixelCoordinate } from '../model/coordinates.js'
import type {
  GeometryCabinetCell,
  GeometryCabinetPixelReference,
  GeometryMappedPixel,
  GeometryModulePixelReference,
  InputPixel,
  ResolvedGeometryMapping,
} from './types.js'
import { assertCoordinate, assertReference, fail, safeResult } from './validation.js'

function cellForCabinet(mapping: ResolvedGeometryMapping, cabinet: string): GeometryCabinetCell {
  const cell = mapping.cells.find(value => value.cabinet === cabinet)
  if (!cell) fail('UNKNOWN_REFERENCE', `Cabinet ${cabinet}`)
  return cell
}

function mappedPixel(
  mapping: ResolvedGeometryMapping,
  cell: GeometryCabinetCell,
  cabinetCoordinate: PixelCoordinate,
): GeometryMappedPixel {
  assertCoordinate('Cabinet pixel coordinate', cabinetCoordinate)
  if (cabinetCoordinate.x >= mapping.cabinetPixelSize.width || cabinetCoordinate.y >= mapping.cabinetPixelSize.height) {
    fail('OUT_OF_RANGE', `Cabinet ${cell.cabinet}: pixel is outside Cabinet bounds`)
  }
  const local = decomposeCabinetPixel(cell.layout, cabinetCoordinate)
  const screenCoordinate = Object.freeze({
    x: safeResult('Screen pixel x', cell.column * mapping.cabinetPixelSize.width + cabinetCoordinate.x),
    y: safeResult('Screen pixel y', cell.row * mapping.cabinetPixelSize.height + cabinetCoordinate.y),
  })
  const inputCoordinate = Object.freeze({
    x: safeResult('Input pixel x', mapping.region.position.x + screenCoordinate.x),
    y: safeResult('Input pixel y', mapping.region.position.y + screenCoordinate.y),
  })
  return Object.freeze({
    inputCoordinate,
    screenCoordinate,
    cabinet: cell.cabinet,
    cabinetCoordinate: Object.freeze({ ...cabinetCoordinate }),
    module: cell.moduleIds[local.moduleIndex]!,
    moduleCoordinate: Object.freeze({ x: local.pixelX, y: local.pixelY }),
  })
}

export function mapGeometryInputPixel(mapping: ResolvedGeometryMapping, inputPixel: InputPixel): GeometryMappedPixel {
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

export function unmapGeometryCabinetPixel(
  mapping: ResolvedGeometryMapping,
  pixel: GeometryCabinetPixelReference,
): GeometryMappedPixel {
  return mappedPixel(mapping, cellForCabinet(mapping, pixel.cabinet), pixel.coordinate)
}

export function unmapGeometryModulePixel(
  mapping: ResolvedGeometryMapping,
  pixel: GeometryModulePixelReference,
): GeometryMappedPixel {
  const cell = cellForCabinet(mapping, pixel.cabinet)
  const index = cell.moduleIds.indexOf(pixel.module)
  if (index < 0) fail('UNKNOWN_REFERENCE', `Module ${pixel.module} in Cabinet ${pixel.cabinet}`)
  assertCoordinate('Module pixel coordinate', pixel.coordinate)
  if (pixel.coordinate.x >= cell.layout.modulePixelWidth || pixel.coordinate.y >= cell.layout.modulePixelHeight) {
    fail('OUT_OF_RANGE', `Module ${pixel.module}: pixel is outside Module bounds`)
  }
  const column = index % cell.layout.moduleColumns
  const row = Math.floor(index / cell.layout.moduleColumns)
  return mappedPixel(mapping, cell, {
    x: column * cell.layout.modulePixelWidth + pixel.coordinate.x,
    y: row * cell.layout.modulePixelHeight + pixel.coordinate.y,
  })
}
