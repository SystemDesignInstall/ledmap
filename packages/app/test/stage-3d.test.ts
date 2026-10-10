import { describe, expect, it } from 'vitest'
import { initialCamera3D, pickStageScreen, pointInPolygon, projectStagePoint, stageBounds, stagePoint } from '../src/renderer/stage-3d.js'
import type { ScreenView } from '../src/renderer/v2-view-model.js'

function screen(id: string, x: number, y: number, columns = 2, rows = 2,
  omitted: readonly string[] = [], cabinetSize = 100): ScreenView {
  return {
    screen: { id, name: id }, x, y,
    grid: { columns, rows, cabinetWidth: cabinetSize, cabinetHeight: cabinetSize },
    cabinets: Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => ({ row, column })))
      .flat().filter(cabinet => !omitted.includes(`${cabinet.column},${cabinet.row}`)),
  } as unknown as ScreenView
}

describe('3D Composition preview', () => {
  it('centers arbitrary and negative Composition coordinates without mutating Screens', () => {
    const screens = [screen('left', -600, -200), screen('right', 400, 200)]
    expect(stageBounds(screens)).toEqual({ centerX: 0, centerY: 100, width: 1200, height: 600 })
    expect(stagePoint(-600, -200, 0, stageBounds(screens))).toEqual({ x: -600, y: 300, z: 0 })
  })

  it('projects depth with a perspective camera and rejects points behind the camera', () => {
    const bounds = stageBounds([screen('A', 0, 0)])
    const near = projectStagePoint({ x: 0, y: 0, z: 10 }, initialCamera3D, bounds, 800, 600)
    const far = projectStagePoint({ x: 0, y: 0, z: -10 }, initialCamera3D, bounds, 800, 600)
    expect(near!.depth).toBeLessThan(far!.depth)
    expect(projectStagePoint({ x: 0, y: 0, z: 100000 }, initialCamera3D, bounds, 800, 600)).toBeNull()
  })

  it('picks visible Screen faces and does not pick empty cabinet cells', () => {
    const screens = [screen('A', 0, 0, 2, 2, ['1,1'])]
    const bounds = stageBounds(screens)
    const valid = projectStagePoint(stagePoint(50, 50, 0, bounds), initialCamera3D, bounds, 800, 600)!
    const empty = projectStagePoint(stagePoint(150, 150, 0, bounds), initialCamera3D, bounds, 800, 600)!
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, valid)).toBe('A')
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, empty)).toBeNull()
  })

  it('picks the topmost Screen on exact overlap', () => {
    const screens = [screen('A', 0, 0), screen('B', 0, 0)]
    const bounds = stageBounds(screens)
    const center = projectStagePoint(stagePoint(100, 100, 0, bounds), initialCamera3D, bounds, 800, 600)!
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, center)).toBe('B')
  })

  it('picks the topmost Screen on partial overlap', () => {
    const screens = [screen('L', 0, 0, 4, 2), screen('R', 200, 0, 4, 2)]
    const bounds = stageBounds(screens)
    const shared = projectStagePoint(stagePoint(300, 100, 0, bounds), initialCamera3D, bounds, 800, 600)!
    const onlyLeft = projectStagePoint(stagePoint(100, 100, 0, bounds), initialCamera3D, bounds, 800, 600)!
    const onlyRight = projectStagePoint(stagePoint(500, 100, 0, bounds), initialCamera3D, bounds, 800, 600)!
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, shared)).toBe('R')
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, onlyLeft)).toBe('L')
    expect(pickStageScreen(screens, initialCamera3D, 800, 600, onlyRight)).toBe('R')
  })

  it('picks the nearer face when overlapping Screens have different thickness', () => {
    const small = screen('S', 0, 0, 4, 4, [], 20)
    const large = screen('L', 0, 0, 2, 2, [], 300)
    const bounds = stageBounds([small, large])
    const shared = projectStagePoint(stagePoint(40, 40, 0, bounds), initialCamera3D, bounds, 800, 600)!
    expect(pickStageScreen([small, large], initialCamera3D, 800, 600, shared)).toBe('L')
    expect(pickStageScreen([large, small], initialCamera3D, 800, 600, shared)).toBe('L')
  })
  it('handles polygon hit-testing and an empty project', () => {
    expect(stageBounds([])).toEqual({ centerX: 0, centerY: 0, width: 1, height: 1 })
    const quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(pointInPolygon({ x: 5, y: 5 }, quad)).toBe(true)
    expect(pointInPolygon({ x: 20, y: 20 }, quad)).toBe(false)
  })
})
