import { asCabinetGridId, asInputCanvasId, asMappingRegionId, asScreenId, type MappingRegion } from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { hitMappingRegion, resizeMappingRegion } from '../src/renderer/mapping-canvas.js'

function region(id: string, x: number, y: number, width: number, height: number): MappingRegion {
  return {
    id: asMappingRegionId(id),
    inputCanvas: asInputCanvasId('input'),
    screen: asScreenId('screen'),
    grid: asCabinetGridId('grid'),
    position: { x, y },
    size: { width, height },
  }
}

describe('Mapping canvas interaction geometry', () => {
  it('hit-tests the visually topmost Mapping Region', () => {
    const back = region('back', 10, 10, 100, 100)
    const front = region('front', 40, 40, 100, 100)
    expect(hitMappingRegion([back, front], { x: 50, y: 50 })?.id).toBe('front')
    expect(hitMappingRegion([back, front], { x: 200, y: 200 })).toBeNull()
  })

  it('resizes every edge with integer geometry and a one-pixel minimum', () => {
    const source = region('region', 100, 80, 400, 300)
    expect(resizeMappingRegion(source, 'nw', -24.6, -30.4)).toEqual({ x: 75, y: 50, width: 425, height: 330 })
    expect(resizeMappingRegion(source, 'se', 50.8, 25.2)).toEqual({ x: 100, y: 80, width: 451, height: 325 })
    expect(resizeMappingRegion(source, 'w', 999, 0)).toEqual({ x: 499, y: 80, width: 1, height: 300 })
    expect(resizeMappingRegion(source, 'n', 0, -999)).toEqual({ x: 100, y: 0, width: 400, height: 380 })
  })
})
