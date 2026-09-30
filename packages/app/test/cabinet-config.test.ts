import { describe, expect, it } from 'vitest'
import { cabinetIndex, cabinetOrder } from '@ledmap/core'
import { changeNumbering } from '../src/renderer/state.js'
import {
  findScreen, hitTest, projectBounds, resizeScreenGrid, screenBounds,
  updateScreenCabinetConfig,
} from '../src/renderer/project.js'
import { createTestProject } from './project-fixtures.js'

function cells(screen: ReturnType<typeof createTestProject>['screens'][number]): Array<[string, number, number]> {
  return screen.cabinets.map(cabinet => [cabinet.id, cabinet.column, cabinet.row])
}

function orderOf(project: ReturnType<typeof createTestProject>, screenId: string): string[] {
  return findScreen(project, screenId)!
    .cabinets
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(cabinet => cabinet.id)
}

describe('Cabinet geometry and ordering editor state', () => {
  it('recomputes cabinet and screen geometry from module geometry', () => {
    const base = resizeScreenGrid(createTestProject(), 'screen-1', 5, 2)
    const widerModules = updateScreenCabinetConfig(base, 'screen-1', { moduleColumns: 5 })
    const screen = findScreen(widerModules, 'screen-1')!
    expect([screen.grid.cabinetWidth, screen.grid.cabinetHeight]).toEqual([160, 128])
    expect(screen.screen.resolution).toEqual({ width: 800, height: 256 })
    expect(screen.modulesPerCabinet).toBe(20)
    expect(screen.totalModules).toBe(200)

    const widerPixels = updateScreenCabinetConfig(base, 'screen-1', { modulePixelWidth: 64 })
    expect(findScreen(widerPixels, 'screen-1')!.grid.cabinetWidth).toBe(256)
    expect(findScreen(widerPixels, 'screen-1')!.screen.resolution).toEqual({ width: 1280, height: 256 })

    const fewerRows = updateScreenCabinetConfig(base, 'screen-1', { moduleRows: 2 })
    const compact = findScreen(fewerRows, 'screen-1')!
    expect(compact.grid.cabinetHeight).toBe(64)
    expect(compact.screen.resolution).toEqual({ width: 640, height: 128 })
    expect(compact.modulesPerCabinet).toBe(8)
    expect(compact.totalModules).toBe(80)
  })

  it('preserves physical identity and the allocator across geometry changes', () => {
    const project = createTestProject()
    const before = findScreen(project, 'screen-1')!
    const next = updateScreenCabinetConfig(project, 'screen-1', {
      moduleColumns: 5,
      moduleRows: 3,
      modulePixelWidth: 24,
      modulePixelHeight: 40,
    })
    const after = findScreen(next, 'screen-1')!
    expect(cells(after)).toEqual(cells(before))
    expect(after.nextCabinetSerial).toBe(before.nextCabinetSerial)
    expect(after.screen.id).toBe(before.screen.id)
    expect(after.grid.id).toBe(before.grid.id)
    expect([after.x, after.y]).toEqual([before.x, before.y])
  })

  it('changes logical order without moving or renaming cabinets', () => {
    const project = createTestProject()
    const before = findScreen(project, 'screen-1')!
    const c04Before = before.cabinets.find(c => c.id === 'C04')!
    expect(c04Before.index).toBe(3)
    const next = updateScreenCabinetConfig(project, 'screen-1', { direction: 'right-to-left' })
    const after = findScreen(next, 'screen-1')!
    const c04After = after.cabinets.find(c => c.id === 'C04')!
    expect([c04After.column, c04After.row]).toEqual([3, 0])
    expect(c04After.index).toBe(0)
    expect(cells(after)).toEqual(cells(before))
    expect(after.nextCabinetSerial).toBe(before.nextCabinetSerial)
    expect(after.path).toEqual(cabinetOrder(after.config))
    for (const cabinet of after.cabinets) {
      expect(cabinet.index).toBe(cabinetIndex(after.config, cabinet))
    }
  })

  it('keeps the REF-001 traversal unchanged when no ordering patch is supplied', () => {
    const project = updateScreenCabinetConfig(createTestProject(), 'screen-1', { modulePixelWidth: 48 })
    expect(findScreen(project, 'screen-1')!.cabinets.map(c => c.index + 1))
      .toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  })

  it('translates reverse direction when numbering switches axis', () => {
    const project = createTestProject()
    const screen = findScreen(project, 'screen-1')!
    const reversed = { ...screen.grid.ordering, direction: 'right-to-left' as const }
    const ordering = changeNumbering(reversed, 'column')
    expect(ordering.direction).toBe('bottom-to-top')
    const next = updateScreenCabinetConfig(project, 'screen-1', {
      numbering: ordering.numbering,
      direction: ordering.direction,
    })
    expect(findScreen(next, 'screen-1')!.grid.ordering)
      .toEqual({ ...screen.grid.ordering, numbering: 'column', direction: 'bottom-to-top' })
  })

  it('keeps geometry and ordering orthogonal', () => {
    const project = createTestProject()
    const before = findScreen(project, 'screen-1')!
    const reordered = findScreen(
      updateScreenCabinetConfig(project, 'screen-1', { snake: false }),
      'screen-1',
    )!
    expect([reordered.grid.cabinetWidth, reordered.grid.cabinetHeight]).toEqual([
      before.grid.cabinetWidth, before.grid.cabinetHeight,
    ])
    expect(reordered.screen.resolution).toEqual(before.screen.resolution)

    const resized = findScreen(
      updateScreenCabinetConfig(project, 'screen-1', { modulePixelWidth: 64 }),
      'screen-1',
    )!
    expect(resized.cabinets.map(c => c.index)).toEqual(before.cabinets.map(c => c.index))
    expect(resized.path).toEqual(before.path)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid module dimensions atomically: %s',
    value => {
      const project = createTestProject()
      const before = findScreen(project, 'screen-1')!
      expect(() => updateScreenCabinetConfig(project, 'screen-1', {
        moduleColumns: 5,
        moduleRows: value,
      })).toThrow()
      expect(findScreen(project, 'screen-1')).toBe(before)
    },
  )

  it('rejects incompatible ordering atomically', () => {
    const project = createTestProject()
    const before = findScreen(project, 'screen-1')!
    expect(() => updateScreenCabinetConfig(project, 'screen-1', { numbering: 'column' }))
      .toThrow(/UNSUPPORTED_ORDERING/)
    expect(findScreen(project, 'screen-1')).toBe(before)
  })

  it('enforces the total module preview limit', () => {
    const project = resizeScreenGrid(createTestProject(), 'screen-1', 32, 32)
    expect(() => updateScreenCabinetConfig(project, 'screen-1', {
      moduleColumns: 17,
      moduleRows: 4,
    })).toThrow(/65,536|65536/)
    expect(findScreen(project, 'screen-1')!.config.moduleColumns).toBe(4)
  })

  it('changes only the selected screen', () => {
    const project = createTestProject()
    const next = updateScreenCabinetConfig(project, 'screen-1', { moduleColumns: 5, snake: false })
    expect(next.screens[1]).toEqual(project.screens[1])
    expect(next.screens[2]).toEqual(project.screens[2])
    expect(next.screens[0]).not.toBe(project.screens[0])
  })

  it('recalculates project bounds and hit testing from cabinet geometry', () => {
    const project = updateScreenCabinetConfig(createTestProject(), 'screen-1', { modulePixelWidth: 128 })
    const screen = findScreen(project, 'screen-1')!
    expect(screenBounds(screen)).toEqual({ left: 0, top: 0, right: 2048, bottom: 384, width: 2048, height: 384 })
    expect(projectBounds(project).right).toBe(2048)
    const hit = hitTest(project, { x: 1500, y: 64 })!
    expect(hit.screen.screen.id).toBe('screen-1')
    expect([hit.cabinet?.column, hit.cabinet?.row]).toEqual([2, 0])
    expect(hit.cabinet?.id).toBe('C03')
  })

  it('rejects unknown screens without changing the project', () => {
    const project = createTestProject()
    expect(() => updateScreenCabinetConfig(project, 'missing', { snake: false })).toThrow(/Unknown screen/)
    expect(project.screens).toHaveLength(3)
  })
})

describe('cabinet traversal order fixtures', () => {
  it.each([
    {
      name: 'column numbering, top to bottom, snake off matches LEDMAP-REF-003 §3',
      patch: { numbering: 'column', direction: 'top-to-bottom', snake: false } as const,
      expected: ['C01', 'C05', 'C09', 'C02', 'C06', 'C10', 'C03', 'C07', 'C11', 'C04', 'C08', 'C12'],
    },
    {
      name: 'column numbering, top to bottom, snake on matches LEDMAP-REF-003 §4',
      patch: { numbering: 'column', direction: 'top-to-bottom', snake: true } as const,
      expected: ['C01', 'C05', 'C09', 'C10', 'C06', 'C02', 'C03', 'C07', 'C11', 'C12', 'C08', 'C04'],
    },
    {
      name: 'column numbering, bottom to top, snake off matches LEDMAP-REF-004 §3',
      patch: { numbering: 'column', direction: 'bottom-to-top', snake: false } as const,
      expected: ['C09', 'C05', 'C01', 'C10', 'C06', 'C02', 'C11', 'C07', 'C03', 'C12', 'C08', 'C04'],
    },
    {
      name: 'column numbering, bottom to top, snake on matches LEDMAP-REF-004 §4',
      patch: { numbering: 'column', direction: 'bottom-to-top', snake: true } as const,
      expected: ['C09', 'C05', 'C01', 'C02', 'C06', 'C10', 'C11', 'C07', 'C03', 'C04', 'C08', 'C12'],
    },
  ])('$name', ({ patch, expected }) => {
    const project = updateScreenCabinetConfig(createTestProject(), 'screen-1', patch)
    expect(orderOf(project, 'screen-1')).toEqual(expected)
  })

  it.each([
    {
      name: 'row numbering, right to left, snake on',
      patch: { direction: 'right-to-left', snake: true } as const,
      expected: ['C04', 'C03', 'C02', 'C01', 'C05', 'C06', 'C07', 'C08', 'C12', 'C11', 'C10', 'C09'],
    },
    {
      name: 'row numbering, right to left, snake off',
      patch: { direction: 'right-to-left', snake: false } as const,
      expected: ['C04', 'C03', 'C02', 'C01', 'C08', 'C07', 'C06', 'C05', 'C12', 'C11', 'C10', 'C09'],
    },
  ])('$name has no reference document, so the order is pinned from the engine', ({ patch, expected }) => {
    const project = updateScreenCabinetConfig(createTestProject(), 'screen-1', patch)
    expect(orderOf(project, 'screen-1')).toEqual(expected)
  })
})
