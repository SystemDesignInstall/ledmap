import { describe, expect, it } from 'vitest'
import { asMediaOutputCanvasId, asOutputMappingId, asScreenId, createEmptyProjectV2, type LedMapProjectV2 } from '@ledmap/core'
import { outputMappingPreviewRaster, syntheticScreenPixel } from '../src/renderer/output-mapping-preview.js'

function fixture(position?: { x: number; y: number }, second = false, mask = false): LedMapProjectV2 {
  const base = createEmptyProjectV2()
  return { ...base, design: { ...base.design,
    screens: [{ id: asScreenId('screen-a'), name: 'A', resolution: { width: 2, height: 2 },
      cabinetGridOrder: [], mappingRegionOrder: [] }],
    composition: { placements: [{ screenId: asScreenId('screen-a'), x: 500, y: 500, locked: false }] },
  }, content: { ...base.content,
    mediaOutputs: [{ id: asMediaOutputCanvasId('output'), name: 'Output', resolution: { width: 4, height: 3 } }],
    outputMappings: [{ id: asOutputMappingId('mapping-a'), screenId: asScreenId('screen-a'),
      mediaOutputId: asMediaOutputCanvasId('output'), ...(position ? { position } : {}),
      ...(mask ? { mask: { points: [{ x: 0, y: 0 }] } } : {}) },
    ...(second ? [{ id: asOutputMappingId('mapping-b'), screenId: asScreenId('screen-a'),
      mediaOutputId: asMediaOutputCanvasId('output'), position: { x: 1, y: 0 } }] : [])],
  } }
}

function pixel(raster: ReturnType<typeof outputMappingPreviewRaster>, x: number, y: number): number[] {
  const offset = (y * raster.width + x) * 4
  return [...raster.pixels!.slice(offset, offset + 4)]
}

describe('Output Mapping synthetic preview', () => {
  it('uses resolver semantics for exact output pixels independent of Layout position', () => {
    const raster = outputMappingPreviewRaster(fixture({ x: 1, y: 1 }), 'output')
    expect(raster).toMatchObject({ status: 'ready', width: 4, height: 3, exact: true })
    expect(pixel(raster, 1, 1)).toEqual(syntheticScreenPixel('screen-a', 0, 0))
    expect(pixel(raster, 2, 2)).toEqual(syntheticScreenPixel('screen-a', 1, 1))
    expect(pixel(raster, 0, 0)).toEqual([12, 20, 30, 255])
  })

  it('does not manufacture pixel-exact output for unplaced, masked or overlapping mappings', () => {
    for (const project of [fixture(), fixture({ x: 0, y: 0 }, false, true), fixture({ x: 0, y: 0 }, true)]) {
      expect(outputMappingPreviewRaster(project, 'output')).toMatchObject({ status: 'blocked', pixels: null })
    }
  })

  it('labels downsampled preview as non-exact', () => {
    expect(outputMappingPreviewRaster(fixture({ x: 0, y: 0 }), 'output', 2, 2))
      .toMatchObject({ status: 'ready', width: 2, height: 1, exact: false })
  })
})
