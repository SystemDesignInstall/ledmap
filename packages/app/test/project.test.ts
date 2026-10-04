import { describe, expect, it } from 'vitest'
import { cabinetOrder } from '@ledmap/core'
import {
  addScreen, createProject, deleteScreens, duplicateScreen, findScreen, hitTest, moveScreen, projectBounds, renameScreen,
  screenBounds, setScreenPosition, setScreenPositions,
} from '../src/renderer/project.js'
import { createTestProject } from './project-fixtures.js'
import { initialDraft } from '../src/renderer/state.js'

function firstOrder(project: ReturnType<typeof createTestProject>): number[] {
  return project.screens[0]!.cabinets.map(c => c.index + 1)
}

describe('Project canvas state', () => {
  it('builds the demo project: 3 screens with positions and sizes', () => {
    const project = createTestProject()
    expect(project.screens).toHaveLength(3)
    expect(project.screens.map(s => s.screen.name)).toEqual(['Screen 1', 'Screen 2', 'Screen 3'])
    expect(project.screens.map(s => [s.x, s.y])).toEqual([[0, 0], [700, 120], [320, 620]])
    expect(project.screens.map(s => [s.screen.resolution.width, s.screen.resolution.height]))
      .toEqual([[128, 96], [96, 64], [128, 64]])
    expect(project.screens.map(s => s.cabinets.length)).toEqual([12, 6, 8])
  })

  it('preserves the REF-001 snake order on Screen 1 and shares the core path', () => {
    const project = createTestProject()
    const screen = project.screens[0]!
    expect(screen.cabinets.map(c => c.index + 1)).toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
    expect(screen.cabinets.map(c => c.id)).toEqual(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'])
    expect(screen.path).toEqual(cabinetOrder(screen.grid))
    expect(screen.path.map(p => [p.column, p.row]))
      .toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]])
  })

  it('moves a screen without touching cabinet IDs, order or geometry', () => {
    const original = createTestProject()
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
    const original = createTestProject()
    const moved = setScreenPosition(original, 'screen-1', -120, -80)
    expect([moved.screens[0]!.x, moved.screens[0]!.y]).toEqual([-120, -80])
    expect(firstOrder(moved)).toEqual(firstOrder(original))
    expect(moved.screens[0]!.screen.id).toBe('screen-1')
  })

  it('updates several exact source positions atomically', () => {
    const project = createTestProject()
    const moved = setScreenPositions(project, {
      'screen-1': { x: -301, y: 42 },
      'screen-3': { x: 901, y: -77 },
    })
    expect(moved.screens.map(screen => [screen.x, screen.y])).toEqual([[-301, 42], [700, 120], [901, -77]])
    expect(moved.source.editorLayout.screenPositions.map(placement => [placement.position.x, placement.position.y]))
      .toEqual([[-301, 42], [700, 120], [901, -77]])
    expect(() => setScreenPositions(project, {
      'screen-1': { x: 0.5, y: 0 },
      missing: { x: 0, y: 0 },
    })).toThrow(/whole numbers/)
    expect(project.screens.map(screen => [screen.x, screen.y])).toEqual([[0, 0], [700, 120], [320, 620]])
  })

  it('computes project bounds for the demo and after moving a screen into negative space', () => {
    const project = createTestProject()
    expect(projectBounds(project)).toEqual({ left: 0, top: 0, right: 796, bottom: 684, width: 796, height: 684 })
    const moved = setScreenPosition(project, 'screen-1', -100, -50)
    expect(projectBounds(moved)).toEqual({ left: -100, top: -50, right: 796, bottom: 684, width: 896, height: 734 })
  })

  it('offers per-screen bounds from the derived resolution', () => {
    const project = createTestProject()
    expect(screenBounds(project.screens[1]!)).toEqual({ left: 700, top: 120, right: 796, bottom: 184, width: 96, height: 64 })
  })

  it('hit-tests the topmost screen and resolves cabinets inside the grid', () => {
    const project = createTestProject()
    const first = hitTest(project, { x: 10, y: 10 })!
    expect(first.screen.screen.name).toBe('Screen 1')
    expect(first.cabinet?.id).toBe('C01')

    const last = hitTest(project, { x: 127, y: 95 })!
    expect(last.screen.screen.name).toBe('Screen 1')
    expect(last.cabinet?.id).toBe('C12')

    const onSecond = hitTest(project, { x: 710, y: 130 })!
    expect(onSecond.screen.screen.name).toBe('Screen 2')

    expect(hitTest(project, { x: 1500, y: 1500 })).toBeNull()
  })

  it('adds a screen offset from the previous one with default grid parameters', () => {
    const project = addScreen(createTestProject())
    expect(project.screens).toHaveLength(4)
    const fresh = project.screens[3]!
    expect(fresh.screen.id).toBe('screen-4')
    expect(fresh.screen.name).toBe('Screen 4')
    expect([fresh.x, fresh.y]).toEqual([420, 720])
    expect(fresh.cabinets).toHaveLength(12)
    expect(fresh.screen.resolution).toEqual({ width: 128, height: 96 })
    expect([fresh.screen.id, fresh.grid.screen]).toEqual(['screen-4', 'screen-4'])
  })

  it('keeps findScreen usable for selection lookups', () => {
    const project = createTestProject()
    expect(findScreen(project, 'screen-2')?.screen.name).toBe('Screen 2')
    expect(findScreen(project, 'missing')).toBeUndefined()
  })

  it('creates a source-backed Screen from exact creation fields', () => {
    const project = addScreen(createProject(), { ...initialDraft, columns: '2', rows: '1' }, {
      name: 'Lobby Ribbon',
      position: { x: -512, y: 96 },
    })
    const screen = project.screens[0]!
    expect(screen.screen.name).toBe('Lobby Ribbon')
    expect([screen.x, screen.y]).toEqual([-512, 96])
    expect([screen.grid.columns, screen.grid.rows]).toEqual([2, 1])
    expect(project.source.hardwareTopology.cabinets).toHaveLength(2)
  })

  it('renames, duplicates and deletes Screens without broken source references', () => {
    const original = createTestProject()
    const renamed = renameScreen(original, 'screen-1', 'Main Wall')
    expect(findScreen(renamed, 'screen-1')?.screen.name).toBe('Main Wall')
    const duplicated = duplicateScreen(renamed, 'screen-1')
    const copy = duplicated.screens[3]!
    expect(copy.screen.name).toBe('Main Wall Copy')
    expect([copy.x, copy.y]).toEqual([32, 32])
    expect(copy.config).toEqual(renamed.screens[0]!.config)
    expect(copy.cabinets.map(cabinet => cabinet.sourceId)).not.toEqual(renamed.screens[0]!.cabinets.map(cabinet => cabinet.sourceId))

    const deleted = deleteScreens(duplicated, ['screen-1', 'screen-2'])
    expect(deleted.screens.map(screen => screen.screen.id)).toEqual(['screen-3', copy.screen.id])
    expect(deleted.source.cabinetGrids.every(grid => grid.screen !== 'screen-1' && grid.screen !== 'screen-2')).toBe(true)
    const remainingCabinets = new Set(deleted.source.hardwareTopology.cabinets.map(cabinet => cabinet.id))
    expect(deleted.source.hardwareTopology.modules.every(module => remainingCabinets.has(module.cabinet))).toBe(true)
  })
})
