import { describe, expect, it } from 'vitest'
import { cabinetOrder, type GridOrdering } from '@ledmap/core'
import {
  createDemoProject, findScreen, resizeScreenGrid, updateScreenCabinetConfig,
  type ScreenView,
} from '../src/renderer/project.js'
import { gridPixelSize } from '../src/renderer/state.js'

const firstScreen = () => findScreen(createDemoProject(), 'screen-1')!

function traversalIds(view: ScreenView): string[] {
  return view.path.map(cell => view.cabinets.find(c => c.column === cell.column && c.row === cell.row)!.id)
}

function cellsByRow(view: ScreenView): string[] {
  return [...view.cabinets]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .map(c => c.id)
}

const topLeft = { startCorner: 'top-left' } as const

const truthTable: ReadonlyArray<{ readonly name: string; readonly ordering: GridOrdering; readonly expected: string[] }> = [
  {
    name: 'Row / Left→Right / Snake OFF',
    ordering: { numbering: 'row', direction: 'left-to-right', snake: false, ...topLeft },
    expected: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'],
  },
  {
    name: 'Row / Left→Right / Snake ON (REF-001)',
    ordering: { numbering: 'row', direction: 'left-to-right', snake: true, ...topLeft },
    expected: ['C01', 'C02', 'C03', 'C04', 'C08', 'C07', 'C06', 'C05', 'C09', 'C10', 'C11', 'C12'],
  },
  {
    name: 'Row / Right→Left / Snake OFF (REF-002 straight)',
    ordering: { numbering: 'row', direction: 'right-to-left', snake: false, ...topLeft },
    expected: ['C04', 'C03', 'C02', 'C01', 'C08', 'C07', 'C06', 'C05', 'C12', 'C11', 'C10', 'C09'],
  },
  {
    name: 'Row / Right→Left / Snake ON (REF-002)',
    ordering: { numbering: 'row', direction: 'right-to-left', snake: true, ...topLeft },
    expected: ['C04', 'C03', 'C02', 'C01', 'C05', 'C06', 'C07', 'C08', 'C12', 'C11', 'C10', 'C09'],
  },
  {
    name: 'Column / Top→Bottom / Snake OFF (REF-003 straight)',
    ordering: { numbering: 'column', direction: 'top-to-bottom', snake: false, ...topLeft },
    expected: ['C01', 'C05', 'C09', 'C02', 'C06', 'C10', 'C03', 'C07', 'C11', 'C04', 'C08', 'C12'],
  },
  {
    name: 'Column / Top→Bottom / Snake ON (REF-003)',
    ordering: { numbering: 'column', direction: 'top-to-bottom', snake: true, ...topLeft },
    expected: ['C01', 'C05', 'C09', 'C10', 'C06', 'C02', 'C03', 'C07', 'C11', 'C12', 'C08', 'C04'],
  },
  {
    name: 'Column / Bottom→Top / Snake OFF (REF-004 straight)',
    ordering: { numbering: 'column', direction: 'bottom-to-top', snake: false, ...topLeft },
    expected: ['C09', 'C05', 'C01', 'C10', 'C06', 'C02', 'C11', 'C07', 'C03', 'C12', 'C08', 'C04'],
  },
  {
    name: 'Column / Bottom→Top / Snake ON (REF-004)',
    ordering: { numbering: 'column', direction: 'bottom-to-top', snake: true, ...topLeft },
    expected: ['C09', 'C05', 'C01', 'C02', 'C06', 'C10', 'C11', 'C07', 'C03', 'C04', 'C08', 'C12'],
  },
]

describe('geometry patches (G1–G4)', () => {
  it('G1: grows 4×3 to 5×3 preserving identities and allocating exactly 3 deterministic cabinets', () => {
    const project = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { columns: 5 })
    const view = findScreen(project, 'screen-1')!
    expect(view.cabinets).toHaveLength(15)
    const survivors = [...view.cabinets]
      .filter(c => c.column < 4)
      .sort((a, b) => a.row - b.row || a.column - b.column)
      .map(c => c.id)
    expect(survivors).toEqual(cellsByRow(firstScreen()))
    expect(view.nextCabinetSerial).toBe(16)
    expect(view.screen.resolution).toEqual({ width: 640, height: 384 })
    expect(view.screen.resolution).toEqual(gridPixelSize(view.grid))
    expect(view.path).toEqual(cabinetOrder(view.config))
  })

  it('G2: shrinks 5×3 back to 4×3 removing only out-of-grid cells', () => {
    const grown = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { columns: 5 })
    const back = updateScreenCabinetConfig(grown, 'screen-1', { columns: 4 })
    const view = findScreen(back, 'screen-1')!
    expect(cellsByRow(view)).toEqual(cellsByRow(firstScreen()))
    expect(view.nextCabinetSerial).toBe(16)
  })

  it('G3: grows 4×3 to 4×4 with a deterministic new row', () => {
    const project = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { rows: 4 })
    const view = findScreen(project, 'screen-1')!
    expect(view.cabinets).toHaveLength(16)
    expect(cellsByRow(view).slice(0, 12)).toEqual(cellsByRow(firstScreen()))
    const added = [...view.cabinets].filter(c => c.row === 3).sort((a, b) => a.column - b.column)
    expect(added.map(c => c.id)).toEqual(['C13', 'C14', 'C15', 'C16'])
    expect(view.nextCabinetSerial).toBe(17)
    expect(view.screen.resolution).toEqual({ width: 512, height: 512 })
  })

  it('G4: never reuses retired IDs on shrink→grow cycles', () => {
    const grown = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { columns: 5 })
    const shrunk = updateScreenCabinetConfig(grown, 'screen-1', { columns: 4 })
    const regrown = updateScreenCabinetConfig(shrunk, 'screen-1', { columns: 5 })
    const view = findScreen(regrown, 'screen-1')!
    const added = [...view.cabinets].filter(c => c.column === 4).sort((a, b) => a.row - b.row)
    expect(added.map(c => c.id)).toEqual(['C16', 'C17', 'C18'])
    expect(view.nextCabinetSerial).toBe(19)
  })
})

describe('ordering truth table through the shared operation (O1–O8)', () => {
  it.each(truthTable.map(({ name, ordering, expected }) => ({ name, ordering, expected })))(
    '$name',
    ({ ordering, expected }) => {
      const before = firstScreen()
      const project = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { ordering })
      const view = findScreen(project, 'screen-1')!
      expect(traversalIds(view)).toEqual(expected)
      expect(view.path).toEqual(cabinetOrder(view.config))
      expect(cellsByRow(view)).toEqual(cellsByRow(before))
      expect(view.nextCabinetSerial).toBe(before.nextCabinetSerial)
    },
  )
})

describe('identity isolation (I1–I2)', () => {
  it('I1: ordering-only patch changes traversal but not identity, cells or serial', () => {
    const before = firstScreen()
    const project = updateScreenCabinetConfig(createDemoProject(), 'screen-1', {
      ordering: { ...before.grid.ordering, snake: false },
    })
    const view = findScreen(project, 'screen-1')!
    expect(view.cabinets.map(c => [c.id, c.column, c.row])).toEqual(
      before.cabinets.map(c => [c.id, c.column, c.row]),
    )
    expect(view.nextCabinetSerial).toBe(before.nextCabinetSerial)
    expect(traversalIds(view)).toEqual([
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12',
    ])
    expect(view.grid.columns).toBe(4)
    expect(view.grid.rows).toBe(3)
  })

  it('I2: geometry patch preserves ordering, position, names, ids and other screens', () => {
    const project = createDemoProject()
    const before = findScreen(project, 'screen-1')!
    const next = updateScreenCabinetConfig(project, 'screen-1', { columns: 5, rows: 4 })
    const view = findScreen(next, 'screen-1')!
    expect(view.grid.ordering).toEqual(before.grid.ordering)
    expect([view.x, view.y]).toEqual([before.x, before.y])
    expect(view.screen.id).toBe(before.screen.id)
    expect(view.screen.name).toBe(before.screen.name)
    expect(view.grid.id).toBe(before.grid.id)
    expect(next.screens[1]).toBe(project.screens[1])
    expect(next.screens[2]).toBe(project.screens[2])
  })
})

describe('validation without domain change (V1) and idempotence (P1)', () => {
  it('V1: rejects invalid patches without mutating the project', () => {
    const project = createDemoProject()
    expect(() => updateScreenCabinetConfig(project, 'screen-1', { columns: 0 })).toThrow(/at least 1/)
    expect(() => updateScreenCabinetConfig(project, 'screen-1', { rows: -1 })).toThrow(/at least 1/)
    expect(() => updateScreenCabinetConfig(project, 'screen-1', { columns: 1.5 })).toThrow(/whole number/)
    expect(() => updateScreenCabinetConfig(project, 'screen-1', { columns: Number.NaN })).toThrow(/whole number/)
    expect(() => updateScreenCabinetConfig(project, 'missing', { columns: 5 })).toThrow(/Unknown screen/)
    expect(() => updateScreenCabinetConfig(project, 'screen-1', {
      ordering: { numbering: 'row', direction: 'top-to-bottom', snake: false, startCorner: 'top-left' },
    })).toThrow()
    expect(findScreen(project, 'screen-1')!.grid.columns).toBe(4)
    expect(findScreen(project, 'screen-1')!.cabinets).toHaveLength(12)
    expect(findScreen(project, 'screen-1')!.grid.ordering).toEqual(firstScreen().grid.ordering)
  })

  it('P1: repeating the same patch is stable and consumes no serial', () => {
    const once = updateScreenCabinetConfig(createDemoProject(), 'screen-1', { columns: 5 })
    const twice = updateScreenCabinetConfig(once, 'screen-1', { columns: 5 })
    expect(cellsByRow(findScreen(twice, 'screen-1')!)).toEqual(cellsByRow(findScreen(once, 'screen-1')!))
    expect(findScreen(twice, 'screen-1')!.nextCabinetSerial).toBe(findScreen(once, 'screen-1')!.nextCabinetSerial)
    const reordered = updateScreenCabinetConfig(once, 'screen-1', { ordering: { ...firstScreen().grid.ordering } })
    expect(cellsByRow(findScreen(reordered, 'screen-1')!)).toEqual(cellsByRow(findScreen(once, 'screen-1')!))
  })

  it('shared path: resizeScreenGrid equals updateScreenCabinetConfig for dimensions', () => {
    const project = createDemoProject()
    const viaResize = findScreen(resizeScreenGrid(project, 'screen-1', 5, 4), 'screen-1')!
    const viaOp = findScreen(updateScreenCabinetConfig(project, 'screen-1', { columns: 5, rows: 4 }), 'screen-1')!
    expect(viaResize.grid).toEqual(viaOp.grid)
    expect(viaResize.cabinets).toEqual(viaOp.cabinets)
    expect(viaResize.nextCabinetSerial).toBe(viaOp.nextCabinetSerial)
    expect(viaResize.path).toEqual(viaOp.path)
    expect(viaResize.screen).toEqual(viaOp.screen)
  })
})
