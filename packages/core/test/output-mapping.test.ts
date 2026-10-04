import { describe, expect, it } from 'vitest'
import {
  asMediaOutputCanvasId, asOutputMappingId, asScreenId, createEmptyProjectV2,
  createMediaOutputPixelResolver, inspectMediaOutputMapping, resolveMediaOutputPixel,
  type LedMapProjectV2,
} from '../src/index.js'

function project(
  output: { width: number; height: number },
  screens: readonly { id: string; width: number; height: number }[],
  mappings: readonly { id: string; screenId: string; position?: { x: number; y: number }; mask?: { points: readonly { x: number; y: number }[] } }[],
): LedMapProjectV2 {
  const empty = createEmptyProjectV2()
  return { ...empty, design: { ...empty.design,
    screens: screens.map(value => ({ id: asScreenId(value.id), name: value.id,
      resolution: { width: value.width, height: value.height }, cabinetGridOrder: [], mappingRegionOrder: [] })),
    composition: { placements: screens.map(value => ({ screenId: asScreenId(value.id), x: 999, y: 999, locked: false })) },
  }, content: { ...empty.content,
    mediaOutputs: [{ id: asMediaOutputCanvasId('output'), name: 'Output', resolution: output }],
    outputMappings: mappings.map(value => ({ id: asOutputMappingId(value.id), screenId: asScreenId(value.screenId),
      mediaOutputId: asMediaOutputCanvasId('output'), ...(value.position ? { position: value.position } : {}),
      ...(value.mask ? { mask: value.mask } : {}) })),
  } }
}

describe('translation-only Output Mapping resolver', () => {
  it('maps Screen (1,2) at (10,20) to Media Output (11,22) without Layout placement', () => {
    const input = project({ width: 20, height: 30 }, [{ id: 'screen', width: 4, height: 3 }],
      [{ id: 'mapping', screenId: 'screen', position: { x: 10, y: 20 } }])
    expect(resolveMediaOutputPixel(input, 'output', 11, 22)).toEqual({ status: 'resolved',
      mappingId: 'mapping', screenId: 'screen', screenX: 1, screenY: 2 })
    expect(resolveMediaOutputPixel(input, 'output', 14, 22)).toEqual({ status: 'empty' })
    expect(inspectMediaOutputMapping(input, 'output').placements[0]?.coverage).toBe('inside')
  })

  it('clips half-open Screen 4x3 at (-1,1) in Output 6x4', () => {
    const input = project({ width: 6, height: 4 }, [{ id: 'screen', width: 4, height: 3 }],
      [{ id: 'mapping', screenId: 'screen', position: { x: -1, y: 1 } }])
    const inspection = inspectMediaOutputMapping(input, 'output')
    expect(inspection.placements[0]).toMatchObject({ coverage: 'partially-clipped',
      visibleRect: { x: 0, y: 1, width: 3, height: 3 } })
    expect(inspection.diagnostics.map(value => value.code)).toEqual(['OUTPUT_MAPPING_PARTIALLY_CLIPPED'])
    expect(resolveMediaOutputPixel(input, 'output', 0, 1)).toMatchObject({ status: 'resolved', screenX: 1, screenY: 0 })
    expect(resolveMediaOutputPixel(input, 'output', 2, 3)).toMatchObject({ status: 'resolved', screenX: 3, screenY: 2 })
    expect(resolveMediaOutputPixel(input, 'output', 3, 3)).toEqual({ status: 'empty' })
  })

  it('resolves two Screens independently when visible rectangles do not overlap', () => {
    const input = project({ width: 5, height: 3 }, [{ id: 'a', width: 2, height: 2 }, { id: 'b', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', position: { x: 0, y: 0 } },
        { id: 'b1', screenId: 'b', position: { x: 3, y: 1 } }])
    const resolve = createMediaOutputPixelResolver(input, 'output')
    expect(resolve(1, 1)).toMatchObject({ status: 'resolved', mappingId: 'a1', screenX: 1, screenY: 1 })
    expect(resolve(3, 1)).toMatchObject({ status: 'resolved', mappingId: 'b1', screenX: 0, screenY: 0 })
    expect(resolve(2, 1)).toEqual({ status: 'empty' })
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
  })

  it('allows one Screen in multiple mappings and edge-touch without a hidden layer order', () => {
    const input = project({ width: 4, height: 2 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', position: { x: 0, y: 0 } },
        { id: 'a2', screenId: 'a', position: { x: 2, y: 0 } }])
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
    expect(resolveMediaOutputPixel(input, 'output', 2, 0)).toMatchObject({ status: 'resolved', mappingId: 'a2' })
    const multiOutput = { ...input, content: { ...input.content,
      mediaOutputs: [...input.content.mediaOutputs, { id: asMediaOutputCanvasId('second'), name: 'Second',
        resolution: { width: 4, height: 2 } }],
      outputMappings: [...input.content.outputMappings, { id: asOutputMappingId('a3'),
        screenId: asScreenId('a'), mediaOutputId: asMediaOutputCanvasId('second'), position: { x: 1, y: 0 } }] } }
    expect(resolveMediaOutputPixel(multiOutput, 'second', 1, 0)).toMatchObject({ status: 'resolved', mappingId: 'a3' })
  })

  it('reports overlap and blocks only conflicted pixels', () => {
    const input = project({ width: 4, height: 2 }, [{ id: 'a', width: 2, height: 2 }, { id: 'b', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', position: { x: 0, y: 0 } },
        { id: 'b1', screenId: 'b', position: { x: 1, y: 0 } }])
    expect(inspectMediaOutputMapping(input, 'output').diagnostics.map(value => value.code)).toContain('OUTPUT_MAPPING_OVERLAP')
    expect(resolveMediaOutputPixel(input, 'output', 1, 0)).toEqual({ status: 'blocked', code: 'OUTPUT_MAPPING_OVERLAP' })
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toMatchObject({ status: 'resolved', mappingId: 'a1' })
  })

  it('keeps unplaced and masked mappings non-resolvable', () => {
    const unplaced = project({ width: 4, height: 4 }, [{ id: 'a', width: 2, height: 2 }], [{ id: 'a1', screenId: 'a' }])
    expect(inspectMediaOutputMapping(unplaced, 'output').diagnostics.map(value => value.code)).toContain('OUTPUT_MAPPING_UNPLACED')
    expect(resolveMediaOutputPixel(unplaced, 'output', 0, 0)).toEqual({ status: 'blocked', code: 'OUTPUT_MAPPING_UNPLACED' })
    const masked = project({ width: 4, height: 4 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', position: { x: 0, y: 0 }, mask: { points: [{ x: 0, y: 0 }] } }])
    expect(inspectMediaOutputMapping(masked, 'output').diagnostics.map(value => value.code)).toContain('OUTPUT_MASK_UNSUPPORTED')
    expect(resolveMediaOutputPixel(masked, 'output', 0, 0)).toEqual({ status: 'blocked', code: 'OUTPUT_MASK_UNSUPPORTED' })
  })

  it('handles fully outside and safe-integer extreme positions without overflow', () => {
    const input = project({ width: 4, height: 4 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', position: { x: Number.MAX_SAFE_INTEGER, y: 0 } }])
    expect(inspectMediaOutputMapping(input, 'output').placements[0]).toMatchObject({ coverage: 'outside', visibleRect: null })
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toEqual({ status: 'empty' })
  })
})
