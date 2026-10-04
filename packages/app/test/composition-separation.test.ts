import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cabinetOrder, type GridOrdering } from '@ledmap/core'
import {
  createDemoProject, findScreen, moveScreen, screenBounds, updateScreenCabinetConfig,
} from '../src/renderer/project.js'
import { gridPixelSize } from '../src/renderer/state.js'

const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../src/renderer/index.ts', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../src/renderer/canvas.ts', import.meta.url), 'utf8')

const topLeft = { startCorner: 'top-left' } as const

const orderings: readonly GridOrdering[] = [
  { numbering: 'row', direction: 'left-to-right', snake: false, ...topLeft },
  { numbering: 'row', direction: 'left-to-right', snake: true, ...topLeft },
  { numbering: 'row', direction: 'right-to-left', snake: true, ...topLeft },
  { numbering: 'column', direction: 'top-to-bottom', snake: true, ...topLeft },
  { numbering: 'column', direction: 'bottom-to-top', snake: true, ...topLeft },
]

function physicalRects(screenId: string, ordering: GridOrdering): Map<string, string> {
  const view = findScreen(updateScreenCabinetConfig(createDemoProject(), screenId, { ordering }), screenId)!
  const rects = new Map<string, string>()
  for (const cabinet of view.cabinets) {
    rects.set(cabinet.id, [
      view.x + cabinet.column * view.grid.cabinetWidth,
      view.y + cabinet.row * view.grid.cabinetHeight,
      view.grid.cabinetWidth,
      view.grid.cabinetHeight,
    ].join(','))
  }
  return rects
}

describe('composition workspace separation', () => {
  it('names the visible workspace Composition', () => {
    expect(html).toContain('Composition')
    expect(html).toContain('COMPOSITION WORKSPACE')
    expect(html).not.toContain('>Layout<')
    expect(html).not.toContain('PROJECT LAYOUT')
  })

  it('renders no signal path, arrows or logical-order labels', () => {
    expect(canvas).not.toContain('drawSignalPath')
    expect(canvas).not.toContain('cabinetOrder')
    expect(canvas).not.toContain('cabinetIndex')
    expect(canvas).not.toMatch(/#\$\{/)
    expect(canvas).not.toContain('signal')
    expect(canvas).not.toContain('Signal')
    expect(canvas).not.toContain('arrow')
    expect(canvas).not.toContain('CABINET_FIRST')
  })

  it('owns no Numbering, Direction, Snake, Signal or logical-order controls', () => {
    expect(renderer).not.toContain('Screen Numbering')
    expect(renderer).not.toContain('Screen Direction')
    expect(renderer).not.toContain('Screen Snake')
    expect(renderer).not.toContain('Logical order')
    expect(renderer).not.toContain('orderGroup')
    expect(renderer).not.toContain('orderingSummary')
    expect(renderer).not.toContain('changeNumbering')
    expect(renderer).not.toMatch(/group\('Order'/)
    expect(renderer).not.toContain('Signal')
    expect(renderer).not.toContain('signal')
  })

  it('keeps identical composition geometry for different Numbering, Direction and Snake', () => {
    const baseline = findScreen(createDemoProject(), 'screen-1')!
    const baselineBounds = screenBounds(baseline)
    const baselineRects = physicalRects('screen-1', baseline.grid.ordering)
    const traversals = new Set<string>()
    for (const ordering of orderings) {
      const view = findScreen(updateScreenCabinetConfig(createDemoProject(), 'screen-1', { ordering }), 'screen-1')!
      expect(screenBounds(view)).toEqual(baselineBounds)
      expect(gridPixelSize(view.grid)).toEqual(gridPixelSize(baseline.grid))
      expect(view.cabinets.map(c => [c.id, c.column, c.row])).toEqual(
        baseline.cabinets.map(c => [c.id, c.column, c.row]),
      )
      const rects = physicalRects('screen-1', ordering)
      expect([...rects.entries()]).toEqual([...baselineRects.entries()])
      expect(view.path).toEqual(cabinetOrder(view.config))
      traversals.add(view.path.map(cell => `${cell.column},${cell.row}`).join(';'))
    }
    expect(traversals.size).toBeGreaterThan(1)
  })

  it('moves a screen by changing only its composition placement', () => {
    const original = createDemoProject()
    const before = findScreen(original, 'screen-1')!
    const moved = moveScreen(original, 'screen-1', -300, 150)
    const after = findScreen(moved, 'screen-1')!
    expect([after.x, after.y]).toEqual([before.x - 300, before.y + 150])
    expect(after.grid.ordering).toEqual(before.grid.ordering)
    expect(after.grid).toBe(before.grid)
    expect(after.path).toEqual(before.path)
    expect(after.cabinets).toEqual(before.cabinets)
    expect(after.config).toEqual(before.config)
    expect(moved.screens[1]).toBe(original.screens[1])
    expect(moved.screens[2]).toBe(original.screens[2])
  })

  it('preserves hidden ordering values across geometry-only edits', () => {
    const ordering: GridOrdering = { numbering: 'column', direction: 'bottom-to-top', snake: true, ...topLeft }
    const configured = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { ordering })
    const resized = updateScreenCabinetConfig(configured, 'screen-1', { columns: 5, rows: 4 })
    const view = findScreen(resized, 'screen-1')!
    expect(view.grid.ordering).toEqual(ordering)
    expect(view.path).toEqual(cabinetOrder(view.config))
    const back = updateScreenCabinetConfig(resized, 'screen-1', { columns: 4, rows: 3 })
    expect(findScreen(back, 'screen-1')!.grid.ordering).toEqual(ordering)
  })
})
