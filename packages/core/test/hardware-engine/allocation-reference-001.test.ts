import { describe, expect, it } from 'vitest'
import {
  addressPixel, locatePixel, globalRemapIndex, resolveHardware, allocateHardware,
  asCabinetId, asModuleId, asPortId, asProcessorId, asReceiverId,
} from '../../src/index.js'
import { deepFreeze, referenceTopology } from './fixtures.js'
import { referenceAllocation } from './allocation-fixtures.js'

const input = deepFreeze(referenceAllocation())
const proposal = allocateHardware(input)
const mapping = resolveHardware(proposal.topology)
const processor = asProcessorId('P01')

describe('REF-001 hardware allocation reconstruction', () => {
  it('exactly reconstructs the full resolved reference topology with 65536 pixels per receiver', () => {
    expect(mapping).toEqual(resolveHardware(referenceTopology()))
    expect(proposal.topology.receivers.map(receiver => receiver.cabinets))
      .toEqual(referenceTopology().receivers.map(receiver => receiver.cabinets))
    expect(proposal.diagnostics).toEqual([
      { level: 'port', port: 'P01:02', unit: 'receivers', used: 1, capacity: 2 },
      { level: 'port', port: 'P01:03', unit: 'receivers', used: 0, capacity: 2 },
      { level: 'port', port: 'P01:04', unit: 'receivers', used: 0, capacity: 2 },
    ])
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
  }, 60000)

})
