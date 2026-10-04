import { describe, expect, it } from 'vitest'
import {
  asMediaOutputCanvasId, asOutputMappingId, asScreenId, createEmptyProjectV2,
  createMediaOutputPixelResolver, inspectMediaOutputMapping, resolveMediaOutputPixel, resolveScreenPixelToOutput,
  type LedMapProjectV2, type OutputMapping, type QuarterTurn,
} from '../src/index.js'

interface MappingSpec {
  readonly id: string
  readonly screenId: string
  readonly screenRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly outputRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly inputRotation?: QuarterTurn
  readonly outputRotation?: QuarterTurn
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly enabled?: boolean
  readonly mask?: { readonly enabled: boolean; readonly points: readonly { readonly x: number; readonly y: number }[] }
}

function project(
  output: { width: number; height: number },
  screens: readonly { id: string; width: number; height: number }[],
  mappings: readonly MappingSpec[],
): LedMapProjectV2 {
  const empty = createEmptyProjectV2()
  const outputId = asMediaOutputCanvasId('output')
  return { ...empty, design: { ...empty.design,
    screens: screens.map(value => ({ id: asScreenId(value.id), name: value.id,
      resolution: { width: value.width, height: value.height }, cabinetGridOrder: [], mappingRegionOrder: [] })),
    composition: { placements: screens.map(value => ({ screenId: asScreenId(value.id), x: 999, y: 999, locked: false })) },
  }, content: { ...empty.content,
    mediaOutputs: [{ id: outputId, name: 'Output', resolution: output,
      mappingOrder: mappings.map(value => asOutputMappingId(value.id)) }],
    outputMappings: mappings.map((value): OutputMapping => {
      const screen = screens.find(item => item.id === value.screenId)!
      return { id: asOutputMappingId(value.id), name: value.id, enabled: value.enabled ?? true,
        screenId: asScreenId(value.screenId), mediaOutputId: outputId,
        screenRect: value.screenRect ?? { x: 0, y: 0, width: screen.width, height: screen.height },
        outputRect: value.outputRect ?? { x: 0, y: 0, width: screen.width, height: screen.height },
        inputRotation: value.inputRotation ?? 0, outputRotation: value.outputRotation ?? 0,
        flipX: value.flipX ?? false, flipY: value.flipY ?? false,
        ...(value.mask === undefined ? {} : { mask: value.mask }) }
    }),
  } }
}

describe('v5 Output Mapping resolver', () => {
  it('maps Screen (1,2) at (10,20) to Media Output (11,22) without Layout placement', () => {
    const input = project({ width: 20, height: 30 }, [{ id: 'screen', width: 4, height: 3 }],
      [{ id: 'mapping', screenId: 'screen', outputRect: { x: 10, y: 20, width: 4, height: 3 } }])
    expect(resolveMediaOutputPixel(input, 'output', 11, 22)).toEqual({ status: 'resolved',
      mappingId: 'mapping', screenId: 'screen', screenX: 1, screenY: 2 })
    expect(resolveMediaOutputPixel(input, 'output', 14, 22)).toEqual({ status: 'empty' })
    expect(inspectMediaOutputMapping(input, 'output').placements[0]?.coverage).toBe('inside')
  })

  it('clips half-open Screen 4x3 at (-1,1) in Output 6x4', () => {
    const input = project({ width: 6, height: 4 }, [{ id: 'screen', width: 4, height: 3 }],
      [{ id: 'mapping', screenId: 'screen', outputRect: { x: -1, y: 1, width: 4, height: 3 } }])
    const inspection = inspectMediaOutputMapping(input, 'output')
    expect(inspection.placements[0]).toMatchObject({ coverage: 'partially-clipped',
      visibleRect: { x: 0, y: 1, width: 3, height: 3 } })
    expect(inspection.diagnostics.map(value => value.code)).toEqual(['OUTPUT_MAPPING_PARTIALLY_CLIPPED'])
    expect(resolveMediaOutputPixel(input, 'output', 0, 1)).toMatchObject({ status: 'resolved', screenX: 1, screenY: 0 })
    expect(resolveMediaOutputPixel(input, 'output', 2, 3)).toMatchObject({ status: 'resolved', screenX: 3, screenY: 2 })
    expect(resolveMediaOutputPixel(input, 'output', 3, 3)).toEqual({ status: 'empty' })
  })

  it('crops a sub-rect of the Screen into the Output', () => {
    const input = project({ width: 4, height: 4 }, [{ id: 'screen', width: 4, height: 4 }],
      [{ id: 'mapping', screenId: 'screen',
        screenRect: { x: 1, y: 1, width: 2, height: 2 },
        outputRect: { x: 0, y: 0, width: 2, height: 2 } }])
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toMatchObject({ status: 'resolved', screenX: 1, screenY: 1 })
    expect(resolveMediaOutputPixel(input, 'output', 1, 1)).toMatchObject({ status: 'resolved', screenX: 2, screenY: 2 })
    expect(resolveMediaOutputPixel(input, 'output', 2, 0)).toEqual({ status: 'empty' })
    expect(resolveScreenPixelToOutput(input, 'mapping', 1, 1)).toEqual({ x: 0, y: 0 })
    expect(resolveScreenPixelToOutput(input, 'mapping', 0, 0)).toBeNull()
  })

  it('resolves two Screens independently when visible rectangles do not overlap', () => {
    const input = project({ width: 5, height: 3 }, [{ id: 'a', width: 2, height: 2 }, { id: 'b', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: 0, y: 0, width: 2, height: 2 } },
        { id: 'b1', screenId: 'b', outputRect: { x: 3, y: 1, width: 2, height: 2 } }])
    const resolve = createMediaOutputPixelResolver(input, 'output')
    expect(resolve(1, 1)).toMatchObject({ status: 'resolved', mappingId: 'a1', screenX: 1, screenY: 1 })
    expect(resolve(3, 1)).toMatchObject({ status: 'resolved', mappingId: 'b1', screenX: 0, screenY: 0 })
    expect(resolve(2, 1)).toEqual({ status: 'empty' })
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
  })

  it('allows one Screen in multiple mappings and edge-touch without a hidden layer order', () => {
    const input = project({ width: 4, height: 2 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: 0, y: 0, width: 2, height: 2 } },
        { id: 'a2', screenId: 'a', outputRect: { x: 2, y: 0, width: 2, height: 2 } }])
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
    expect(resolveMediaOutputPixel(input, 'output', 2, 0)).toMatchObject({ status: 'resolved', mappingId: 'a2' })
  })

  it('reports overlap and blocks only conflicted pixels', () => {
    const input = project({ width: 4, height: 2 }, [{ id: 'a', width: 2, height: 2 }, { id: 'b', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: 0, y: 0, width: 2, height: 2 } },
        { id: 'b1', screenId: 'b', outputRect: { x: 1, y: 0, width: 2, height: 2 } }])
    expect(inspectMediaOutputMapping(input, 'output').diagnostics.map(value => value.code)).toContain('OUTPUT_MAPPING_OVERLAP')
    expect(resolveMediaOutputPixel(input, 'output', 1, 0)).toEqual({ status: 'blocked', code: 'OUTPUT_MAPPING_OVERLAP' })
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toMatchObject({ status: 'resolved', mappingId: 'a1' })
  })

  it('ignores disabled mappings in inspection and resolution', () => {
    const input = project({ width: 4, height: 4 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', enabled: false, outputRect: { x: 0, y: 0, width: 2, height: 2 } }])
    expect(inspectMediaOutputMapping(input, 'output').placements[0]?.coverage).toBe('disabled')
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toEqual({ status: 'empty' })
  })

  it('treats masked-out pixels as empty and keeps masked-in pixels resolvable', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }]
    const input = project({ width: 4, height: 4 }, [{ id: 'a', width: 4, height: 4 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: 0, y: 0, width: 4, height: 4 },
        mask: { enabled: true, points: triangle } }])
    expect(inspectMediaOutputMapping(input, 'output').diagnostics).toEqual([])
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toMatchObject({ status: 'resolved' })
    expect(resolveMediaOutputPixel(input, 'output', 3, 3)).toEqual({ status: 'empty' })
    const disabledMask = project({ width: 4, height: 4 }, [{ id: 'a', width: 4, height: 4 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: 0, y: 0, width: 4, height: 4 },
        mask: { enabled: false, points: triangle } }])
    expect(resolveMediaOutputPixel(disabledMask, 'output', 3, 3)).toMatchObject({ status: 'resolved' })
  })

  it('handles fully outside and safe-integer extreme positions without overflow', () => {
    const input = project({ width: 4, height: 4 }, [{ id: 'a', width: 2, height: 2 }],
      [{ id: 'a1', screenId: 'a', outputRect: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 2, height: 2 } }])
    expect(inspectMediaOutputMapping(input, 'output').placements[0]).toMatchObject({ coverage: 'outside', visibleRect: null })
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toEqual({ status: 'empty' })
  })
})

describe('v5 quarter-turn and flip transforms', () => {
  const screen = { id: 's', width: 3, height: 2 }
  function single(mapping: Omit<MappingSpec, 'id' | 'screenId'>, output = { width: 4, height: 4 }): LedMapProjectV2 {
    return project(output, [screen], [{ id: 'm', screenId: 's', ...mapping }])
  }

  it('rotates 90 degrees clockwise', () => {
    const input = single({ outputRect: { x: 10, y: 20, width: 2, height: 3 }, inputRotation: 0, outputRotation: 90 }, { width: 20, height: 30 })
    expect(resolveMediaOutputPixel(input, 'output', 10, 20)).toMatchObject({ screenX: 0, screenY: 1 })
    expect(resolveMediaOutputPixel(input, 'output', 11, 22)).toMatchObject({ screenX: 2, screenY: 0 })
    expect(resolveScreenPixelToOutput(input, 'm', 0, 1)).toEqual({ x: 10, y: 20 })
  })

  it('rotates 180 degrees', () => {
    const input = single({ outputRect: { x: 0, y: 0, width: 3, height: 2 }, inputRotation: 0, outputRotation: 180 })
    expect(resolveMediaOutputPixel(input, 'output', 0, 0)).toMatchObject({ screenX: 2, screenY: 1 })
    expect(resolveScreenPixelToOutput(input, 'm', 2, 1)).toEqual({ x: 0, y: 0 })
  })

  it('rotates 270 degrees clockwise', () => {
    const input = single({ outputRect: { x: 5, y: 5, width: 2, height: 3 }, inputRotation: 0, outputRotation: 270 }, { width: 20, height: 20 })
    expect(resolveMediaOutputPixel(input, 'output', 5, 5)).toMatchObject({ screenX: 2, screenY: 0 })
    expect(resolveScreenPixelToOutput(input, 'm', 0, 0)).toEqual({ x: 5, y: 7 })
  })

  it('uses net rotation output minus input', () => {
    const input = single({ outputRect: { x: 0, y: 0, width: 3, height: 2 }, inputRotation: 90, outputRotation: 90 })
    expect(resolveMediaOutputPixel(input, 'output', 1, 1)).toMatchObject({ screenX: 1, screenY: 1 })
  })

  it('flips horizontally and vertically', () => {
    const h = single({ outputRect: { x: 0, y: 0, width: 3, height: 2 }, flipX: true })
    expect(resolveMediaOutputPixel(h, 'output', 0, 0)).toMatchObject({ screenX: 2, screenY: 0 })
    const v = single({ outputRect: { x: 0, y: 0, width: 3, height: 2 }, flipY: true })
    expect(resolveMediaOutputPixel(v, 'output', 0, 0)).toMatchObject({ screenX: 0, screenY: 1 })
    const both = single({ outputRect: { x: 0, y: 0, width: 3, height: 2 }, flipX: true, flipY: true })
    expect(resolveMediaOutputPixel(both, 'output', 0, 0)).toMatchObject({ screenX: 2, screenY: 1 })
  })

  it('keeps forward and reverse symmetric for 1:1 mappings', () => {
    const input = single({ outputRect: { x: 1, y: 1, width: 2, height: 3 }, inputRotation: 0, outputRotation: 90, flipX: true }, { width: 10, height: 10 })
    for (let sy = 0; sy < 2; sy += 1) {
      for (let sx = 0; sx < 3; sx += 1) {
        const out = resolveScreenPixelToOutput(input, 'm', sx, sy)!
        const back = resolveMediaOutputPixel(input, 'output', out.x, out.y)
        expect(back).toMatchObject({ status: 'resolved', screenX: sx, screenY: sy })
      }
    }
  })
})
