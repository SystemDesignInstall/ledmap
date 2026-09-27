import { describe, expect, it } from 'vitest'
import { cabinetIndex, cabinetOrder } from '@ledmap/core'
import {
  applyDraft, buildCabinets, gridPixelSize, initialDraft, maxPreviewColumns, maxPreviewRows,
} from '../src/renderer/state.js'
import {
  createDemoProject, findScreen, hitTest, projectBounds, resizeScreenGrid, screenBounds, screenHeight, screenWidth,
} from '../src/renderer/project.js'

const demo = () => applyDraft(null, initialDraft).snapshot!

function resized(columns: string, rows: string, seed = demo()) {
  return applyDraft(seed, { ...initialDraft, columns, rows }).snapshot!
}

function idAt(snapshot: ReturnType<typeof demo>, column: number, row: number): string {
  return snapshot.cabinets.find(c => c.column === column && c.row === row)!.id
}

function idsByCell(snapshot: ReturnType<typeof demo>): string[] {
  return [...snapshot.cabinets]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .map(c => c.id)
}

describe('Screen size is derived from the cabinet grid', () => {
  it('derives the pixel size from the grid and keeps the stored resolution in sync', () => {
    const snapshot = demo()
    expect(gridPixelSize(snapshot.grid)).toEqual({ width: 512, height: 384 })
    expect(snapshot.screen.resolution).toEqual(gridPixelSize(snapshot.grid))
    const wider = resized('5', '3', snapshot)
    expect(gridPixelSize(wider.grid)).toEqual({ width: 640, height: 384 })
    expect(wider.screen.resolution).toEqual(gridPixelSize(wider.grid))
    expect(wider.pixelCount).toBe(640 * 384)
  })

  it('keeps the core invariant Screen.resolution == grid pixel size for every supported grid', () => {
    for (const [columns, rows] of [['1', '1'], ['5', '3'], ['8', '1'], ['32', '32']] as const) {
      const snapshot = resized(columns, rows)
      expect(snapshot.screen.resolution).toEqual(gridPixelSize(snapshot.grid))
      expect(snapshot.cabinets).toHaveLength(Number(columns) * Number(rows))
    }
  })

  it('limits the preview to 1024 cabinets and 65536 modules', () => {
    expect(maxPreviewColumns(3, 16)).toBe(341)
    expect(maxPreviewRows(4, 16)).toBe(256)
    expect(maxPreviewColumns(1, 65536)).toBe(1)
    expect(maxPreviewRows(1, 65536)).toBe(1)
    expect(applyDraft(null, { ...initialDraft, columns: '1025', rows: '1' }).errors.form).toContain('1024')
  })
})

describe('nextCabinetSerial allocates identity, not numbering', () => {
  it('allocates opaque IDs only for cells that do not exist yet', () => {
    const seed = demo()
    expect(seed.nextCabinetSerial).toBe(13)
    const wider = resized('5', '3', seed)
    expect(wider.cabinets).toHaveLength(15)
    for (const cabinet of seed.cabinets) expect(idAt(wider, cabinet.column, cabinet.row)).toBe(cabinet.id)
    expect([idAt(wider, 4, 0), idAt(wider, 4, 1), idAt(wider, 4, 2)]).toEqual(['C13', 'C14', 'C15'])
    expect(wider.nextCabinetSerial).toBe(16)
  })

  it('never reuses an ID after a cabinet leaves the grid', () => {
    const seed = demo()
    const wider = resized('5', '3', seed)
    const back = resized('4', '3', wider)
    expect(idsByCell(back)).toEqual(idsByCell(seed))
    expect(back.nextCabinetSerial).toBe(16)
    const widerAgain = resized('5', '3', back)
    expect([idAt(widerAgain, 4, 0), idAt(widerAgain, 4, 1), idAt(widerAgain, 4, 2)]).toEqual(['C16', 'C17', 'C18'])
    expect(widerAgain.nextCabinetSerial).toBe(19)
  })

  it('is idempotent for the same target: no identity is consumed by an unchanged cell', () => {
    const seed = demo()
    const first = resized('5', '3', seed)
    const second = resized('5', '3', first)
    expect(idsByCell(second)).toEqual(idsByCell(first))
    expect(second.nextCabinetSerial).toBe(first.nextCabinetSerial)
    const third = resized('5', '3', second)
    expect(idsByCell(third)).toEqual(idsByCell(first))
    expect(third.nextCabinetSerial).toBe(first.nextCabinetSerial)
  })

  it('keeps IDs opaque: they follow the cell, not the position, the order or the serial', () => {
    const seed = demo()
    const tall = resized('4', '5', seed)
    const firstRow = tall.cabinets.filter(c => c.row === 0).map(c => c.id)
    expect(firstRow).toEqual(['C01', 'C02', 'C03', 'C04'])
    const moved = tall.cabinets.find(c => c.id === 'C01')!
    expect([moved.column, moved.row]).toEqual([0, 0])
    const lowered = tall.cabinets.find(c => c.id === 'C12')!
    expect([lowered.column, lowered.row]).toEqual([3, 2])
    expect(moved.index).not.toBe(Number(lowered.id.slice(1)) - 1)
  })

  it('recomputes the derived index from cabinetIndex for every resize', () => {
    const seed = demo()
    for (const [columns, rows] of [['5', '3'], ['3', '4'], ['1', '1']] as const) {
      const snapshot = resized(columns, rows, seed)
      for (const cabinet of snapshot.cabinets) expect(cabinet.index).toBe(cabinetIndex(snapshot.config, cabinet))
      const path = cabinetOrder(snapshot.config)
      expect(snapshot.path).toEqual(path)
      expect(snapshot.cabinets.map(c => c.index).sort((a, b) => a - b))
        .toEqual([...Array(snapshot.cabinets.length).keys()])
      for (const [position, cell] of path.entries()) {
        expect(idAt(snapshot, cell.column, cell.row)).toBe(
          snapshot.cabinets.find(c => c.index === position)!.id,
        )
      }
    }
  })

  it('allocates from a bare seed without inventing a numbering scheme', () => {
    const config = { ...demo().config, columns: 2, rows: 1 }
    const { cabinets, nextCabinetSerial } = buildCabinets(config, null)
    expect(cabinets.map(c => c.id)).toEqual(['C01', 'C02'])
    expect(cabinets.map(c => c.index)).toEqual([0, 1])
    expect(nextCabinetSerial).toBe(3)
  })
})

describe('resizeScreenGrid is the only structural mutation', () => {
  it('changes the selected screen and leaves other screens untouched', () => {
    const project = createDemoProject()
    const next = resizeScreenGrid(project, 'screen-1', 5, 4)
    const resizedScreen = next.screens[0]!
    expect([resizedScreen.grid.columns, resizedScreen.grid.rows]).toEqual([5, 4])
    expect(resizedScreen.screen.resolution).toEqual({ width: 640, height: 512 })
    expect(resizedScreen.screen.resolution).toEqual(gridPixelSize(resizedScreen.grid))
    expect(resizedScreen.cabinets).toHaveLength(20)
    expect(resizedScreen.path).toEqual(cabinetOrder(resizedScreen.config))
    expect(next.screens[1]).toBe(project.screens[1])
    expect(next.screens[2]).toBe(project.screens[2])
    expect(project.screens[0]!.grid.columns).toBe(4)
    expect(project.screens[0]!.cabinets).toHaveLength(12)
  })

  it('preserves identity, position, name and screen id of surviving cabinets', () => {
    const project = createDemoProject()
    const next = resizeScreenGrid(project, 'screen-1', 5, 3)
    const before = project.screens[0]!
    const after = next.screens[0]!
    expect(after.screen.id).toBe(before.screen.id)
    expect(after.screen.name).toBe(before.screen.name)
    expect(after.grid.id).toBe(before.grid.id)
    expect(after.grid.ordering).toEqual(before.grid.ordering)
    expect(after.grid.cabinetWidth).toBe(before.grid.cabinetWidth)
    expect([after.x, after.y]).toEqual([before.x, before.y])
    const survivors = after.cabinets.filter(c => c.column < 4)
    expect(survivors.map(c => c.id)).toEqual(before.cabinets.map(c => c.id))
    expect(survivors.map(c => [c.column, c.row])).toEqual(before.cabinets.map(c => [c.column, c.row]))
  })

  it('recalculates bounds, hit testing and reported size from the new grid', () => {
    const project = createDemoProject()
    const next = resizeScreenGrid(project, 'screen-1', 9, 3)
    const screen = next.screens[0]!
    expect(screenWidth(screen)).toBe(1152)
    expect(screenHeight(screen)).toBe(384)
    expect(screenBounds(screen)).toEqual({ left: 0, top: 0, right: 1152, bottom: 384, width: 1152, height: 384 })
    expect(projectBounds(next)).toEqual({ left: 0, top: 0, right: 1152, bottom: 876, width: 1152, height: 876 })
    const grown = hitTest(next, { x: 600, y: 300 })?.cabinet
    expect([grown?.column, grown?.row]).toEqual([4, 2])
    expect(grown?.id).toBe('C23')
    expect(grown?.index).toBe(22)
    const snakeCabinet = hitTest(next, { x: 448, y: 192 })?.cabinet
    expect([snakeCabinet?.column, snakeCabinet?.row]).toEqual([3, 1])
    expect(snakeCabinet?.id).toBe('C08')
    expect(snakeCabinet?.index).toBe(14)
    expect(hitTest(next, { x: 1000, y: 300 })?.screen.screen.id).toBe('screen-2')
    expect(hitTest(next, { x: 1200, y: 300 })).toBeNull()
  })

  it('rejects non-integer and out-of-range dimensions without mutating the project', () => {
    const project = createDemoProject()
    expect(() => resizeScreenGrid(project, 'screen-1', 0, 3)).toThrow(/at least 1/)
    expect(() => resizeScreenGrid(project, 'screen-1', 4, -1)).toThrow(/at least 1/)
    expect(() => resizeScreenGrid(project, 'screen-1', 1.5, 3)).toThrow(/whole number/)
    expect(() => resizeScreenGrid(project, 'screen-1', Number.NaN, 3)).toThrow(/whole number/)
    expect(() => resizeScreenGrid(project, 'screen-1', Number.MAX_SAFE_INTEGER + 2, 3)).toThrow(/whole number/)
    expect(() => resizeScreenGrid(project, 'missing', 5, 3)).toThrow(/Unknown screen/)
    expect(() => resizeScreenGrid(project, 'screen-1', 1025, 1)).toThrow(/1024/)
    expect(project.screens[0]!.grid.columns).toBe(4)
    expect(project.screens[0]!.cabinets).toHaveLength(12)
  })

  it('keeps a 1x1 grid and reports the minimum reachable size', () => {
    const project = resizeScreenGrid(createDemoProject(), 'screen-1', 1, 1)
    const screen = findScreen(project, 'screen-1')!
    expect(screen.cabinets).toHaveLength(1)
    expect(screen.screen.resolution).toEqual({ width: 128, height: 128 })
    expect(screen.cabinets[0]!.id).toBe('C01')
    expect(screen.cabinets[0]!.index).toBe(0)
  })
})
