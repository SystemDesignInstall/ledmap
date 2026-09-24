import { cabinetPixelCoordinate, decomposeCabinetPixel } from '../cabinet-engine/index.js'
import type { PixelAddress } from '../model/signal-path.js'
import type { CabinetPixelReference, HardwarePortSpan, LocatedHardwarePixel, PortPixelKey, ResolvedHardwareMapping } from './types.js'
import { assertSafeInteger, fail, safeAdd } from './validation.js'

function occupiedPort(mapping: ResolvedHardwareMapping, key: PortPixelKey): HardwarePortSpan {
  const port = mapping.ports.find(value => value.port === key.port && value.processor === key.processor)
  if (!port) fail('UNKNOWN_REFERENCE', `Processor/Port ${key.processor}/${key.port}`)
  assertSafeInteger('dataIndex', key.dataIndex)
  if (key.dataIndex >= port.pixelCount) fail('OUT_OF_RANGE', `Port ${key.port}: dataIndex ${key.dataIndex} is outside its occupied range`)
  return port
}

export function addressPixel(mapping: ResolvedHardwareMapping, pixel: CabinetPixelReference): PixelAddress {
  for (const port of mapping.ports) {
    for (const receiver of port.receivers) {
      const cabinet = receiver.cabinets.find(value => value.cabinet === pixel.cabinet)
      if (!cabinet) continue
      const local = decomposeCabinetPixel(cabinet.layout, pixel.coordinate)
      return Object.freeze({
        hardware: Object.freeze({ processor: port.processor, port: port.port, receiver: receiver.receiver }),
        cabinet: cabinet.cabinet,
        module: cabinet.moduleIds[local.moduleIndex]!,
        coordinate: Object.freeze({ x: local.pixelX, y: local.pixelY }),
        dataIndex: safeAdd('dataIndex', cabinet.portBase, local.cabinetPixelOffset),
      })
    }
  }
  return fail('UNKNOWN_REFERENCE', `Cabinet ${pixel.cabinet}`)
}

export function locatePixel(mapping: ResolvedHardwareMapping, key: PortPixelKey): LocatedHardwarePixel {
  const port = occupiedPort(mapping, key)
  for (const receiver of port.receivers) {
    if (key.dataIndex < receiver.portBase || key.dataIndex - receiver.portBase >= receiver.pixelCount) continue
    for (const cabinet of receiver.cabinets) {
      const offset = key.dataIndex - cabinet.portBase
      if (offset < 0 || offset >= cabinet.pixelCount) continue
      const coordinate = cabinetPixelCoordinate(cabinet.layout, offset)
      const local = decomposeCabinetPixel(cabinet.layout, coordinate)
      return Object.freeze({
        cabinet: cabinet.cabinet,
        module: cabinet.moduleIds[local.moduleIndex]!,
        coordinate: Object.freeze({ x: local.pixelX, y: local.pixelY }),
        cabinetCoordinate: Object.freeze(coordinate),
      })
    }
  }
  return fail('OUT_OF_RANGE', `Port ${key.port}: no occupied span for dataIndex ${key.dataIndex}`)
}

export function globalRemapIndex(mapping: ResolvedHardwareMapping, key: PortPixelKey): number {
  return safeAdd('globalRemapIndex', occupiedPort(mapping, key).globalBase, key.dataIndex)
}
