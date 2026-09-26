import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId, asMappingRegionId, mapInputPixel, resolveMapping, unmapHardwarePixel,
  type MappingTransform, type QuarterTurn, type ResolveMappingInput,
} from '../../src/index.js'
import { smallMapping } from './fixtures.js'

function spatialInput(
  inputRotation: QuarterTurn = 0,
  screenRotation: QuarterTurn = 0,
  flipX = false,
  flipY = false,
  mask?: MappingTransform['mask'],
): ResolveMappingInput {
  const base = smallMapping(1, 1, 1, 1, 3, 2)
  const inputSize = inputRotation === 90 || inputRotation === 270
    ? { width: 2, height: 3 }
    : { width: 3, height: 2 }
  const screenSize = screenRotation === 90 || screenRotation === 270
    ? { width: 2, height: 3 }
    : { width: 3, height: 2 }
  return {
    ...base,
    inputCanvas: { ...base.inputCanvas, resolution: { width: 20, height: 20 } },
    screen: {
      ...base.screen,
      resolution: { width: 30, height: 30 },
      mappingRegions: [...base.screen.mappingRegions, asMappingRegionId('another-region')],
      cabinetGrids: [...base.screen.cabinetGrids, asCabinetGridId('another-grid')],
    },
    region: {
      ...base.region,
      inputRect: { x: 4, y: 5, ...inputSize },
      screenRect: { x: 7, y: 8, ...screenSize },
      transform: { inputRotation, screenRotation, flipX, flipY, ...(mask === undefined ? {} : { mask }) },
    },
  }
}

function keyOf(mapped: ReturnType<typeof mapInputPixel>) {
  return {
    processor: mapped.address.hardware.processor,
    port: mapped.address.hardware.port,
    dataIndex: mapped.address.dataIndex,
  }
}

describe('Spatial MappingRegion transforms', () => {
  it.each([
    [0, { x: 0, y: 0 }],
    [90, { x: 2, y: 0 }],
    [180, { x: 2, y: 1 }],
    [270, { x: 0, y: 1 }],
  ] as const)('applies input rotation %s independently in physical Grid space', (inputRotation, cabinetCoordinate) => {
    const mapping = resolveMapping(spatialInput(inputRotation))
    const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 4, y: 5 } })
    expect(mapped.cabinetCoordinate).toEqual(cabinetCoordinate)
    expect(mapped.screenCoordinate).toEqual({ x: 7 + cabinetCoordinate.x, y: 8 + cabinetCoordinate.y })
    expect(unmapHardwarePixel(mapping, keyOf(mapped))).toEqual(mapped)
  })

  it.each([
    [0, { x: 7, y: 8 }],
    [90, { x: 8, y: 8 }],
    [180, { x: 9, y: 9 }],
    [270, { x: 7, y: 10 }],
  ] as const)('applies screen rotation %s without changing physical Grid ownership', (screenRotation, screenCoordinate) => {
    const mapping = resolveMapping(spatialInput(0, screenRotation))
    const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 4, y: 5 } })
    expect(mapped.cabinetCoordinate).toEqual({ x: 0, y: 0 })
    expect(mapped.screenCoordinate).toEqual(screenCoordinate)
    expect(unmapHardwarePixel(mapping, keyOf(mapped))).toEqual(mapped)
  })

  it.each([
    [false, false, { x: 0, y: 0 }],
    [true, false, { x: 2, y: 0 }],
    [false, true, { x: 0, y: 1 }],
    [true, true, { x: 2, y: 1 }],
  ] as const)('applies flipX=$0 and flipY=$1 independently', (flipX, flipY, cabinetCoordinate) => {
    const mapping = resolveMapping(spatialInput(0, 0, flipX, flipY))
    const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x: 4, y: 5 } })
    expect(mapped.cabinetCoordinate).toEqual(cabinetCoordinate)
    expect(unmapHardwarePixel(mapping, keyOf(mapped)).inputCoordinate).toEqual({ x: 4, y: 5 })
  })

  it('round-trips every valid pixel through transforms and hardware addressing', () => {
    const mapping = resolveMapping(spatialInput(90, 270, true, true))
    for (let y = 5; y < 8; y += 1) {
      for (let x = 4; x < 6; x += 1) {
        const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y } })
        expect(unmapHardwarePixel(mapping, keyOf(mapped))).toEqual(mapped)
      }
    }
  })

  it('keeps all quarter-turn and flip combinations bijective', () => {
    const rotations: readonly QuarterTurn[] = [0, 90, 180, 270]
    for (const inputRotation of rotations) {
      for (const screenRotation of rotations) {
        for (const [flipX, flipY] of [[false, false], [true, false], [false, true], [true, true]] as const) {
          const mapping = resolveMapping(spatialInput(inputRotation, screenRotation, flipX, flipY))
          const addresses = new Set<number>()
          const screenPixels = new Set<string>()
          const rect = mapping.region.inputRect
          for (let y = rect.y; y < rect.y + rect.height; y += 1) {
            for (let x = rect.x; x < rect.x + rect.width; x += 1) {
              const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y } })
              expect(unmapHardwarePixel(mapping, keyOf(mapped))).toEqual(mapped)
              addresses.add(mapped.address.dataIndex)
              screenPixels.add(`${mapped.screenCoordinate.x},${mapped.screenCoordinate.y}`)
            }
          }
          expect(addresses.size).toBe(6)
          expect(screenPixels.size).toBe(6)
        }
      }
    }
  })

  it('uses input-local polygon masks and rejects reverse ownership for excluded pixels', () => {
    const mapping = resolveMapping(spatialInput(0, 0, false, false, {
      enabled: true,
      points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
    }))
    for (const x of [4, 5]) {
      const mapped = mapInputPixel(mapping, { inputCanvas: mapping.inputCanvas.id, inputCoordinate: { x, y: 5 } })
      expect(unmapHardwarePixel(mapping, keyOf(mapped))).toEqual(mapped)
    }
    expect(() => mapInputPixel(mapping, {
      inputCanvas: mapping.inputCanvas.id,
      inputCoordinate: { x: 6, y: 5 },
    })).toThrowError(/MAPPING_OUT_OF_RANGE/)
    const port = mapping.hardware.ports[0]!
    expect(() => unmapHardwarePixel(mapping, {
      processor: port.processor,
      port: port.port,
      dataIndex: 2,
    })).toThrowError(/MAPPING_OUT_OF_RANGE/)
  })
})
