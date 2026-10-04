import { describe, expect, it } from 'vitest'
import { asMediaOutputCanvasId, asOutputMappingId, asScreenId, createEmptyProjectV2, type LedMapProjectV2, type OutputMapping } from '@ledmap/core'
import { outputMappingPreviewRaster, syntheticScreenPixel } from '../src/renderer/output-mapping-preview.js'

function fixture(outputRect?: { x: number; y: number }, second = false, mask = false): LedMapProjectV2 {
  const base = createEmptyProjectV2()
  const mappings: OutputMapping[] = [{ id: asOutputMappingId('mapping-a'), name: 'mapping-a', enabled: true,
    screenId: asScreenId('screen-a'), mediaOutputId: asMediaOutputCanvasId('output'),
    screenRect: { x: 0, y: 0, width: 2, height: 2 },
    outputRect: { x: outputRect?.x ?? 0, y: outputRect?.y ?? 0, width: 2, height: 2 },
    inputRotation: 0 as const, outputRotation: 0 as const, flipX: false, flipY: false,
    ...(mask ? { mask: { enabled: true, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }] } } : {}) },
  ...(second ? [{ id: asOutputMappingId('mapping-b'), name: 'mapping-b', enabled: true,
    screenId: asScreenId('screen-a'), mediaOutputId: asMediaOutputCanvasId('output'),
    screenRect: { x: 0, y: 0, width: 2, height: 2 },
    outputRect: { x: 1, y: 0, width: 2, height: 2 },
    inputRotation: 0 as const, outputRotation: 0 as const, flipX: false, flipY: false }] : [])]
  return { ...base, design: { ...base.design,
    screens: [{ id: asScreenId('screen-a'), name: 'A', resolution: { width: 2, height: 2 },
      cabinetGridOrder: [], mappingRegionOrder: [] }],
    composition: { placements: [{ screenId: asScreenId('screen-a'), x: 500, y: 500, locked: false }] },
  }, content: { ...base.content,
    mediaOutputs: [{ id: asMediaOutputCanvasId('output'), name: 'Output', resolution: { width: 4, height: 3 },
      mappingOrder: mappings.map(value => value.id) }],
    outputMappings: mappings,
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
    expect(pixel(raster, 1, 1)).toEqual([...syntheticScreenPixel('screen-a', 0, 0)])
    expect(pixel(raster, 2, 2)).toEqual([...syntheticScreenPixel('screen-a', 1, 1)])
    expect(pixel(raster, 0, 0)).toEqual([12, 20, 30, 255])
  })

  it('does not manufacture pixel-exact output for overlapping mappings', () => {
    expect(outputMappingPreviewRaster(fixture({ x: 0, y: 0 }, true), 'output')).toMatchObject({ status: 'blocked', pixels: null })
  })

  it('renders masked-out pixels as background instead of blocking the preview', () => {
    const raster = outputMappingPreviewRaster(fixture({ x: 0, y: 0 }, false, true), 'output')
    expect(raster.status).toBe('ready')
  })

  it('labels downsampled preview as non-exact', () => {
    expect(outputMappingPreviewRaster(fixture({ x: 0, y: 0 }), 'output', 2, 2))
      .toMatchObject({ status: 'ready', width: 2, height: 1, exact: false })
  })
})
