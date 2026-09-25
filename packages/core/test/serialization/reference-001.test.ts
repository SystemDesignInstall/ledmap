import { assert, describe, expect, it } from 'vitest'
import {
  asPortId, asProcessorId, globalRemapIndex, loadProject, mapInputPixel, mapRemappedInputPixel, resolveMapping,
  resolveRemap, serializeProject, unmapHardwarePixel, unmapRemappedHardwarePixel,
  type MappedPixel, type PortPixelKey, type ValidateProjectInput,
} from '../../src/index.js'
import { expectedReference, referenceMapping } from '../mapping-engine/fixtures.js'

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
    actual.address.hardware.port !== expected.address.hardware.port ||
    actual.address.hardware.receiver !== expected.address.hardware.receiver ||
    actual.address.dataIndex !== expected.address.dataIndex
  ) expect(actual).toEqual(expected)
}

describe.each([false, true])('7D REF-001 reconstruction offset=%s', offset => {
  const project: ValidateProjectInput = {
    mapping: referenceMapping(offset),
    rules: [],
  }
  const text = serializeProject({ project })
  const loaded = loadProject(text)
  const original = resolveMapping(project.mapping)
  const restored = resolveMapping(loaded.project.mapping)
  const remap = resolveRemap({ mapping: restored, rules: loaded.project.rules })

  it('stores only source configuration and keeps the report valid', () => {
    expect(loaded.validation.valid).toBe(true)
    expect(loaded.project).toEqual(project)
    for (const derived of ['localX', 'localY', 'dataIndex', 'cells', 'spans']) {
      expect(text).not.toContain(derived)
    }
  })

  it('reproduces the original mapping and remap behavior at every anchor', () => {
    for (const anchor of anchors) {
      const inputCoordinate = { x: anchor.x + (offset ? 100 : 0), y: anchor.y + (offset ? 50 : 0) }
      const expected = expectedReference(anchor.x, anchor.y, offset)
      const inputPixel = { inputCanvas: restored.inputCanvas.id, inputCoordinate }
      const mapped = mapRemappedInputPixel(remap, inputPixel)
      assertMappedPixel(mapped, expected)
      assertMappedPixel(mapped, mapInputPixel(original, inputPixel))
      const key: PortPixelKey = {
        processor: asProcessorId('P01'), port: asPortId(anchor.port), dataIndex: anchor.data,
      }
      const unmapped = unmapRemappedHardwarePixel(remap, key)
      assertMappedPixel(unmapped, expected)
      assertMappedPixel(unmapped, unmapHardwarePixel(original, key))
      assert.equal(globalRemapIndex(restored.hardware, key), anchor.global)
      assert.equal(mapped.address.dataIndex, anchor.data)
      assert.equal(mapped.cabinet, anchor.cabinet)
      assert.equal(mapped.module, anchor.module)
    }
  })

  it('sweeps all 196608 pixels identically to the source configuration', () => {
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const expected = expectedReference(x, y, offset)
        const inputPixel = { inputCanvas: restored.inputCanvas.id, inputCoordinate: expected.inputCoordinate }
        const actual = mapInputPixel(restored, inputPixel)
        assertMappedPixel(actual, expected)
        assertMappedPixel(actual, mapInputPixel(original, inputPixel))
        const key: PortPixelKey = {
          processor: actual.address.hardware.processor, port: actual.address.hardware.port, dataIndex: actual.address.dataIndex,
        }
        assertMappedPixel(unmapRemappedHardwarePixel(remap, key), expected)
      }
    }
  }, 120000)

  it('keeps receiver boundaries, snake order and port reset after a second save', () => {
    const second = serializeProject({ project: loaded.project, extensions: loaded.extensions })
    expect(second).toBe(text)
    const ports = new Set<string>()
    for (const anchor of anchors) {
      ports.add(anchor.port)
    }
    expect([...ports]).toEqual(['P01:01', 'P01:02'])
    const receiverBoundary = mapInputPixel(restored, {
      inputCanvas: restored.inputCanvas.id,
      inputCoordinate: expectedReference(384, 128, offset).inputCoordinate,
    })
    expect(receiverBoundary.cabinet).toBe('C08')
    expect(receiverBoundary.address.dataIndex).toBe(65536)
    const portReset = mapInputPixel(restored, {
      inputCanvas: restored.inputCanvas.id,
      inputCoordinate: expectedReference(0, 256, offset).inputCoordinate,
    })
    expect(portReset.address.dataIndex).toBe(0)
    expect(portReset.address.hardware.port).toBe('P01:02')
  })
})
