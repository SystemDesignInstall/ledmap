import { assert, describe, expect, it } from 'vitest'
import {
  resolveRemap, mapRemappedInputPixel, unmapRemappedHardwarePixel,
  mapInputPixel, unmapHardwarePixel, globalRemapIndex, asProcessorId, asPortId,
  type MappedPixel,
} from '../../src/index.js'
import { expectedReference } from '../mapping-engine/fixtures.js'
import { resolvedReferenceMapping } from './fixtures.js'

function assertMappedPixel(actual: MappedPixel, expected: MappedPixel): void {
  if (
    actual.inputCoordinate.x !== expected.inputCoordinate.x || actual.inputCoordinate.y !== expected.inputCoordinate.y ||
    actual.screenCoordinate.x !== expected.screenCoordinate.x || actual.screenCoordinate.y !== expected.screenCoordinate.y ||
    actual.cabinet !== expected.cabinet || actual.module !== expected.module ||
    actual.cabinetCoordinate.x !== expected.cabinetCoordinate.x || actual.cabinetCoordinate.y !== expected.cabinetCoordinate.y ||
    actual.moduleCoordinate.x !== expected.moduleCoordinate.x || actual.moduleCoordinate.y !== expected.moduleCoordinate.y ||
    actual.address.cabinet !== expected.address.cabinet || actual.address.module !== expected.address.module ||
    actual.address.coordinate.x !== expected.address.coordinate.x || actual.address.coordinate.y !== expected.address.coordinate.y ||
    actual.address.hardware.processor !== expected.address.hardware.processor ||
    actual.address.hardware.port !== expected.address.hardware.port || actual.address.hardware.receiver !== expected.address.hardware.receiver ||
    actual.address.dataIndex !== expected.address.dataIndex
  ) expect(actual).toEqual(expected)
}

const anchors = [
  { x: 0, y: 0, cabinet: 'C01', local: [0, 0], module: 'C01/M01', pixel: [0, 0], receiver: 'R01', port: 'P01:01', data: 0, global: 0 },
  { x: 31, y: 31, cabinet: 'C01', local: [31, 31], module: 'C01/M01', pixel: [31, 31], receiver: 'R01', port: 'P01:01', data: 1023, global: 1023 },
  { x: 32, y: 0, cabinet: 'C01', local: [32, 0], module: 'C01/M02', pixel: [0, 0], receiver: 'R01', port: 'P01:01', data: 1024, global: 1024 },
  { x: 127, y: 127, cabinet: 'C01', local: [127, 127], module: 'C01/M16', pixel: [31, 31], receiver: 'R01', port: 'P01:01', data: 16383, global: 16383 },
  { x: 128, y: 0, cabinet: 'C02', local: [0, 0], module: 'C02/M01', pixel: [0, 0], receiver: 'R01', port: 'P01:01', data: 16384, global: 16384 },
  { x: 511, y: 127, cabinet: 'C04', local: [127, 127], module: 'C04/M16', pixel: [31, 31], receiver: 'R01', port: 'P01:01', data: 65535, global: 65535 },
  { x: 384, y: 128, cabinet: 'C08', local: [0, 0], module: 'C08/M01', pixel: [0, 0], receiver: 'R02', port: 'P01:01', data: 65536, global: 65536 },
  { x: 0, y: 128, cabinet: 'C05', local: [0, 0], module: 'C05/M01', pixel: [0, 0], receiver: 'R02', port: 'P01:01', data: 114688, global: 114688 },
  { x: 127, y: 255, cabinet: 'C05', local: [127, 127], module: 'C05/M16', pixel: [31, 31], receiver: 'R02', port: 'P01:01', data: 131071, global: 131071 },
  { x: 0, y: 256, cabinet: 'C09', local: [0, 0], module: 'C09/M01', pixel: [0, 0], receiver: 'R03', port: 'P01:02', data: 0, global: 131072 },
  { x: 511, y: 383, cabinet: 'C12', local: [127, 127], module: 'C12/M16', pixel: [31, 31], receiver: 'R03', port: 'P01:02', data: 65535, global: 196607 },
]

describe.each([false, true])('REMAP-001 identity-only ref offset=%s', offset => {
  const mapping = resolvedReferenceMapping(offset)
  const remap = resolveRemap({ mapping, rules: [] })

  it.each(anchors)('maps anchor ($x,$y) through remap with semantic identity', anchor => {
    const inputCoordinate = { x: anchor.x + (offset ? 100 : 0), y: anchor.y + (offset ? 50 : 0) }
    const expected = {
      inputCoordinate, screenCoordinate: { x: anchor.x, y: anchor.y }, cabinet: anchor.cabinet,
      cabinetCoordinate: { x: anchor.local[0], y: anchor.local[1] }, module: anchor.module,
      moduleCoordinate: { x: anchor.pixel[0], y: anchor.pixel[1] },
      address: {
        hardware: { processor: 'P01', port: anchor.port, receiver: anchor.receiver },
        cabinet: anchor.cabinet, module: anchor.module, coordinate: { x: anchor.pixel[0], y: anchor.pixel[1] }, dataIndex: anchor.data,
      },
    }
    const key = { processor: asProcessorId('P01'), port: asPortId(anchor.port), dataIndex: anchor.data }
    const inputPixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate }
    const mapped = mapRemappedInputPixel(remap, inputPixel)
    expect(mapped).toEqual(expected)
    expect(mapped).toEqual(mapInputPixel(mapping, inputPixel))
    expect(unmapRemappedHardwarePixel(remap, key)).toEqual(expected)
    expect(unmapRemappedHardwarePixel(remap, key)).toEqual(unmapHardwarePixel(mapping, key))
    expect(globalRemapIndex(mapping.hardware, key)).toBe(anchor.global)
  })

  it('sweeps all 196608 input pixels with independent expectations and unique hardware keys', () => {
    const keys = new Set<string>()
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const expected = expectedReference(x, y, offset)
        const inputPixel = { inputCanvas: mapping.inputCanvas.id, inputCoordinate: expected.inputCoordinate }
        const actual = mapRemappedInputPixel(remap, inputPixel)
        assertMappedPixel(actual, expected)
        assertMappedPixel(actual, mapInputPixel(mapping, inputPixel))
        const key = { processor: actual.address.hardware.processor, port: actual.address.hardware.port, dataIndex: actual.address.dataIndex }
        assertMappedPixel(unmapRemappedHardwarePixel(remap, key), expected)
        assertMappedPixel(unmapRemappedHardwarePixel(remap, key), unmapHardwarePixel(mapping, key))
        keys.add(`${key.processor}/${key.port}/${key.dataIndex}`)
      }
    }
    expect(keys.size).toBe(196608)
  }, 120000)

  it('traverses every occupied port independently and proves reverse coverage and round-trip', () => {
    const inputPixels = new Set<string>()
    const ports = [
      { port: 'P01:01', cabinets: [1, 2, 3, 4, 8, 7, 6, 5] },
      { port: 'P01:02', cabinets: [9, 10, 11, 12] },
    ]
    let global = 0
    for (const port of ports) {
      let dataIndex = 0
      for (const cabinet of port.cabinets) {
        for (let module = 0; module < 16; module += 1) {
          for (let pixel = 0; pixel < 1024; pixel += 1) {
            const x = ((cabinet - 1) % 4) * 128 + (module % 4) * 32 + pixel % 32
            const y = Math.floor((cabinet - 1) / 4) * 128 + Math.floor(module / 4) * 32 + Math.floor(pixel / 32)
            const key = { processor: asProcessorId('P01'), port: asPortId(port.port), dataIndex }
            const actual = unmapRemappedHardwarePixel(remap, key)
            assertMappedPixel(actual, expectedReference(x, y, offset))
            assertMappedPixel(actual, unmapHardwarePixel(mapping, key))
            assert.equal(actual.address.dataIndex, dataIndex)
            assert.equal(actual.address.hardware.port, port.port)
            assertMappedPixel(mapRemappedInputPixel(remap, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: actual.inputCoordinate }), actual)
            assertMappedPixel(mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: actual.inputCoordinate }), actual)
            assert.equal(globalRemapIndex(mapping.hardware, key), global)
            inputPixels.add(`${actual.inputCoordinate.x}/${actual.inputCoordinate.y}`)
            dataIndex += 1
            global += 1
          }
        }
      }
      expect(dataIndex).toBe(port.port === 'P01:01' ? 131072 : 65536)
    }
    expect(global).toBe(196608)
    expect(inputPixels.size).toBe(196608)
  }, 120000)
})
