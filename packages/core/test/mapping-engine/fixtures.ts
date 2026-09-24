import {
  asCabinetGridId, asMappingRegionId, asScreenId, createCabinetGrid, createInputCanvas, createMappingRegion,
  createPort, createProcessor, createReceiver, createScreen,
  type HardwareTopologyInput, type MappedPixel, type ResolveMappingInput,
  asCabinetId, asModuleId, asPortId, asProcessorId, asReceiverId,
} from '../../src/index.js'
import { cabinetFixture, referenceTopology } from '../hardware-engine/fixtures.js'

export function mappingInput(hardwareTopology: HardwareTopologyInput, columns: number, rows: number, cw: number, ch: number, x = 0, y = 0): ResolveMappingInput {
  const inputCanvas = createInputCanvas({ id: 'input', resolution: { width: x + columns * cw, height: y + rows * ch } })
  const screen = createScreen({
    id: 'screen', name: 'Mapping screen', resolution: { width: columns * cw, height: rows * ch },
    mappingRegions: [asMappingRegionId('region')], cabinetGrids: [asCabinetGridId('grid')],
  })
  const grid = createCabinetGrid({ id: 'grid', screen: screen.id, name: 'Grid', columns, rows, cabinetWidth: cw, cabinetHeight: ch })
  const region = createMappingRegion({ id: 'region', inputCanvas: inputCanvas.id, screen: screen.id, grid: grid.id, position: { x, y }, size: screen.resolution })
  return { inputCanvas, screen, grid, region, hardwareTopology }
}

export function referenceMapping(offset = false): ResolveMappingInput {
  const base = mappingInput(referenceTopology(), 4, 3, 128, 128, offset ? 100 : 0, offset ? 50 : 0)
  const input = { ...base, grid: { ...base.grid, ordering: { ...base.grid.ordering, snake: true } } }
  return offset ? { ...input, inputCanvas: { ...input.inputCanvas, resolution: { width: 1920, height: 1080 } } } : input
}

export function smallMapping(columns = 2, rows = 2, moduleColumns = 3, moduleRows = 2, pixelWidth = 5, pixelHeight = 7): ResolveMappingInput {
  const processor = createProcessor({ id: 'P', name: 'Processor', portCount: 1 })
  const port = createPort({ id: 'P:0', processor: processor.id, index: 0, receiverCapacity: 1 })
  const parts = Array.from({ length: columns * rows }, (_, index) => cabinetFixture(
    `C${index}`, moduleColumns, moduleRows, pixelWidth, pixelHeight, index % columns, Math.floor(index / columns),
  ))
  const receiver = createReceiver({ id: 'R', processor: processor.id, port: port.id, index: 0, cabinets: parts.map(part => part.cabinet.id) })
  return mappingInput({
    processors: [processor], ports: [port], receivers: [receiver],
    cabinets: parts.map(part => part.cabinet), modules: parts.flatMap(part => part.modules),
    processorOrder: [processor.id], receiverOrder: [{ port: port.id, receivers: [receiver.id] }],
  }, columns, rows, moduleColumns * pixelWidth, moduleRows * pixelHeight, 10, 20)
}

const bases = [0, 16384, 32768, 49152, 114688, 98304, 81920, 65536, 0, 16384, 32768, 49152]

export function expectedReference(x: number, y: number, offset: boolean): MappedPixel {
  const number = Math.floor(y / 128) * 4 + Math.floor(x / 128) + 1
  const cabinet = asCabinetId(`C${String(number).padStart(2, '0')}`)
  const cx = x % 128
  const cy = y % 128
  const moduleIndex = Math.floor(cy / 32) * 4 + Math.floor(cx / 32)
  const module = asModuleId(`${cabinet}/M${String(moduleIndex + 1).padStart(2, '0')}`)
  const moduleCoordinate = { x: cx % 32, y: cy % 32 }
  return {
    inputCoordinate: { x: x + (offset ? 100 : 0), y: y + (offset ? 50 : 0) }, screenCoordinate: { x, y },
    cabinet, cabinetCoordinate: { x: cx, y: cy }, module, moduleCoordinate,
    address: {
      hardware: { processor: asProcessorId('P01'), port: asPortId(number <= 8 ? 'P01:01' : 'P01:02'), receiver: asReceiverId(number <= 4 ? 'R01' : number <= 8 ? 'R02' : 'R03') },
      cabinet, module, coordinate: moduleCoordinate,
      dataIndex: bases[number - 1]! + moduleIndex * 1024 + moduleCoordinate.y * 32 + moduleCoordinate.x,
    },
  }
}

export function assertFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    if (!Object.isFrozen(value)) throw new Error('Expected a deeply frozen value')
    for (const child of Object.values(value)) assertFrozen(child)
  }
}

export const otherScreen = asScreenId('other-screen')
