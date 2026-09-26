import { describe, expect, it } from 'vitest'
import {
  asCabinetId, asInputCanvasId, asMappingRegionId, asOutputSurfaceId, asProcessorId, asReceiverId, asScreenId, asSliceId,
  createMappingTransform, createOutputSurface, identityMappingTransform,
  type GeneratedSlice, type SlicePlan,
} from '../../src/index.js'

describe('Spatial output contracts', () => {
  it('keeps OutputSurface separate from LED Screen identity and validates its target', () => {
    const surface = createOutputSurface({
      id: 'surface-1',
      name: 'Resolume output',
      resolution: { width: 1920, height: 1080 },
      target: { processor: asProcessorId('P01'), outputIndex: 1 },
    })
    expect(surface).toEqual({
      id: 'surface-1',
      name: 'Resolume output',
      resolution: { width: 1920, height: 1080 },
      target: { processor: 'P01', outputIndex: 1 },
    })
    expect(() => createOutputSurface({ id: 'bad', name: 'Bad', resolution: { width: 1, height: 1 }, target: { outputIndex: -1 } }))
      .toThrowError(/INVALID_OUTPUT_INDEX/)
  })

  it('copies transform masks and exposes SlicePlan as a separate provenance-bearing contract', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const transform = createMappingTransform({ ...identityMappingTransform, mask: { enabled: true, points } })
    expect(transform.mask?.points).toEqual(points)
    expect(transform.mask?.points).not.toBe(points)
    const slice = {
      id: asSliceId('slice-1'), name: 'Port 1',
      source: { inputCanvas: asInputCanvasId('input'), rect: { x: 0, y: 0, width: 10, height: 10 } },
      target: { surface: asOutputSurfaceId('surface-1'), rect: { x: 0, y: 0, width: 10, height: 10 } },
      inputRotation: 0, outputRotation: 0, flipX: false, flipY: false,
      provenance: {
        screen: asScreenId('screen'), mappingRegion: asMappingRegionId('region'),
        receivers: [asReceiverId('R01')], cabinets: [asCabinetId('C01')],
      },
    } satisfies GeneratedSlice
    const plan: SlicePlan = { outputs: [], slices: [slice], diagnostics: [] }
    expect(plan.slices[0]!.provenance).toEqual({
      screen: 'screen', mappingRegion: 'region', receivers: ['R01'], cabinets: ['C01'],
    })
  })
})
