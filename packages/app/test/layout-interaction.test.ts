import { describe, expect, it } from 'vitest'
import {
  addGuide, alignScreens, clampPositionToOrigin, clampTranslationToOrigin, distributeScreens, guideHitTest, guidePositions, integerCoordinate, marqueeSelection,
  moveGuide, normalizeSelectionBox, nudgePositions, removeGuide, replaceOrToggleSelection, selectionBounds,
  setGuideLocked, snapCoordinateToGrid, snapTranslation,
  type LayoutRect,
} from '../src/renderer/layout-interaction.js'

const screens: LayoutRect[] = [
  { id: 'a', x: -120, y: 40, width: 100, height: 80 },
  { id: 'b', x: 40, y: 100, width: 80, height: 60 },
  { id: 'c', x: 220, y: -20, width: 120, height: 100 },
]

describe('Layout interaction math', () => {
  it('rounds pointer coordinates deterministically and rejects unsafe values', () => {
    expect(integerCoordinate(10.49)).toBe(10)
    expect(integerCoordinate(-10.5)).toBe(-10)
    expect(integerCoordinate(-10.51)).toBe(-11)
    expect(() => integerCoordinate(Number.POSITIVE_INFINITY)).toThrow(/finite/)
    expect(() => integerCoordinate(Number.MAX_VALUE)).toThrow(/safe integer/)
  })

  it('replaces, adds and removes Screen selection without duplicates', () => {
    expect(replaceOrToggleSelection(['a', 'b'], 'c', false)).toEqual(['c'])
    expect(replaceOrToggleSelection(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(replaceOrToggleSelection(['a', 'b'], 'a', true)).toEqual(['b'])
  })

  it('normalizes marquee direction and selects intersecting Screens', () => {
    expect(normalizeSelectionBox({ x: 150, y: 180 }, { x: -140, y: 20 })).toEqual({ left: -140, top: 20, right: 150, bottom: 180 })
    expect(marqueeSelection(screens, { x: -140, y: 20 }, { x: 150, y: 180 })).toEqual(['a', 'b'])
    expect(marqueeSelection(screens, { x: 200, y: -40 }, { x: 360, y: 100 }, ['a'])).toEqual(['a', 'c'])
  })

  it('computes bounds for a multi-selection', () => {
    expect(selectionBounds(screens)).toEqual({ id: 'selection', x: -120, y: -20, width: 460, height: 180 })
    expect(selectionBounds([])).toBeNull()
  })

  it('snaps signed coordinates to a configurable integer grid', () => {
    expect(snapCoordinateToGrid(23, 10)).toBe(20)
    expect(snapCoordinateToGrid(-26, 10)).toBe(-30)
    expect(() => snapCoordinateToGrid(20, 0)).toThrow(/positive whole number/)
  })

  it('combines Grid Snap with nearest edge and center Smart Snap candidates', () => {
    const edge = snapTranslation({
      moving: { id: 'moving', x: 0, y: 0, width: 100, height: 80 },
      targets: [{ id: 'target', x: 208, y: 3, width: 100, height: 80 }],
      dx: 103,
      dy: 0,
      gridStep: 10,
      tolerance: 10,
    })
    expect(edge).toEqual({ dx: 108, dy: 3, guides: [{ axis: 'x', value: 208 }, { axis: 'y', value: 3 }] })

    const center = snapTranslation({
      moving: { id: 'moving', x: 0, y: 0, width: 100, height: 100 },
      targets: [{ id: 'target', x: 200, y: 200, width: 200, height: 200 }],
      dx: 249,
      dy: 251,
      smartSnap: true,
      tolerance: 2,
    })
    expect(center).toEqual({ dx: 250, dy: 250, guides: [{ axis: 'x', value: 300 }, { axis: 'y', value: 300 }] })
  })

  it('nudges every selected Screen by exact integer pixels', () => {
    expect(nudgePositions({ a: { x: 2, y: 14 }, b: { x: 8, y: 20 } }, ['a', 'b'], 1, -10)).toEqual({
      a: { x: 3, y: 4 },
      b: { x: 9, y: 10 },
    })
  })

  it('clamps group translation and positions to the origin', () => {
    expect(clampTranslationToOrigin({ x: 5, y: 3 }, -10, -10)).toEqual({ dx: -5, dy: -3 })
    expect(clampTranslationToOrigin({ x: 0, y: 0 }, -1, -1)).toEqual({ dx: 0, dy: 0 })
    expect(clampTranslationToOrigin({ x: 10, y: 10 }, 5, -4)).toEqual({ dx: 5, dy: -4 })
    expect(clampPositionToOrigin({ x: -12, y: -7 })).toEqual({ x: 0, y: 0 })
    expect(nudgePositions({ a: { x: 0, y: 0 }, b: { x: 8, y: 10 } }, ['a', 'b'], -1, -5)).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 8, y: 10 },
    })
    expect(nudgePositions({ a: { x: 5, y: 5 } }, ['a'], -10, -10)).toEqual({ a: { x: 0, y: 0 } })
  })

  it.each([
    ['left', { a: { x: 0, y: 40 }, b: { x: 0, y: 100 }, c: { x: 0, y: 0 } }],
    ['right', { a: { x: 240, y: 40 }, b: { x: 260, y: 100 }, c: { x: 220, y: 0 } }],
    ['top', { a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, c: { x: 220, y: 0 } }],
    ['bottom', { a: { x: 0, y: 80 }, b: { x: 40, y: 100 }, c: { x: 220, y: 60 } }],
  ] as const)('aligns Screens to %s', (mode, expected) => {
    expect(alignScreens(screens, mode)).toEqual(expected)
  })

  it('aligns centers while preserving integer source coordinates', () => {
    expect(alignScreens(screens, 'horizontal-center')).toEqual({
      a: { x: 60, y: 40 }, b: { x: 70, y: 100 }, c: { x: 50, y: 0 },
    })
    expect(alignScreens(screens, 'vertical-center')).toEqual({
      a: { x: 0, y: 30 }, b: { x: 40, y: 40 }, c: { x: 220, y: 20 },
    })
  })

  it('distributes Screens between fixed outer bounds', () => {
    expect(distributeScreens(screens, 'horizontal')).toEqual({
      a: { x: 0, y: 40 }, b: { x: 60, y: 100 }, c: { x: 220, y: 0 },
    })
    expect(distributeScreens(screens, 'vertical')).toEqual({
      a: { x: 0, y: 50 }, b: { x: 40, y: 100 }, c: { x: 220, y: 0 },
    })
    expect(distributeScreens(screens.slice(0, 2), 'horizontal')).toEqual({
      a: { x: 0, y: 40 }, b: { x: 40, y: 100 },
    })
  })

  it('never returns negative positions from align or distribute', () => {
    const negative: LayoutRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 80 },
      { id: 'b', x: 5, y: 5, width: 80, height: 60 },
      { id: 'c', x: 10, y: 10, width: 120, height: 100 },
    ]
    for (const mode of ['left', 'right', 'top', 'bottom', 'horizontal-center', 'vertical-center'] as const) {
      for (const position of Object.values(alignScreens(negative, mode))) {
        expect(position.x).toBeGreaterThanOrEqual(0)
        expect(position.y).toBeGreaterThanOrEqual(0)
      }
    }
    for (const axis of ['horizontal', 'vertical'] as const) {
      for (const position of Object.values(distributeScreens(negative, axis))) {
        expect(position.x).toBeGreaterThanOrEqual(0)
        expect(position.y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('snaps edges and centers independently through snap sources', () => {
    const moving = { id: 'moving', x: 0, y: 0, width: 100, height: 100 }
    const targets = [{ id: 'target', x: 200, y: 200, width: 200, height: 200 }]
    const edgesOnly = snapTranslation({
      moving, targets, dx: 103, dy: 103, snapEdges: true, snapCenters: false, tolerance: 10,
    })
    expect(edgesOnly.dx).toBe(100)
    expect(edgesOnly.dy).toBe(100)
    expect(edgesOnly.guides).toEqual([{ axis: 'x', value: 200 }, { axis: 'y', value: 200 }])
    const centersOnly = snapTranslation({
      moving, targets, dx: 249, dy: 251, snapEdges: false, snapCenters: true, tolerance: 2,
    })
    expect(centersOnly).toEqual({ dx: 250, dy: 250, guides: [{ axis: 'x', value: 300 }, { axis: 'y', value: 300 }] })
    const neither = snapTranslation({
      moving, targets, dx: 103, dy: 103, snapEdges: false, snapCenters: false, tolerance: 10,
    })
    expect(neither).toEqual({ dx: 103, dy: 103, guides: [] })
  })

  it('snaps Screen bounds to persistent guides', () => {
    const guided = snapTranslation({
      moving: { id: 'moving', x: 0, y: 0, width: 100, height: 80 },
      targets: [],
      dx: 96,
      dy: 47,
      snapEdges: false,
      snapCenters: false,
      guideTargets: { vertical: [100], horizontal: [50] },
      tolerance: 10,
    })
    expect(guided).toEqual({ dx: 100, dy: 50, guides: [{ axis: 'x', value: 100 }, { axis: 'y', value: 50 }] })
  })

  it('manages persistent guides without touching Screens', () => {
    const vertical = addGuide([], 'vertical', 120.4)
    expect(vertical).toHaveLength(1)
    expect(vertical[0]).toMatchObject({ orientation: 'vertical', position: 120, locked: false })
    const horizontal = addGuide(vertical, 'horizontal', -40.6)
    expect(horizontal).toHaveLength(2)
    expect(horizontal[1]).toMatchObject({ orientation: 'horizontal', position: -41 })
    expect(horizontal[0]?.id).not.toBe(horizontal[1]?.id)
    const moved = moveGuide(horizontal, horizontal[0]!.id, 200.2)
    expect(moved[0]?.position).toBe(200)
    expect(moved[1]).toEqual(horizontal[1])
    const locked = setGuideLocked(moved, moved[0]!.id, true)
    expect(moveGuide(locked, locked[0]!.id, 300).map(guide => guide.position)).toEqual([200, -41])
    expect(removeGuide(locked, locked[0]!.id).map(guide => guide.id)).toEqual([locked[1]!.id])
  })

  it('hit-tests the topmost unlocked guide within tolerance', () => {
    const guides = addGuide(addGuide([], 'vertical', 100), 'horizontal', 50)
    expect(guideHitTest(guides, { x: 104, y: 200 }, 8)?.orientation).toBe('vertical')
    expect(guideHitTest(guides, { x: 500, y: 55 }, 8)?.orientation).toBe('horizontal')
    expect(guideHitTest(guides, { x: 500, y: 500 }, 8)).toBeNull()
    const locked = setGuideLocked(guides, guides[0]!.id, true)
    expect(guideHitTest(locked, { x: 104, y: 200 }, 8)).toEqual(locked[0])
    expect(guidePositions(guides)).toEqual({ vertical: [100], horizontal: [50] })
  })
})
