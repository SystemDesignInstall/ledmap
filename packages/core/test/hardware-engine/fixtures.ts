import {
  asCabinetGridId, createCabinet, createModule, createPort, createProcessor, createReceiver,
  type HardwareTopologyInput,
} from '../../src/index.js'

export function cabinetFixture(id: string, columns = 1, rows = 1, width = 2, height = 3, column = 0, row = 0) {
  const cabinet = createCabinet({
    id, grid: asCabinetGridId('grid'), column, row, x: column * columns * width, y: row * rows * height,
    width: columns * width, height: rows * height, pixelWidth: columns * width, pixelHeight: rows * height,
    moduleColumns: columns, moduleRows: rows,
  })
  const modules = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      modules.push(createModule({
        id: `${id}/M${String(modules.length + 1).padStart(2, '0')}`, cabinet, column: c, row: r,
        width, height, pixelWidth: width, pixelHeight: height,
      }))
    }
  }
  return { cabinet, modules }
}

export function smallTopology(): HardwareTopologyInput {
  const processor = createProcessor({ id: 'P', name: 'Processor', portCount: 3 })
  const ports = [0, 1, 2].map(index => createPort({ id: `P:${index}`, processor: processor.id, index, receiverCapacity: 3 }))
  const parts = [cabinetFixture('A', 3, 2, 5, 7), cabinetFixture('B'), cabinetFixture('C', 1, 1, 1, 1)]
  const receivers = [
    createReceiver({ id: 'R-later-label', processor: processor.id, port: ports[0]!.id, index: 99, cabinets: [parts[0]!.cabinet.id, parts[1]!.cabinet.id] }),
    createReceiver({ id: 'R-earlier-label', processor: processor.id, port: ports[0]!.id, index: 0, cabinets: [parts[2]!.cabinet.id] }),
    createReceiver({ id: 'R-empty', processor: processor.id, port: ports[1]!.id, index: 0 }),
  ]
  return {
    processors: [processor], ports, receivers,
    cabinets: parts.map(part => part.cabinet), modules: parts.flatMap(part => part.modules),
    processorOrder: [processor.id],
    receiverOrder: [
      { port: ports[0]!.id, receivers: [receivers[0]!.id, receivers[1]!.id] },
      { port: ports[1]!.id, receivers: [receivers[2]!.id] },
      { port: ports[2]!.id, receivers: [] },
    ],
  }
}

export function referenceTopology(): HardwareTopologyInput {
  const processor = createProcessor({ id: 'P01', name: 'Reference processor', portCount: 4 })
  const ports = [0, 1, 2, 3].map(index => createPort({ id: `P01:0${index + 1}`, processor: processor.id, index, receiverCapacity: 2 }))
  const parts = Array.from({ length: 12 }, (_, index) => cabinetFixture(
    `C${String(index + 1).padStart(2, '0')}`, 4, 4, 32, 32, index % 4, Math.floor(index / 4),
  ))
  const assignments = [[0, 1, 2, 3], [7, 6, 5, 4], [8, 9, 10, 11]]
  const receivers = assignments.map((positions, index) => createReceiver({
    id: `R0${index + 1}`, index, processor: processor.id, port: ports[index === 2 ? 1 : 0]!.id,
    cabinets: positions.map(position => parts[position]!.cabinet.id),
  }))
  return {
    processors: [processor], ports, receivers,
    cabinets: parts.map(part => part.cabinet), modules: parts.flatMap(part => part.modules),
    processorOrder: [processor.id],
    receiverOrder: [
      { port: ports[0]!.id, receivers: [receivers[0]!.id, receivers[1]!.id] },
      { port: ports[1]!.id, receivers: [receivers[2]!.id] },
      { port: ports[2]!.id, receivers: [] }, { port: ports[3]!.id, receivers: [] },
    ],
  }
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
