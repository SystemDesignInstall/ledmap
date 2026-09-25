import { describe, expect, it } from 'vitest'
import { cabinetOrder } from '@ledmap/core'
import {
  addScreen, createDemoProject, findScreen, hitTest, moveScreen, projectBounds, screenBounds,
  setScreenPosition,
} from '../src/renderer/project.js'

function firstOrder(project: ReturnType<typeof createDemoProject>): number[] {
  return project.screens[0]!.cabinets.map(c => c.index + 1)
}

describe('Project canvas state', () => {
  it('builds the demo project: 3 screens with positions and sizes', () => {
    const project = createDemoProject()
    expect(project.screens).toHaveLength(3)
    expect(project.screens.map(s => s.screen.name)).toEqual(['Screen 1', 'Screen 2', 'Screen 3'])
    expect(project.screens.map(s => [s.x, s.y])).toEqual([[0, 0], [700, 120], [320, 620]])
    expect(project.screens.map(s => [s.screen.resolution.width, s.screen.resolution.height]))
      .toEqual([[512, 384], [384, 256], [512, 256]])
    expect(project.screens.map(s => s.cabinets.length)).toEqual([12, 6, 8])
  })

  it('preserves the REF-001 snake order on Screen 1 and shares the core path', () => {
    const project = createDemoProject()
    const screen = project.screens[0]!
    expect(screen.cabinets.map(c => c.index + 1)).toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
    expect(screen.cabinets.map(c => c.id)).toEqual(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'])
    expect(screen.path).toEqual(cabinetOrder(screen.grid))
    expect(screen.path.map(p => [p.column, p.row]))
      .toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]])
  })

  it('moves a screen without touching cabinet IDs, order or geometry', () => {
    const original = createDemoProject()
    const moved = moveScreen(original, 'screen-1', 50, 90)
    const screen = moved.screens[0]!
    expect([screen.x, screen.y]).toEqual([50, 90])
    expect(firstOrder(moved)).toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
    expect(screen.cabinets.map(c => c.id)).toEqual(original.screens[0]!.cabinets.map(c => c.id))
    expect(screen.path).toEqual(original.screens[0]!.path)
    expect(screen.grid).toBe(original.screens[0]!.grid)
    expect(moved.screens[1]!).toEqual(original.screens[1])
    expect(moved.screens[2]!).toEqual(original.screens[2])
  })

  it('supports negative project coordinates without changing signal order', () => {
    const original = createDemoProject()
    const moved = setScreenPosition(original, 'screen-1', -120, -80)
    expect([moved.screens[0]!.x, moved.screens[0]!.y]).toEqual([-120, -80])
    expect(firstOrder(moved)).toEqual(firstOrder(original))
    expect(moved.screens[0]!.screen.id).toBe('screen-1')
  })

  it('computes project bounds for the demo and after moving a screen into negative space', () => {
    const project = createDemoProject()
    expect(projectBounds(project)).toEqual({ left: 0, top: 0, right: 1084, bottom: 876, width: 1084, height: 876 })
    const moved = setScreenPosition(project, 'screen-1', -100, -50)
    expect(projectBounds(moved)).toEqual({ left: -100, top: -50, right: 1084, bottom: 876, width: 1184, height: 926 })
  })

  it('offers per-screen bounds from the derived resolution', () => {
    const project = createDemoProject()
    expect(screenBounds(project.screens[1]!)).toEqual({ left: 700, top: 120, right: 1084, bottom: 376, width: 384, height: 256 })
  })

  it('hit-tests the topmost screen and resolves cabinets inside the grid', () => {
    const project = createDemoProject()
    const first = hitTest(project, { x: 10, y: 10 })!
    expect(first.screen.screen.name).toBe('Screen 1')
    expect(first.cabinet?.id).toBe('C01')

    const last = hitTest(project, { x: 511, y: 383 })!
    expect(last.screen.screen.name).toBe('Screen 1')
    expect(last.cabinet?.id).toBe('C12')

    const onSecond = hitTest(project, { x: 710, y: 130 })!
    expect(onSecond.screen.screen.name).toBe('Screen 2')

    expect(hitTest(project, { x: 1500, y: 1500 })).toBeNull()
  })

  it('adds a screen offset from the previous one with default grid parameters', () => {
    const project = addScreen(createDemoProject())
    expect(project.screens).toHaveLength(4)
    const fresh = project.screens[3]!
    expect(fresh.screen.id).toBe('screen-4')
    expect(fresh.screen.name).toBe('Screen 4')
    expect([fresh.x, fresh.y]).toEqual([420, 720])
    expect(fresh.cabinets).toHaveLength(12)
    expect(fresh.screen.resolution).toEqual({ width: 512, height: 384 })
    expect([fresh.screen.id, fresh.grid.screen]).toEqual(['screen-4', 'screen-4'])
  })

  it('keeps findScreen usable for selection lookups', () => {
    const project = createDemoProject()
    expect(findScreen(project, 'screen-2')?.screen.name).toBe('Screen 2')
    expect(findScreen(project, 'missing')).toBeUndefined()
  })
})
