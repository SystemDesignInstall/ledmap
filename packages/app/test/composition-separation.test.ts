import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cabinetIndex, cabinetOrder, type GridOrdering } from '@ledmap/core'

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

describe('composition workspace separation', () => {
  it('names the visible workspace Composition while keeping internal layout ids', () => {
    expect(html).toContain('>Composition</button>')
    expect(html).toContain('COMPOSITION WORKSPACE')
    expect(html).not.toContain('>Layout</button>')
    expect(html).not.toContain('LAYOUT WORKSPACE')
    expect(html).toContain('id="layout-mode"')
    expect(html).toContain('id="layout-toolbar"')
    expect(html).toContain('id="layout-workspace"')
  })

  it('offers no Signal overlay in the Composition toolbar', () => {
    expect(html).toContain('data-overlay="cabinets"')
    expect(html).toContain('data-overlay="modules"')
    expect(html).toContain('data-overlay="coordinates"')
    expect(html).not.toContain('data-overlay="signal"')
    expect(renderer).not.toContain('signal: false')
    expect(renderer).not.toContain('overlays.signal')
  })

  it('renders no signal path, arrows or logical-order labels in Composition', () => {
    expect(canvas).not.toContain('drawSignalPath')
    expect(canvas).not.toContain('cabinetOrder')
    expect(canvas).not.toContain('cabinetIndex')
    expect(canvas).not.toContain('CABINET_FIRST')
    expect(canvas).not.toMatch(/#\$\{/)
    expect(canvas).toContain('cabinetDisplayLabel(labelMode, shape.columns, shape.rows, cabinet)')
    expect(canvas).toContain('ctx.fillText(visibleLabel, p.x, p.y)')
  })

  it('owns no Numbering, Direction or Snake controls in Composition properties', () => {
    expect(renderer).not.toContain('Screen Numbering')
    expect(renderer).not.toContain('Screen Direction')
    expect(renderer).not.toContain('Screen Snake')
    expect(renderer).not.toContain('Cabinet Grid Numbering')
    expect(renderer).not.toContain('Logical order')
    expect(renderer).not.toContain('directionOptions')
    expect(renderer).not.toContain('changeNumbering')
    expect(renderer).not.toMatch(/group\('Ordering'/)
  })

  it('keeps identical physical geometry for different Numbering, Direction and Snake', () => {
    const geometry = { columns: 4, rows: 3 }
    const physicalKeys = (ordering: GridOrdering): string[] => {
      const path = cabinetOrder({ ...geometry, ordering })
      expect(path).toHaveLength(geometry.columns * geometry.rows)
      const keys = path.map(cell => `${cell.column},${cell.row}`)
      expect(new Set(keys).size).toBe(keys.length)
      for (const cabinet of path) {
        expect(cabinetIndex({ ...geometry, ordering }, cabinet)).toBeGreaterThanOrEqual(0)
      }
      return [...keys].sort()
    }
    const baseline = physicalKeys(orderings[0]!)
    expect(baseline).toHaveLength(12)
    const traversals = new Set<string>()
    for (const ordering of orderings) {
      expect(physicalKeys(ordering)).toEqual(baseline)
      traversals.add(cabinetOrder({ ...geometry, ordering }).map(cell => `${cell.column},${cell.row}`).join(';'))
    }
    expect(traversals.size).toBeGreaterThan(1)
  })
})
