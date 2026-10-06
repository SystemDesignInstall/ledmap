import { describe, expect, it } from 'vitest'
import {
  compositionRasterRectToScreen, convertEditableProjectToV2, editableProjectFromValidatedProject,
  outputPointToScreen, screenPointToOutput, screenRectToCompositionRaster,
  type LedMapProjectV2,
} from '../../src/index.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

function fixture(): LedMapProjectV2 {
  const project = convertEditableProjectToV2(editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] }))
  return { ...project, design: { ...project.design,
    composition: { placements: project.design.composition.placements.map(placement => ({ ...placement, x: 160, y: 96 })) },
  } }
}

describe('explicit Composition raster coordinates', () => {
  it('round-trips Screen crop with signed frame origin without changing Input Canvas or signal order', () => {
    const project = fixture()
    const before = JSON.stringify(project)
    const screen = project.design.screens[0]!.id
    const rect = { x: 11, y: 22, width: 100, height: 40 }
    const frame = { x: -20, y: -10, width: 800, height: 600 }
    const translated = screenRectToCompositionRaster(project, screen, rect, frame)
    expect(translated).toEqual({ x: 191, y: 128, width: 100, height: 40 })
    expect(compositionRasterRectToScreen(project, screen, translated, frame)).toEqual(rect)
    expect(Object.isFrozen(translated)).toBe(true)
    expect(JSON.stringify(project)).toBe(before)
  })

  it('uses a cropped fit frame origin and includes the lower/right edge exactly once', () => {
    const project = fixture()
    const id = project.design.screens[0]!.id
    const frame = { x: 160, y: 96, width: 512, height: 384 }
    const rect = { x: 511, y: 383, width: 1, height: 1 }
    expect(screenRectToCompositionRaster(project, id, rect, frame)).toEqual(rect)
    expect(() => screenRectToCompositionRaster(project, id, { ...rect, width: 2 }, frame)).toThrow(/exceeds Screen/)
    expect(() => compositionRasterRectToScreen(project, id, { ...rect, height: 2 }, frame)).toThrow(/exceeds.*raster/)
  })

  it('rejects missing placement, chart/pixel scale mismatch, clipping and unsafe edges', () => {
    const project = fixture()
    const id = project.design.screens[0]!.id
    const rect = { x: 0, y: 0, width: 512, height: 384 }
    const frame = { x: 0, y: 0, width: 800, height: 600 }
    expect(() => screenRectToCompositionRaster({ ...project, design: { ...project.design, composition: { placements: [] } } }, id, rect, frame)).toThrow(/no usable/)
    const scaled = { ...project, design: { ...project.design,
      screens: project.design.screens.map(screen => ({ ...screen, resolution: { width: 1024, height: 768 } })),
    } }
    expect(() => screenRectToCompositionRaster(scaled, id, rect, frame)).toThrow(/differs/)
    expect(() => screenRectToCompositionRaster(project, id, rect, { ...frame, width: 200 })).toThrow(/frame/)
    expect(() => screenRectToCompositionRaster(project, id, rect, { ...frame, x: Number.MAX_SAFE_INTEGER })).toThrow(/safe integers/)
    expect(() => compositionRasterRectToScreen(project, id, { x: 0, y: 0, width: 1, height: 1 }, frame)).toThrow(/bound Screen/)
  })

  it.each([0, 90, 180, 270] as const)('round-trips every pixel of an offset equal-size %s° mapping with independent flips', angle => {
    for (const flipX of [false, true]) for (const flipY of [false, true]) {
      const turned = angle === 90 || angle === 270
      const transform = { screenRect: { x: 11, y: 22, width: 9, height: 7 },
        outputRect: { x: -3, y: 17, width: turned ? 7 : 9, height: turned ? 9 : 7 },
        inputRotation: 0 as const, outputRotation: angle, flipX, flipY }
      for (let y = 22; y < 29; y += 1) for (let x = 11; x < 20; x += 1) {
        const output = screenPointToOutput(transform, x, y)!
        expect(outputPointToScreen(transform, output.x, output.y)).toEqual({ x, y })
      }
      expect(screenPointToOutput(transform, 20, 22)).toBeNull()
      expect(outputPointToScreen(transform, transform.outputRect.x + transform.outputRect.width, 17)).toBeNull()
    }
  })
})
