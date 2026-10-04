import { describe, expect, it } from 'vitest'
import {
  applyBoxSelection, emptySelection, groupActionBlocker, repairSelection,
  selectSingle, selectedScreenIds, toggleSelection,
  type SelectionState,
} from '../src/renderer/selection.js'
import {
  createDemoProject, duplicateScreens, findScreen, moveScreens, nextScreenIndex,
  rectsIntersect, removeScreens, screensInRect,
  type Bounds, type Project,
} from '../src/renderer/project.js'

const screen = (id: string) => ({ type: 'screen', id }) as const

function at(project: Project, id: string) {
  const found = findScreen(project, id)
  if (!found) throw new Error(`missing screen: ${id}`)
  return found
}

function rect(left: number, top: number, right: number, bottom: number): Bounds {
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

describe('single and toggle selection (SEL-01–SEL-05)', () => {
  it('SEL-01: click replaces the set with one primary item', () => {
    const multi: SelectionState = {
      items: [screen('screen-1'), screen('screen-2')],
      primary: screen('screen-2'),
    }
    expect(selectSingle(screen('screen-3'))).toEqual({ items: [screen('screen-3')], primary: screen('screen-3') })
    expect(multi.items).toHaveLength(2)
  })

  it('SEL-02: Ctrl+click adds and makes the added item primary', () => {
    const state = toggleSelection(selectSingle(screen('screen-1')), screen('screen-2'))
    expect(state.items).toEqual([screen('screen-1'), screen('screen-2')])
    expect(state.primary).toEqual(screen('screen-2'))
  })

  it('SEL-03: Ctrl+click removes and deterministically replaces primary', () => {
    const state = toggleSelection(
      toggleSelection(selectSingle(screen('screen-1')), screen('screen-2')),
      screen('screen-2'),
    )
    expect(state.items).toEqual([screen('screen-1')])
    expect(state.primary).toEqual(screen('screen-1'))
    expect(toggleSelection(state, screen('screen-1'))).toEqual({ items: [], primary: null })
  })

  it('SEL-05: primary is always the last added item', () => {
    let state = emptySelection()
    for (const id of ['screen-1', 'screen-2', 'screen-3']) {
      state = toggleSelection(state, screen(id))
      expect(state.primary).toEqual(screen(id))
    }
    expect(selectedScreenIds(state)).toEqual(['screen-1', 'screen-2', 'screen-3'])
  })

  it('SEL-06: repair drops dead items and keeps a live primary', () => {
    const state: SelectionState = { items: [screen('screen-1'), screen('screen-9')], primary: screen('screen-9') }
    const repaired = repairSelection(state, item => item.type === 'screen' && item.id !== 'screen-9')
    expect(repaired.items).toEqual([screen('screen-1')])
    expect(repaired.primary).toEqual(screen('screen-1'))
  })
})

describe('box selection (BOX-01–BOX-06)', () => {
  it('BOX-01: intersection rule selects the expected screens in project order', () => {
    const project = createDemoProject()
    const matched = screensInRect(project, rect(-10, -10, 1100, 400))
    expect(matched.map(s => s.screen.id)).toEqual(['screen-1', 'screen-2'])
    expect(screensInRect(project, rect(-10, -10, 690, 400)).map(s => s.screen.id)).toEqual(['screen-1'])
  })

  it('BOX-01: edge touch counts as intersection', () => {
    const project = createDemoProject()
    expect(rectsIntersect({ left: 100, top: 0, right: 100, bottom: 10, width: 0, height: 10 }, { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 })).toBe(true)
    expect(rectsIntersect({ left: 101, top: 0, right: 101, bottom: 10, width: 0, height: 10 }, { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 })).toBe(false)
    expect(screensInRect(project, rect(512, 0, 700, 100)).map(s => s.screen.id)).toContain('screen-1')
  })

  it('BOX-02/05: plain box replaces; empty plain box clears primary', () => {
    const previous = toggleSelection(selectSingle(screen('screen-3')), screen('screen-2'))
    const replaced = applyBoxSelection(previous, [screen('screen-1')], false)
    expect(replaced.items).toEqual([screen('screen-1')])
    expect(replaced.primary).toEqual(screen('screen-1'))
    expect(applyBoxSelection(previous, [], false)).toEqual({ items: [], primary: null })
  })

  it('BOX-03: Ctrl+box merges without duplicates and keeps primary when nothing new', () => {
    const previous = selectSingle(screen('screen-1'))
    const merged = applyBoxSelection(previous, [screen('screen-1'), screen('screen-2')], true)
    expect(merged.items).toEqual([screen('screen-1'), screen('screen-2')])
    expect(merged.primary).toEqual(screen('screen-2'))
    expect(applyBoxSelection(merged, [screen('screen-1')], true)).toBe(merged)
  })
})

describe('group move (MOV-01–MOV-05)', () => {
  it('MOV-02/03: drag moves the whole set by one delta with offsets preserved', () => {
    const project = createDemoProject()
    const next = moveScreens(project, ['screen-1', 'screen-3'], 50, -20)
    expect(at(next, 'screen-1').x).toBe(at(project, 'screen-1').x + 50)
    expect(at(next, 'screen-1').y).toBe(at(project, 'screen-1').y - 20)
    expect(at(next, 'screen-3').x).toBe(at(project, 'screen-3').x + 50)
    expect(at(next, 'screen-3').y).toBe(at(project, 'screen-3').y - 20)
    expect(at(next, 'screen-2').x).toBe(at(project, 'screen-2').x)
    expect(at(next, 'screen-2').y).toBe(at(project, 'screen-2').y)
    expect(at(next, 'screen-3').x - at(next, 'screen-1').x)
      .toBe(at(project, 'screen-3').x - at(project, 'screen-1').x)
  })

  it('MOV-04: untouched screens keep their references', () => {
    const project = createDemoProject()
    const next = moveScreens(project, ['screen-1'], 5, 5)
    expect(next.screens[1]).toBe(project.screens[1])
    expect(next.screens[2]).toBe(project.screens[2])
    expect(next.screens[0]).not.toBe(project.screens[0])
  })

  it('MOV-05/NUD-04/DEL-04: locked mix blocks the whole group operation', () => {
    expect(groupActionBlocker(['screen-2'], ['screen-1', 'screen-2'])).toBe('Selection contains a locked Screen.')
    expect(groupActionBlocker(['screen-2'], ['screen-1'])).toBeNull()
    expect(groupActionBlocker([], ['screen-1'])).toBeNull()
  })
})

describe('duplicate (DUP-01–DUP-07)', () => {
  it('DUP-01/02: new Screen/Grid IDs with a fresh cabinet namespace and preserved config', () => {
    const project = createDemoProject()
    const source = findScreen(project, 'screen-1')!
    const { project: next, newIds } = duplicateScreens(project, ['screen-1'])
    expect(newIds).toEqual(['screen-4'])
    const copy = findScreen(next, 'screen-4')!
    expect(copy.grid.id).not.toBe(source.grid.id)
    expect(copy.cabinets.map(c => c.id)).toEqual(source.cabinets.map(c => c.id))
    expect(copy.cabinets).toHaveLength(source.cabinets.length)
    expect(copy.grid.columns).toBe(source.grid.columns)
    expect(copy.grid.rows).toBe(source.grid.rows)
    expect(copy.grid.ordering).toEqual(source.grid.ordering)
    expect(copy.grid.cabinetWidth).toBe(source.grid.cabinetWidth)
    expect(copy.nextCabinetSerial).toBe(source.nextCabinetSerial)
  })

  it('DUP-03: deterministic +32/+32 placement with relative offsets preserved', () => {
    const project = createDemoProject()
    const { project: next, newIds } = duplicateScreens(project, ['screen-1', 'screen-2'])
    expect(newIds).toEqual(['screen-4', 'screen-5'])
    const first = findScreen(next, 'screen-1')!
    const second = findScreen(next, 'screen-2')!
    const copyA = findScreen(next, 'screen-4')!
    const copyB = findScreen(next, 'screen-5')!
    expect([copyA.x, copyA.y]).toEqual([first.x + 32, first.y + 32])
    expect([copyB.x - copyA.x, copyB.y - copyA.y]).toEqual([second.x - first.x, second.y - first.y])
  })

  it('DUP-05: sources keep references and identity', () => {
    const project = createDemoProject()
    const { project: next } = duplicateScreens(project, ['screen-1'])
    expect(next.screens[0]).toBe(project.screens[0])
    expect(next.screens[1]).toBe(project.screens[1])
    expect(findScreen(next, 'screen-1')!.cabinets.map(c => c.id))
      .toEqual(findScreen(project, 'screen-1')!.cabinets.map(c => c.id))
  })

  it('DUP-07: original identity is unchanged and copies do not collide', () => {
    const project = createDemoProject()
    const { project: next, newIds } = duplicateScreens(project, ['screen-2'])
    const ids = next.screens.map(s => s.screen.id)
    expect(new Set(ids).size).toBe(ids.length)
    const gridIds = next.screens.map(s => s.grid.id)
    expect(new Set(gridIds).size).toBe(gridIds.length)
    expect(newIds).toEqual(['screen-4'])
  })
})

describe('delete (DEL-01–DEL-05)', () => {
  it('DEL-01/02: selected removed, others keep references', () => {
    const project = createDemoProject()
    const next = removeScreens(project, ['screen-1', 'screen-3'])
    expect(next.screens.map(s => s.screen.id)).toEqual(['screen-2'])
    expect(next.screens[0]).toBe(project.screens[1])
  })

  it('DEL-03: repair keeps only live items with a deterministic primary', () => {
    const state: SelectionState = { items: [screen('screen-1'), screen('screen-2')], primary: screen('screen-2') }
    const repaired = repairSelection(state, item => item.type === 'screen' && item.id === 'screen-2')
    expect(repaired.items).toEqual([screen('screen-2')])
    expect(repaired.primary).toEqual(screen('screen-2'))
  })
})

describe('lock storage (LCK-07) and screen index allocation', () => {
  it('LCK-07: lock lives outside the Project value', () => {
    expect(createDemoProject()).not.toHaveProperty('locked')
    expect(createDemoProject()).not.toHaveProperty('lockedScreenIds')
  })

  it('delete highest then add/duplicate produces no live ID collision', () => {
    const project = createDemoProject()
    const reduced = removeScreens(project, ['screen-3'])
    expect(nextScreenIndex(reduced)).toBe(3)
    const { project: duplicated, newIds } = duplicateScreens(reduced, ['screen-1'])
    expect(newIds).toEqual(['screen-3'])
    expect(duplicated.screens.map(s => s.screen.id)).toEqual(['screen-1', 'screen-2', 'screen-3'])
  })
})
