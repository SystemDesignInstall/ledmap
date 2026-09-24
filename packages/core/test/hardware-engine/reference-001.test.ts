import { describe, expect, it } from 'vitest'
import {
  addressPixel, locatePixel, globalRemapIndex, resolveHardware,
  asCabinetId, asModuleId, asPortId, asProcessorId, asReceiverId,
} from '../../src/index.js'
import { deepFreeze, referenceTopology } from './fixtures.js'

const input = deepFreeze(referenceTopology())
const mapping = resolveHardware(input)
const processor = asProcessorId('P01')

describe('REF-001 hardware addressing', () => {
  it.each([
    { test: 'T01', x: 0, y: 0, cabinet: 'C01', module: 'M01', receiver: 'R01', port: 'P01:01', dataIndex: 0, global: 0 },
    { test: 'T02', x: 31, y: 31, cabinet: 'C01', module: 'M01', receiver: 'R01', port: 'P01:01', dataIndex: 1023, global: 1023 },
    { test: 'T03', x: 32, y: 0, cabinet: 'C01', module: 'M02', receiver: 'R01', port: 'P01:01', dataIndex: 1024, global: 1024 },
    { test: 'T04', x: 128, y: 0, cabinet: 'C02', module: 'M01', receiver: 'R01', port: 'P01:01', dataIndex: 16384, global: 16384 },
    { test: 'T05', x: 0, y: 128, cabinet: 'C05', module: 'M01', receiver: 'R02', port: 'P01:01', dataIndex: 114688, global: 114688 },
    { test: 'T06', x: 384, y: 128, cabinet: 'C08', module: 'M01', receiver: 'R02', port: 'P01:01', dataIndex: 65536, global: 65536 },
    { test: 'T07', x: 127, y: 255, cabinet: 'C05', module: 'M16', receiver: 'R02', port: 'P01:01', dataIndex: 131071, global: 131071 },
    { test: 'T08', x: 0, y: 256, cabinet: 'C09', module: 'M01', receiver: 'R03', port: 'P01:02', dataIndex: 0, global: 131072 },
    { test: 'T09', x: 511, y: 383, cabinet: 'C12', module: 'M16', receiver: 'R03', port: 'P01:02', dataIndex: 65535, global: 196607 },
    { test: 'C01 last', x: 127, y: 127, cabinet: 'C01', module: 'M16', receiver: 'R01', port: 'P01:01', dataIndex: 16383, global: 16383 },
    { test: 'C04 last', x: 511, y: 127, cabinet: 'C04', module: 'M16', receiver: 'R01', port: 'P01:01', dataIndex: 65535, global: 65535 },
  ])('$test: independent screen anchor ($x,$y)', anchor => {
    const cabinet = input.cabinets.find(value => value.id === anchor.cabinet)!
    const coordinate = { x: anchor.x - cabinet.origin.x, y: anchor.y - cabinet.origin.y }
    const address = addressPixel(mapping, { cabinet: cabinet.id, coordinate })
    expect(address).toEqual({
      hardware: { processor, port: anchor.port, receiver: anchor.receiver },
      cabinet: anchor.cabinet, module: `${anchor.cabinet}/${anchor.module}`,
      coordinate: { x: anchor.x % 32, y: anchor.y % 32 }, dataIndex: anchor.dataIndex,
    })
    const key = { processor, port: asPortId(anchor.port), dataIndex: anchor.dataIndex }
    expect(globalRemapIndex(mapping, key)).toBe(anchor.global)
    const reverse = locatePixel(mapping, key)
    expect(reverse.cabinetCoordinate).toEqual(coordinate)
    expect({ x: cabinet.origin.x + reverse.cabinetCoordinate.x, y: cabinet.origin.y + reverse.cabinetCoordinate.y })
      .toEqual({ x: anchor.x, y: anchor.y })
  })

  it('keeps compact ranges and normative receiver, cabinet, module and port boundaries', () => {
    expect(mapping.pixelCount).toBe(196608)
    expect(mapping.ports.map(port => [port.globalBase, port.pixelCount])).toEqual([
      [0, 131072], [131072, 65536], [196608, 0], [196608, 0],
    ])
    expect(mapping.ports[0]!.receivers.map(receiver => [receiver.portBase, receiver.pixelCount]))
      .toEqual([[0, 65536], [65536, 65536]])
    expect(mapping.ports[0]!.receivers[1]!.cabinets.map(cabinet => [cabinet.cabinet, cabinet.portBase]))
      .toEqual([['C08', 65536], ['C07', 81920], ['C06', 98304], ['C05', 114688]])
    expect(mapping.ports.flatMap(port => port.receivers.flatMap(receiver => receiver.cabinets))).toHaveLength(12)
    expect(mapping.ports.flatMap(port => port.receivers.flatMap(receiver => receiver.cabinets.flatMap(cabinet => cabinet.moduleIds)))).toHaveLength(192)
    for (const port of ['P01:03', 'P01:04']) {
      expect(() => locatePixel(mapping, { processor, port: asPortId(port), dataIndex: 0 })).toThrowError(/HARDWARE_OUT_OF_RANGE/)
    }
  })

  it('proves all 196608 addresses against independent traversal, both round-trips and contiguous unique keys', () => {
    const expectedPorts = [
      { port: 'P01:01', receivers: [{ id: 'R01', cabinets: ['C01', 'C02', 'C03', 'C04'] }, { id: 'R02', cabinets: ['C08', 'C07', 'C06', 'C05'] }] },
      { port: 'P01:02', receivers: [{ id: 'R03', cabinets: ['C09', 'C10', 'C11', 'C12'] }] },
    ]
    const keys = new Set<string>()
    let global = 0
    const loads: number[] = []
    for (const expectedPort of expectedPorts) {
      let dataIndex = 0
      for (const receiver of expectedPort.receivers) {
        for (const id of receiver.cabinets) {
          let moduleNumber = 1
          for (const moduleY of [0, 32, 64, 96]) {
            for (const moduleX of [0, 32, 64, 96]) {
              for (let y = 0; y < 32; y += 1) {
                for (let x = 0; x < 32; x += 1) {
                  const pixel = { cabinet: asCabinetId(id), coordinate: { x: moduleX + x, y: moduleY + y } }
                  const expected = {
                    hardware: { processor, port: asPortId(expectedPort.port), receiver: asReceiverId(receiver.id) },
                    cabinet: pixel.cabinet, module: asModuleId(`${id}/M${String(moduleNumber).padStart(2, '0')}`),
                    coordinate: { x, y }, dataIndex,
                  }
                  const address = addressPixel(mapping, pixel)
                  expect(address).toEqual(expected)
                  const key = { processor: address.hardware.processor, port: address.hardware.port, dataIndex: address.dataIndex }
                  const reverse = locatePixel(mapping, key)
                  expect(reverse).toEqual({ cabinet: pixel.cabinet, module: expected.module, coordinate: { x, y }, cabinetCoordinate: pixel.coordinate })
                  expect(addressPixel(mapping, { cabinet: reverse.cabinet, coordinate: reverse.cabinetCoordinate })).toEqual(expected)
                  expect(globalRemapIndex(mapping, key)).toBe(global)
                  keys.add(`${key.processor}/${key.port}/${key.dataIndex}`)
                  dataIndex += 1
                  global += 1
                }
              }
              moduleNumber += 1
            }
          }
        }
      }
      loads.push(dataIndex)
    }
    expect(loads).toEqual([131072, 65536])
    expect(global).toBe(196608)
    expect(keys.size).toBe(196608)
  }, 120000)

  it('resolves frozen input deterministically without retaining input state', () => {
    expect(resolveHardware(input)).toEqual(mapping)
    expect(Object.isFrozen(mapping)).toBe(true)
    expect(Object.isFrozen(mapping.ports[0]!.receivers[0]!.cabinets[0]!.moduleIds)).toBe(true)
    const reversed = {
      ...input, processors: [...input.processors].reverse(), ports: [...input.ports].reverse(),
      receivers: [...input.receivers].reverse(), cabinets: [...input.cabinets].reverse(), modules: [...input.modules].reverse(),
      receiverOrder: [...input.receiverOrder].reverse(),
    }
    expect(resolveHardware(reversed)).toEqual(mapping)
  })
})
