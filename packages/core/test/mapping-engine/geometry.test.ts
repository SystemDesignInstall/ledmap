import { describe, expect, it } from 'vitest'
import {
  mapGeometryInputPixel,
  mapInputPixel,
  resolveGeometryMapping,
  resolveMapping,
  unmapGeometryCabinetPixel,
  unmapGeometryModulePixel,
  type GeometryMappedPixel,
  type MappedPixel,
} from '../../src/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { assertFrozen, expectedReference, geometryInput, referenceMapping, smallMapping } from './fixtures.js'

function geometryFields(pixel: MappedPixel): GeometryMappedPixel {
  return {
    inputCoordinate: pixel.inputCoordinate,
    screenCoordinate: pixel.screenCoordinate,
    cabinet: pixel.cabinet,
    cabinetCoordinate: pixel.cabinetCoordinate,
    module: pixel.module,
    moduleCoordinate: pixel.moduleCoordinate,
  }
}

describe('Geometry Mapping without hardware addressing', () => {
  it('resolves and maps with zero Processor, Port and Receiver entities', () => {
    const input = smallMapping(2, 2)
    const geometry = resolveGeometryMapping(geometryInput({
      ...input,
      hardwareTopology: {
        ...input.hardwareTopology,
        processors: [],
        ports: [],
        receivers: [],
        processorOrder: [],
        receiverOrder: [],
      },
    }))
    expect(geometry.cells).toHaveLength(4)
    const pixel = mapGeometryInputPixel(geometry, {
      inputCanvas: geometry.inputCanvas.id,
      inputCoordinate: { x: 39, y: 47 },
    })
    expect(pixel).toEqual({
      inputCoordinate: { x: 39, y: 47 },
      screenCoordinate: { x: 29, y: 27 },
      cabinet: 'C3',
      cabinetCoordinate: { x: 14, y: 13 },
      module: 'C3/M06',
      moduleCoordinate: { x: 4, y: 6 },
    })
  })

  it('keeps Input, Cabinet and Module reverse lookups symmetric', () => {
    const input = smallMapping(2, 2)
    const geometry = resolveGeometryMapping(geometryInput(input))
    for (let y = 20; y < 48; y += 1) {
      for (let x = 10; x < 40; x += 1) {
        const actual = mapGeometryInputPixel(geometry, {
          inputCanvas: geometry.inputCanvas.id,
          inputCoordinate: { x, y },
        })
        expect(unmapGeometryCabinetPixel(geometry, {
          cabinet: actual.cabinet,
          coordinate: actual.cabinetCoordinate,
        })).toEqual(actual)
        expect(unmapGeometryModulePixel(geometry, {
          cabinet: actual.cabinet,
          module: actual.module,
          coordinate: actual.moduleCoordinate,
        })).toEqual(actual)
      }
    }
  })

  it('matches Phase 7 REF-001 geometry for every pixel', () => {
    const input = referenceMapping(true)
    const geometry = resolveGeometryMapping(deepFreeze(geometryInput(input)))
    const legacy = resolveMapping(input)
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const expected = expectedReference(x, y, true)
        const pixel = { inputCanvas: geometry.inputCanvas.id, inputCoordinate: expected.inputCoordinate }
        const actual = mapGeometryInputPixel(geometry, pixel)
        expect(actual).toEqual(geometryFields(expected))
        expect(actual).toEqual(geometryFields(mapInputPixel(legacy, pixel)))
      }
    }
  }, 120000)

  it('reports incomplete Cabinet and Module geometry without fake hardware', () => {
    const input = smallMapping()
    const geometry = geometryInput(input)
    const removed = geometry.cabinets[0]!.id
    expect(() => resolveGeometryMapping({
      ...geometry,
      cabinets: geometry.cabinets.slice(1),
      modules: geometry.modules.filter(module => module.cabinet !== removed),
    }))
      .toThrowError(/MAPPING_INCOMPLETE/)
    expect(() => resolveGeometryMapping({ ...geometry, modules: geometry.modules.slice(1) }))
      .toThrowError(/MAPPING_INCOMPLETE/)
  })

  it('returns an immutable compact snapshot', () => {
    const geometry = resolveGeometryMapping(deepFreeze(geometryInput(smallMapping())))
    assertFrozen(geometry)
    expect(geometry.cells).toHaveLength(4)
    assertFrozen(mapGeometryInputPixel(geometry, {
      inputCanvas: geometry.inputCanvas.id,
      inputCoordinate: { x: 10, y: 20 },
    }))
  })
})
