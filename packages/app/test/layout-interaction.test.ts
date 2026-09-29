import { describe, expect, it } from 'vitest'
import {
  alignScreens, distributeScreens, integerCoordinate, marqueeSelection, normalizeSelectionBox,
  nudgePositions, replaceOrToggleSelection, selectionBounds, snapCoordinateToGrid, snapTranslation,
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
    expect(nudgePositions({ a: { x: -2, y: 4 }, b: { x: 8, y: 10 } }, ['a', 'b'], 1, -10)).toEqual({
      a: { x: -1, y: -6 },
      b: { x: 9, y: 0 },
    })
  })

  it.each([
    ['left', { a: { x: -120, y: 40 }, b: { x: -120, y: 100 }, c: { x: -120, y: -20 } }],
    ['right', { a: { x: 240, y: 40 }, b: { x: 260, y: 100 }, c: { x: 220, y: -20 } }],
    ['top', { a: { x: -120, y: -20 }, b: { x: 40, y: -20 }, c: { x: 220, y: -20 } }],
    ['bottom', { a: { x: -120, y: 80 }, b: { x: 40, y: 100 }, c: { x: 220, y: 60 } }],
  ] as const)('aligns Screens to %s', (mode, expected) => {
    expect(alignScreens(screens, mode)).toEqual(expected)
  })

  it('aligns centers while preserving integer source coordinates', () => {
    expect(alignScreens(screens, 'horizontal-center')).toEqual({
      a: { x: 60, y: 40 }, b: { x: 70, y: 100 }, c: { x: 50, y: -20 },
    })
    expect(alignScreens(screens, 'vertical-center')).toEqual({
      a: { x: -120, y: 30 }, b: { x: 40, y: 40 }, c: { x: 220, y: 20 },
    })
  })

  it('distributes Screens between fixed outer bounds', () => {
    expect(distributeScreens(screens, 'horizontal')).toEqual({
      a: { x: -120, y: 40 }, b: { x: 60, y: 100 }, c: { x: 220, y: -20 },
    })
    expect(distributeScreens(screens, 'vertical')).toEqual({
      a: { x: -120, y: 50 }, b: { x: 40, y: 100 }, c: { x: 220, y: -20 },
    })
    expect(distributeScreens(screens.slice(0, 2), 'horizontal')).toEqual({
      a: { x: -120, y: 40 }, b: { x: 40, y: 100 },
    })
  })
})
